import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractBillSummary,
  fetchBillPolicyArea,
  introducedTextVersionDate,
  isAmendedSince,
  latestTextVersionDate,
  selectCrsSummary,
  stripHtml,
} from "./summaries";
import type { RawCrsSummary, RawTextVersion } from "./summaries";

// Real Congress.gov payloads.
import sum2715 from "./__fixtures__/summaries-hr2715.json"; // has a CRS summary
import sum9425 from "./__fixtures__/summaries-hr9425.json"; // no CRS yet
import txt5160 from "./__fixtures__/text-hr5160.json"; // Introduced + Reported (amended)

const crs2715 = (sum2715 as { summaries: RawCrsSummary[] }).summaries;
const crs9425 = (sum9425 as { summaries: RawCrsSummary[] }).summaries;
const tv5160 = (txt5160 as { textVersions: RawTextVersion[] }).textVersions;

describe("stripHtml", () => {
  it("strips tags, collapses whitespace, decodes entities", () => {
    expect(stripHtml("<p><strong>Act</strong></p><p>This  bill &amp; that</p>")).toBe(
      "Act This bill & that",
    );
  });
});

describe("selectCrsSummary", () => {
  it("returns the full CRS text (plain) verbatim when a summary exists", () => {
    const r = selectCrsSummary(crs2715);
    expect(r).not.toBeNull();
    expect(r!.text).toContain("Destruction of Hazardous Imports Act");
    expect(r!.text).toContain("90 days"); // full text preserved, not truncated
    expect(r!.text).not.toContain("<"); // HTML stripped
  });
  it("returns null for a bill with no CRS summary", () => {
    expect(selectCrsSummary(crs9425)).toBeNull();
  });
});

describe("text versions", () => {
  it("finds the newest and the introduced dates", () => {
    expect(latestTextVersionDate(tv5160)).toBe("2026-07-02T04:00:00Z");
    expect(introducedTextVersionDate(tv5160)).toBe("2025-09-04T04:00:00Z");
  });
  it("flags amended-since when a newer version exists than the basis", () => {
    expect(
      isAmendedSince(introducedTextVersionDate(tv5160), latestTextVersionDate(tv5160)),
    ).toBe(true);
    expect(isAmendedSince("2026-07-02T04:00:00Z", "2026-07-02T04:00:00Z")).toBe(false);
    expect(isAmendedSince(null, "2026-07-02")).toBe(false);
  });
});

describe("extractBillSummary (no LLM — verbatim CRS)", () => {
  it("returns the verbatim CRS text + version stamp + amended flag", () => {
    const r = extractBillSummary({
      billId: "hr-2715-119",
      crsSummaries: crs2715,
      textVersions: tv5160,
    });
    expect(r.text).toContain("expands the Food and Drug Administration");
    expect(r.text).toContain("90 days"); // nothing truncated away
    expect(r.basedOnDate).toBe("2025-09-04T04:00:00Z");
    expect(r.amendedSince).toBe(true);
  });

  it("is structured-only (no text) when there is no CRS summary — never infers from the title", () => {
    const r = extractBillSummary({
      billId: "hr-9425-119",
      crsSummaries: crs9425,
      textVersions: [],
    });
    expect(r.text).toBeNull();
  });

  it("is structured-only for a markup of a bill not yet in Congress.gov", () => {
    const r = extractBillSummary({
      billId: "hr-2715-119",
      crsSummaries: crs2715,
      textVersions: tv5160,
      billNotInCongress: true,
    });
    expect(r.text).toBeNull();
  });
});

describe("fetchBillPolicyArea", () => {
  const origKey = process.env.CONGRESS_GOV_API_KEY;
  beforeEach(() => {
    process.env.CONGRESS_GOV_API_KEY = "test-key";
  });
  afterEach(() => {
    process.env.CONGRESS_GOV_API_KEY = origKey;
    vi.restoreAllMocks();
  });

  it("returns the bill's top-level policy area name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ bill: { policyArea: { name: "Health" } } }))),
    );
    expect(await fetchBillPolicyArea(119, "hr", "139")).toBe("Health");
  });

  it("returns null when the bill has no policy area", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ bill: {} }))));
    expect(await fetchBillPolicyArea(119, "hr", "140")).toBeNull();
  });
});
