import { describe, expect, it } from "vitest";
import { formatOfficeAddress } from "./rep-profile";

describe("formatOfficeAddress", () => {
  it("assembles a House address from building + city/district/zip", () => {
    // Real Congress.gov shape for Rep. Davids (KS-03).
    expect(
      formatOfficeAddress({
        city: "Washington",
        district: "DC",
        officeAddress: "2435 Rayburn House Office Building",
        zipCode: 20515,
      }),
    ).toBe("2435 Rayburn House Office Building, Washington, DC 20515");
  });

  it("trusts a Senate officeAddress that already embeds the city + zip", () => {
    // Real shape for Sen. Moran: full address is in officeAddress (with a double
    // space); the top-level zipCode (20515) is the wrong generic value.
    expect(
      formatOfficeAddress({
        city: "Washington",
        district: "DC",
        officeAddress: "521 Dirksen Senate Office Building  Washington, DC 20510",
        zipCode: 20515,
      }),
    ).toBe("521 Dirksen Senate Office Building Washington, DC 20510");
  });

  it("returns null when there is no office address", () => {
    expect(formatOfficeAddress(undefined)).toBeNull();
    expect(formatOfficeAddress({ city: "Washington" })).toBeNull();
  });
});
