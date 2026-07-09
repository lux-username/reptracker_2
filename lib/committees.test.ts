import { describe, expect, it } from "vitest";
import { buildAssignmentIndex, roleFromTitle } from "./committees";
import type { RawCommittee, RawMembership } from "./committees";

// Trimmed real congress-legislators payloads (Davids KS-03 + committee mates).
import membership from "./__fixtures__/committee-membership.json";
import committees from "./__fixtures__/committees-current.json";

const index = buildAssignmentIndex(
  membership as RawMembership,
  committees as RawCommittee[],
);

describe("roleFromTitle", () => {
  it("maps titles to structural roles, keeping Vice Chair distinct", () => {
    expect(roleFromTitle("Chair")).toBe("Chair");
    expect(roleFromTitle("Chairman")).toBe("Chair");
    expect(roleFromTitle("Ranking Member")).toBe("Ranking Member");
    expect(roleFromTitle("Vice Chair")).toBe("Vice Chair");
    expect(roleFromTitle(null)).toBe("Member");
    expect(roleFromTitle(undefined)).toBe("Member");
  });
});

describe("buildAssignmentIndex", () => {
  const davids = index.get("D000629") ?? [];

  it("indexes every committee a member sits on", () => {
    const codes = davids.map((a) => a.code).sort();
    expect(codes).toEqual(["HSAG", "HSAG14", "HSAG16", "HSPW", "HSPW05"]);
  });

  it("resolves full-committee display names and marks them not-subcommittees", () => {
    const hsag = davids.find((a) => a.code === "HSAG");
    expect(hsag?.name).toBe("House Committee on Agriculture");
    expect(hsag?.isSubcommittee).toBe(false);
    expect(hsag?.role).toBe("Member");
  });

  it("resolves subcommittee names + parent linkage and per-committee role", () => {
    const sub = davids.find((a) => a.code === "HSAG16");
    expect(sub?.isSubcommittee).toBe(true);
    expect(sub?.name).toBe("General Farm Commodities, Risk Management, and Credit");
    expect(sub?.parentCode).toBe("HSAG");
    expect(sub?.parentName).toBe("House Committee on Agriculture");
    // Davids is Ranking Member of this subcommittee though only a Member of HSAG.
    expect(sub?.role).toBe("Ranking Member");
  });

  it("orders a member's list with the full committee before its subcommittees", () => {
    const family = davids.filter((a) => a.code.startsWith("HSAG"));
    expect(family[0].code).toBe("HSAG"); // full committee leads its family
    expect(family.slice(1).every((a) => a.isSubcommittee)).toBe(true);
  });

  it("captures chairs and ranking members of other reps", () => {
    // T000467 chairs HSAG; C001119 is its ranking member.
    expect(index.get("T000467")?.find((a) => a.code === "HSAG")?.role).toBe("Chair");
    expect(index.get("C001119")?.find((a) => a.code === "HSAG")?.role).toBe(
      "Ranking Member",
    );
  });
});
