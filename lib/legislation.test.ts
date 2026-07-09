import { describe, expect, it } from "vitest";
import { isProceduralMilestone, selectSecondaryBills } from "./legislation";
import type { RawLegislationItem } from "./legislation";

// Real Congress.gov sponsored/cosponsored payloads for Sharice Davids.
import sponsoredFx from "./__fixtures__/sponsored-D000629.json";
import cosponsoredFx from "./__fixtures__/cosponsored-D000629.json";

const NOW = new Date("2026-07-08T00:00:00Z");
const day = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

function bill(over: Partial<RawLegislationItem> & { number: string }): RawLegislationItem {
  return {
    congress: 119,
    type: "HR",
    title: `Test Act ${over.number}`,
    introducedDate: day(10),
    latestAction: { actionDate: day(10), text: "Referred to the Committee on Agriculture." },
    ...over,
  };
}

describe("isProceduralMilestone", () => {
  it("accepts procedural milestones", () => {
    expect(isProceduralMilestone("Referred to the House Committee on Agriculture.")).toBe(true);
    expect(isProceduralMilestone("Reported by the Committee on Ways and Means.")).toBe(true);
    expect(isProceduralMilestone("Passed/agreed to in House.")).toBe(true);
  });
  it("rejects cosponsor / sponsorship bookkeeping and empty text", () => {
    expect(isProceduralMilestone("ASSUMING FIRST SPONSORSHIP - Ms. Randall ...")).toBe(false);
    expect(isProceduralMilestone("Sponsor introductory remarks on measure.")).toBe(false);
    expect(isProceduralMilestone(null)).toBe(false);
    expect(isProceduralMilestone("")).toBe(false);
  });
});

describe("selectSecondaryBills — inclusion", () => {
  it("includes primary-sponsored bills from the last 60 days, drops older ones", () => {
    const out = selectSecondaryBills(
      [bill({ number: "1", introducedDate: day(30) }), bill({ number: "2", introducedDate: day(75) })],
      [],
      [],
      NOW,
    );
    expect(out.map((b) => b.number)).toEqual(["1"]);
    expect(out[0].badge).toBe("Primary sponsor");
  });

  it("includes cosponsored bills only with procedural activity in the last 30 days", () => {
    const out = selectSecondaryBills(
      [],
      [
        bill({ number: "10", latestAction: { actionDate: day(5), text: "Reported by committee." } }),
        // procedural but too old
        bill({ number: "11", latestAction: { actionDate: day(45), text: "Reported by committee." } }),
        // recent but not procedural (cosponsor bookkeeping)
        bill({ number: "12", latestAction: { actionDate: day(2), text: "ASSUMING FIRST SPONSORSHIP - ..." } }),
      ],
      [],
      NOW,
    );
    expect(out.map((b) => b.number)).toEqual(["10"]);
    expect(out[0].badge).toBe("Cosponsor");
  });
});

describe("selectSecondaryBills — sort + cap", () => {
  it("orders primary before cosponsor regardless of recency", () => {
    const out = selectSecondaryBills(
      [bill({ number: "p", introducedDate: day(59), latestAction: { actionDate: day(59), text: "Referred to committee." } })],
      [bill({ number: "c", latestAction: { actionDate: day(1), text: "Reported by committee." } })],
      [],
      NOW,
    );
    expect(out[0].number).toBe("p");
    expect(out[1].number).toBe("c");
  });

  it("within primaries, breaks ties by in-rep-committee then recency", () => {
    const out = selectSecondaryBills(
      [
        bill({ number: "far", latestAction: { actionDate: day(3), text: "Referred to the Committee on Foreign Affairs." } }),
        bill({ number: "ag", latestAction: { actionDate: day(4), text: "Referred to the Committee on Agriculture." } }),
      ],
      [],
      ["House Committee on Agriculture"],
      NOW,
    );
    // "ag" is in the rep's committee, so it outranks the more-recent "far".
    expect(out[0].number).toBe("ag");
  });

  it("caps the list at 7", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      bill({ number: String(i), introducedDate: day(i) }),
    );
    expect(selectSecondaryBills(many, [], [], NOW)).toHaveLength(7);
  });

  it("builds display id and public URL", () => {
    const [b] = selectSecondaryBills([bill({ number: "9425", type: "HR" })], [], [], NOW);
    expect(b.displayId).toBe("H.R. 9425");
    expect(b.url).toBe("https://www.congress.gov/bill/119th-congress/house-bill/9425");
    expect(b.billId).toBe("hr-9425-119");
  });
});

describe("selectSecondaryBills — real fixture invariants", () => {
  const sponsored = (sponsoredFx as { sponsoredLegislation: RawLegislationItem[] })
    .sponsoredLegislation;
  const cosponsored = (cosponsoredFx as { cosponsoredLegislation: RawLegislationItem[] })
    .cosponsoredLegislation;
  const out = selectSecondaryBills(
    sponsored,
    cosponsored,
    ["House Committee on Agriculture", "House Committee on Transportation and Infrastructure"],
    NOW,
  );

  it("never exceeds the cap and every item carries a valid badge + id", () => {
    expect(out.length).toBeLessThanOrEqual(7);
    for (const b of out) {
      expect(["Primary sponsor", "Cosponsor"]).toContain(b.badge);
      expect(b.displayId).toMatch(/^[A-Z]/);
      expect(b.url).toContain("congress.gov");
    }
  });

  it("lists all primary sponsors ahead of any cosponsor", () => {
    const firstCosponsor = out.findIndex((b) => b.badge === "Cosponsor");
    const lastPrimary = out.map((b) => b.badge).lastIndexOf("Primary sponsor");
    if (firstCosponsor !== -1 && lastPrimary !== -1) {
      expect(lastPrimary).toBeLessThan(firstCosponsor);
    }
  });
});
