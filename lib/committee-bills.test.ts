import { describe, expect, it } from "vitest";
import {
  chamberForCommittee,
  committeeRoster,
  DOCKET_CAP,
  isReferredPending,
  selectPendingBills,
  systemCodeFor,
  type RawCommitteeBill,
} from "./committee-bills";
import type { CommitteeAssignment } from "./types";

// A real (trimmed) Congress.gov committee-bills response for House Agriculture,
// hand-picked to cover every relationshipType + both casings + a malformed row.
import fixture from "./__fixtures__/committee-bills-hsag00.json";

const ROWS = (fixture as { "committee-bills": { bills: RawCommitteeBill[] } })[
  "committee-bills"
].bills;

describe("isReferredPending", () => {
  it("accepts both API casings of 'Referred To'", () => {
    expect(isReferredPending("Referred To")).toBe(true); // full committee
    expect(isReferredPending("Referred to")).toBe(true); // subcommittee
    expect(isReferredPending("  referred to  ")).toBe(true);
  });
  it("rejects relationships that mean the bill moved on", () => {
    for (const t of ["Discharged From", "Reported By", "Markup By", "Unknown", undefined]) {
      expect(isReferredPending(t)).toBe(false);
    }
  });
});

describe("systemCodeFor", () => {
  it("appends '00' for a full committee and passes a subcommittee through", () => {
    expect(systemCodeFor("HSAG", false)).toBe("hsag00");
    expect(systemCodeFor("HSAG16", true)).toBe("hsag16");
    expect(systemCodeFor("SSJU", false)).toBe("ssju00");
  });
});

describe("chamberForCommittee", () => {
  it("maps the leading letter to a chamber, null for joint", () => {
    expect(chamberForCommittee("HSAG")).toBe("house");
    expect(chamberForCommittee("SSJU")).toBe("senate");
    expect(chamberForCommittee("JSPR")).toBeNull(); // joint → no docket expander
  });
});

describe("selectPendingBills", () => {
  const docket = selectPendingBills(ROWS, "house", "hsag00");

  it("carries the Congress.gov committee page url", () => {
    expect(docket.committeeUrl).toBe(
      "https://www.congress.gov/committee/house-committee/hsag00",
    );
  });

  it("keeps only bills still referred (both casings), excluding discharged/reported/markup", () => {
    // Fixture has 6 valid pending rows (numbers 34, 112, 9586, 9572, 9649, 9999);
    // the missing-number 'Referred To' row and every non-referred row are excluded.
    const numbers = docket.bills.map((b) => b.number);
    expect(numbers).toContain("9649");
    expect(numbers).toContain("9999"); // subcommittee-cased 'Referred to'
    for (const gone of ["183", "4550", "3633", "7567"]) {
      expect(numbers).not.toContain(gone);
    }
    expect(docket.totalReferred).toBe(6);
  });

  it("sorts most-recently-referred first", () => {
    const dates = docket.bills.map((b) => b.referredDate ?? "");
    expect([...dates]).toEqual([...dates].sort().reverse());
    expect(docket.bills[0].number).toBe("9999"); // referred 2026-07-14, newest
  });

  it("formats displayId and Congress.gov url from type/number/congress", () => {
    const b = docket.bills.find((x) => x.number === "9649")!;
    expect(b.displayId).toBe("H.R. 9649");
    expect(b.billId).toBe("hr-9649-119");
    expect(b.url).toBe("https://www.congress.gov/bill/119th-congress/house-bill/9649");
    expect(b.title).toBe("H.R. 9649"); // placeholder until enriched with the real title
  });

  it("caps at DOCKET_CAP and reports the true total", () => {
    const many: RawCommitteeBill[] = Array.from({ length: 25 }, (_, i) => ({
      congress: 119,
      type: "HR",
      number: String(1000 + i),
      actionDate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      relationshipType: "Referred To",
    }));
    const d = selectPendingBills(many, "house", "hsag00");
    expect(d.bills).toHaveLength(DOCKET_CAP);
    expect(d.totalReferred).toBe(25);
  });

  it("returns an empty docket (not a throw) for a committee with nothing pending", () => {
    const d = selectPendingBills(
      [{ congress: 119, type: "HR", number: "1", relationshipType: "Reported By" }],
      "house",
      "hsag00",
    );
    expect(d.bills).toEqual([]);
    expect(d.totalReferred).toBe(0);
  });
});

describe("committeeRoster", () => {
  const assign = (code: string, isSubcommittee: boolean): CommitteeAssignment => ({
    code,
    name: code,
    role: "Member",
    isSubcommittee,
    parentName: null,
    parentCode: null,
  });

  it("derives the distinct chamber+systemCode set, dedupes, and drops joint committees", () => {
    const index = new Map<string, CommitteeAssignment[]>([
      ["A", [assign("HSAG", false), assign("HSAG16", true)]],
      ["B", [assign("HSAG", false), assign("SSJU", false), assign("JSPR", false)]],
    ]);
    const roster = committeeRoster(index);
    // HSAG (shared by A+B) appears once; JSPR (joint) is dropped.
    expect(roster).toEqual([
      { chamber: "house", systemCode: "hsag00" },
      { chamber: "house", systemCode: "hsag16" },
      { chamber: "senate", systemCode: "ssju00" },
    ]);
  });

  it("is empty for an empty index", () => {
    expect(committeeRoster(new Map())).toEqual([]);
  });
});
