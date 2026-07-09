import { describe, expect, it } from "vitest";
import { JURISDICTIONS, currentCongress } from "./prewarm";

describe("JURISDICTIONS", () => {
  it("covers the 50 states plus DC and the five delegate territories", () => {
    expect(JURISDICTIONS).toHaveLength(56);
    for (const t of ["DC", "PR", "VI", "GU", "AS", "MP", "CA", "TX", "WY"]) {
      expect(JURISDICTIONS).toContain(t);
    }
  });

  it("has no duplicate codes", () => {
    expect(new Set(JURISDICTIONS).size).toBe(JURISDICTIONS.length);
  });
});

describe("currentCongress", () => {
  it("maps 2026 to the 119th Congress", () => {
    expect(currentCongress(new Date("2026-07-09T00:00:00Z"))).toBe(119);
  });

  it("rolls to the 120th at the start of 2027", () => {
    expect(currentCongress(new Date("2027-01-03T00:00:00Z"))).toBe(120);
  });
});
