import { describe, expect, it, vi } from "vitest";
import {
  buildDigestSource,
  buildGroundedSource,
  digestHash,
  introducedTextVersionDate,
  isAmendedSince,
  isUsableSummary,
  latestTextVersionDate,
  selectCrsSummary,
  sourceHash,
  stripHtml,
  summarizeBill,
  summarizeRepDigest,
} from "./summaries";
import type { RawCrsSummary, RawTextVersion } from "./summaries";
import { MemoryCache } from "./cache";

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
  it("returns the CRS text (plain) when a summary exists", () => {
    const r = selectCrsSummary(crs2715);
    expect(r).not.toBeNull();
    expect(r!.text).toContain("Destruction of Hazardous Imports Act");
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

describe("buildGroundedSource", () => {
  it("uses the CRS summary on the primary path", () => {
    const r = buildGroundedSource({ title: "X Act", crsText: "This bill would do Y." });
    expect(r.basis).toBe("crs");
    expect(r.sourceText).toContain("CRS");
    expect(r.sourceText).toContain("This bill would do Y.");
  });
  it("falls back to title + sponsor when no CRS", () => {
    const r = buildGroundedSource({ title: "X Act", sponsorName: "Sharice Davids" });
    expect(r.basis).toBe("bill-text");
    expect(r.sourceText).toContain("Sharice Davids");
  });
  it("emits no source when there is nothing to ground on", () => {
    expect(buildGroundedSource({ title: "" }).basis).toBe("none");
  });
});

describe("sourceHash", () => {
  it("is stable for identical input and flips when the text changes", () => {
    expect(sourceHash("crs", "abc")).toBe(sourceHash("crs", "abc"));
    expect(sourceHash("crs", "abc")).not.toBe(sourceHash("crs", "abd"));
  });
});

describe("isUsableSummary", () => {
  it("accepts a real plain-English summary", () => {
    expect(isUsableSummary("The bill would expand the FDA's authority over refused imports.")).toBe(true);
    expect(isUsableSummary("This resolution would designate June as National Annuity Awareness Month.")).toBe(true);
  });
  it("rejects model refusals / meta-commentary (observed live on opaque titles)", () => {
    expect(isUsableSummary("I cannot write a summary from the title alone, as I need actual legislative source material.")).toBe(false);
    expect(isUsableSummary("I can only summarize based on provided source material. Since no official summary or bill text is available, I cannot create an accurate description.")).toBe(false);
    expect(isUsableSummary("Please provide the bill text or an official description.")).toBe(false);
    expect(isUsableSummary("As an AI language model, I don't have enough context.")).toBe(false);
    expect(isUsableSummary("")).toBe(false);
  });
});

describe("summarizeBill", () => {
  const base = {
    billId: "hr-2715-119",
    title: "Destruction of Hazardous Imports Act",
    crsSummaries: crs2715,
    textVersions: tv5160,
  };

  it("generates from the CRS source, then serves the second call from cache", async () => {
    const cache = new MemoryCache();
    const generate = vi.fn().mockResolvedValue("The bill would expand FDA authority.");

    const first = await summarizeBill(base, { cache, generate });
    expect(first.basis).toBe("crs");
    expect(first.text).toBe("The bill would expand FDA authority.");
    expect(first.fromCache).toBe(false);
    expect(first.amendedSince).toBe(true); // reported version newer than introduced

    const second = await summarizeBill(base, { cache, generate });
    expect(second.fromCache).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1); // cached — no second LLM call
  });

  it("uses the bill-text fallback when there is no CRS summary", async () => {
    const generate = vi.fn().mockResolvedValue("The bill, per its title, addresses tribal nutrition input.");
    const r = await summarizeBill(
      { billId: "hr-9425-119", title: "Increasing Tribal Input on Nutrition Act", sponsorName: "Sharice Davids", crsSummaries: crs9425, textVersions: [] },
      { cache: new MemoryCache(), generate },
    );
    expect(r.basis).toBe("bill-text");
    expect(r.text).toContain("tribal");
  });

  it("degrades to structured-only when generation throws", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("LLM down"));
    const r = await summarizeBill(base, { cache: new MemoryCache(), generate });
    expect(r.text).toBeNull();
    expect(r.basis).toBe("none");
  });

  it("degrades to structured-only when the validator (Issue #6) rejects", async () => {
    const generate = vi.fn().mockResolvedValue("H.R. 9999 would spend $5 billion."); // unsourced facts
    const r = await summarizeBill(base, {
      cache: new MemoryCache(),
      generate,
      validate: () => false,
    });
    expect(r.text).toBeNull();
  });

  it("degrades to structured-only when the model refuses (opaque title)", async () => {
    const generate = vi.fn().mockResolvedValue(
      "I cannot write a summary from the title alone; I need the bill text.",
    );
    const r = await summarizeBill(
      { billId: "s-4801-119", title: "Duty Status Reform Act", crsSummaries: [], textVersions: [] },
      { cache: new MemoryCache(), generate },
    );
    expect(r.text).toBeNull();
  });

  it("is structured-only for a markup of a bill not yet in Congress.gov", async () => {
    const generate = vi.fn().mockResolvedValue("should not be called");
    const r = await summarizeBill({ ...base, billNotInCongress: true }, { cache: new MemoryCache(), generate });
    expect(r.text).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("per-rep digest", () => {
  const facts = {
    repName: "Sharice Davids",
    upcoming: [{ kind: "Markup", title: "Farm bill markup", date: "2026-07-16", role: "Committee Member" }],
    bills: [{ displayId: "H.R. 9425", title: "Tribal Nutrition Act", badge: "Primary sponsor" }],
  };

  it("builds a grounded source from structured facts only", () => {
    const src = buildDigestSource(facts);
    expect(src).toContain("Sharice Davids");
    expect(src).toContain("Farm bill markup");
    expect(src).toContain("H.R. 9425");
  });

  it("hash ignores order and is stable", () => {
    expect(digestHash(facts)).toBe(digestHash({ ...facts, bills: [...facts.bills] }));
  });

  it("generates then caches the digest", async () => {
    const cache = new MemoryCache();
    const generate = vi.fn().mockResolvedValue("This week Rep. Davids has a farm bill markup.");
    const a = await summarizeRepDigest("D000629", facts, { cache, generate });
    const b = await summarizeRepDigest("D000629", facts, { cache, generate });
    expect(a).toBe("This week Rep. Davids has a farm bill markup.");
    expect(b).toBe(a);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
