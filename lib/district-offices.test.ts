import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatDistrictOfficeAddress,
  isPhoneLike,
  parseDistrictOfficeIndex,
  pickDistrictOffice,
} from "./district-offices";

// A trimmed slice of the real unitedstates/congress-legislators dataset:
//   A000055 — first office has a phone (Cullman)
//   C001125 — first office has NO phone (Gretna) → pick must skip to the next
const raw = JSON.parse(
  readFileSync(join(process.cwd(), "lib", "__fixtures__", "district-offices.json"), "utf-8"),
);

describe("isPhoneLike", () => {
  it("accepts 10-digit and 1-prefixed 11-digit numbers", () => {
    expect(isPhoneLike("256-734-6043")).toBe(true);
    expect(isPhoneLike("(504) 381-3970")).toBe(true);
    expect(isPhoneLike("1-202-225-4131")).toBe(true);
  });
  it("rejects non-phone strings", () => {
    expect(isPhoneLike(undefined)).toBe(false);
    expect(isPhoneLike("")).toBe(false);
    expect(isPhoneLike("call the office")).toBe(false);
    expect(isPhoneLike("12345")).toBe(false); // too short
  });
});

describe("formatDistrictOfficeAddress", () => {
  it("assembles address, suite/building, city, state zip", () => {
    expect(
      formatDistrictOfficeAddress({
        address: "205 4th Ave. NE",
        suite: "Suite 104",
        city: "Cullman",
        state: "AL",
        zip: "35055",
      }),
    ).toBe("205 4th Ave. NE, Suite 104, Cullman, AL 35055");
  });
  it("returns null when there are no address parts", () => {
    expect(formatDistrictOfficeAddress({})).toBeNull();
  });
});

describe("pickDistrictOffice", () => {
  it("returns the first office carrying a valid phone", () => {
    const picked = pickDistrictOffice([
      { city: "Gretna", state: "LA" }, // no phone → skip
      { city: "New Orleans", state: "LA", phone: "504-381-3970", address: "500 Poydras St." },
    ]);
    expect(picked).toEqual({
      phone: "504-381-3970",
      address: "500 Poydras St., New Orleans, LA",
    });
  });
  it("returns null when no office has a callable number", () => {
    expect(pickDistrictOffice([{ city: "Gretna" }, { city: "Baton Rouge" }])).toBeNull();
    expect(pickDistrictOffice(undefined)).toBeNull();
  });
});

describe("parseDistrictOfficeIndex", () => {
  const index = parseDistrictOfficeIndex(raw);

  it("keys the chosen contact by bioguide id", () => {
    expect(index["A000055"].phone).toBe("256-734-6043");
    expect(index["A000055"].address).toContain("Cullman, AL");
  });

  it("skips a member's phone-less first office and picks the next callable one", () => {
    // C001125's first office (Gretna) has no phone; New Orleans does.
    expect(index["C001125"].phone).toBe("504-381-3970");
  });

  it("ignores malformed input", () => {
    expect(parseDistrictOfficeIndex(null)).toEqual({});
    expect(parseDistrictOfficeIndex([{ offices: [{ phone: "202-225-4131" }] }])).toEqual({});
  });
});
