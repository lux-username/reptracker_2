import { describe, expect, it } from "vitest";
import { billDisplayId, billUrl, committeePageUrl, ordinal } from "./bill-format";

describe("ordinal", () => {
  it("handles the teens and the 1/2/3 suffixes", () => {
    expect(ordinal(119)).toBe("119th");
    expect(ordinal(121)).toBe("121st");
    expect(ordinal(122)).toBe("122nd");
    expect(ordinal(123)).toBe("123rd");
    expect(ordinal(113)).toBe("113th"); // teen exception
  });
});

describe("billDisplayId", () => {
  it("maps type codes to their display prefixes", () => {
    expect(billDisplayId("HR", "9649")).toBe("H.R. 9649");
    expect(billDisplayId("SJRES", "12")).toBe("S.J.Res. 12");
    expect(billDisplayId("ZZ", "1")).toBe("ZZ 1"); // unknown type passes through
  });
});

describe("billUrl", () => {
  it("builds the public Congress.gov bill URL from the type segment", () => {
    expect(billUrl(119, "HR", "9649")).toBe(
      "https://www.congress.gov/bill/119th-congress/house-bill/9649",
    );
    expect(billUrl(119, "S", "42")).toBe(
      "https://www.congress.gov/bill/119th-congress/senate-bill/42",
    );
  });
  it("falls back to a search URL for an unmapped bill type (never 404s)", () => {
    expect(billUrl(119, "ZZ", "1")).toBe("https://www.congress.gov/search?q=ZZ1");
  });
});

describe("committeePageUrl", () => {
  it("builds the chamber-scoped committee page url from the systemCode", () => {
    expect(committeePageUrl("house", "hsag00")).toBe(
      "https://www.congress.gov/committee/house-committee/hsag00",
    );
    expect(committeePageUrl("senate", "SSJU00")).toBe(
      "https://www.congress.gov/committee/senate-committee/ssju00",
    );
  });
});
