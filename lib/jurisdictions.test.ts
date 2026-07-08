import { describe, expect, it } from "vitest";
import {
  delegateBanner,
  houseRole,
  isNonVoting,
  normalizeDistrict,
  parseCongressNumber,
} from "./jurisdictions";

describe("isNonVoting", () => {
  it("flags DC and all five territories", () => {
    for (const s of ["DC", "PR", "GU", "VI", "AS", "MP"]) {
      expect(isNonVoting(s)).toBe(true);
    }
  });
  it("is case-insensitive and false for voting states", () => {
    expect(isNonVoting("dc")).toBe(true);
    expect(isNonVoting("KS")).toBe(false);
    expect(isNonVoting("WY")).toBe(false);
  });
});

describe("normalizeDistrict", () => {
  it("maps Geocodio's at-large delegate code 98 to Congress.gov 0", () => {
    expect(normalizeDistrict(98)).toBe(0);
  });
  it("passes numbered and voting-at-large (0) districts through unchanged", () => {
    expect(normalizeDistrict(2)).toBe(2);
    expect(normalizeDistrict(0)).toBe(0);
    expect(normalizeDistrict(36)).toBe(36);
  });
});

describe("houseRole", () => {
  it("labels voting states as representative", () => {
    expect(houseRole("KS")).toBe("representative");
    expect(houseRole("WY")).toBe("representative");
  });
  it("labels PR as resident-commissioner and other non-voting as delegate", () => {
    expect(houseRole("PR")).toBe("resident-commissioner");
    expect(houseRole("DC")).toBe("delegate");
    expect(houseRole("GU")).toBe("delegate");
  });
});

describe("delegateBanner", () => {
  it("returns null for a voting state", () => {
    expect(delegateBanner("KS", "Derek Schmidt")).toBeNull();
  });
  it("explains DC has no Senate representation", () => {
    const b = delegateBanner("DC", "Eleanor Holmes Norton");
    expect(b).toContain("Delegate Eleanor Holmes Norton");
    expect(b).toContain("committee but not on the House floor");
    expect(b).toContain("no Senate representation");
  });
  it("uses Resident Commissioner wording for PR", () => {
    const b = delegateBanner("PR", "Pablo Jose Hernández");
    expect(b).toContain("Resident Commissioner");
    expect(b).toContain("Puerto Rico has no Senate representation");
  });
});

describe("parseCongressNumber", () => {
  it("parses Geocodio labels", () => {
    expect(parseCongressNumber("119th")).toBe(119);
    expect(parseCongressNumber("120th")).toBe(120);
  });
  it("returns null for missing/malformed labels", () => {
    expect(parseCongressNumber(null)).toBeNull();
    expect(parseCongressNumber(undefined)).toBeNull();
    expect(parseCongressNumber("nope")).toBeNull();
  });
});
