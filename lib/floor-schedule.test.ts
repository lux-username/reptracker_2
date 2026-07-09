import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  billUrl,
  houseFloorXmlUrl,
  parseHouseFloorXml,
  parseSenateFloorHtml,
} from "./floor-schedule";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "lib", "__fixtures__", name), "utf-8");
const houseXml = fixture("house-floor.xml");
const senateHtml = fixture("senate-floor.html");

describe("billUrl", () => {
  it("maps House and Senate legis-num forms to Congress.gov slugs", () => {
    expect(billUrl("H.R. 8873", 119)).toBe(
      "https://www.congress.gov/bill/119th-congress/house-bill/8873",
    );
    expect(billUrl("H. Res. 1383", 119)).toBe(
      "https://www.congress.gov/bill/119th-congress/house-resolution/1383",
    );
    expect(billUrl("H.J. Res. 12", 119)).toBe(
      "https://www.congress.gov/bill/119th-congress/house-joint-resolution/12",
    );
    expect(billUrl("H. Con. Res. 5", 119)).toBe(
      "https://www.congress.gov/bill/119th-congress/house-concurrent-resolution/5",
    );
    expect(billUrl("S. 456", 119)).toBe(
      "https://www.congress.gov/bill/119th-congress/senate-bill/456",
    );
  });

  it("tolerates trailing whitespace in the number", () => {
    expect(billUrl("H.R. 5347 ", 119)).toBe(
      "https://www.congress.gov/bill/119th-congress/house-bill/5347",
    );
  });

  it("returns null when the congress or type is unknown", () => {
    expect(billUrl("H.R. 1", null)).toBeNull();
    expect(billUrl("Motion to recommit", 119)).toBeNull();
    expect(billUrl("", 119)).toBeNull();
  });
});

describe("houseFloorXmlUrl", () => {
  it("rebuilds the weekly XML URL from the index page's Download link", () => {
    const html =
      '<a href="Download.aspx?file=/billsthisweek/20260629/20260629.xml">XML</a>';
    expect(houseFloorXmlUrl(html)).toBe(
      "https://docs.house.gov/billsthisweek/20260629/20260629.xml",
    );
  });

  it("returns null when no weekly XML is linked (nothing posted)", () => {
    expect(houseFloorXmlUrl("<html>Congress is not in session</html>")).toBeNull();
  });
});

describe("parseHouseFloorXml", () => {
  const house = parseHouseFloorXml(houseXml)!;

  it("extracts the week, congress, and update stamp", () => {
    expect(house).not.toBeNull();
    expect(house.weekOf).toBe("2026-06-29");
    expect(house.congress).toBe(119);
    expect(house.updatedAt).toBe("2026-06-30T14:43:32.530");
  });

  it("groups bills under their procedural categories with links", () => {
    expect(house.categories.length).toBeGreaterThanOrEqual(2);
    const allBills = house.categories.flatMap((c) => c.bills);
    expect(allBills.length).toBeGreaterThan(0);

    const suspension = house.categories.find((c) =>
      c.heading.toLowerCase().includes("suspension"),
    );
    expect(suspension).toBeDefined();
    const hr8873 = suspension!.bills.find((b) => b.legisNum.startsWith("H.R. 8873"));
    expect(hr8873).toBeDefined();
    expect(hr8873!.title).toContain("Recover COVID Unemployment Fraud");
    expect(hr8873!.url).toBe(
      "https://www.congress.gov/bill/119th-congress/house-bill/8873",
    );
  });

  it("returns null on a document that isn't a floor schedule", () => {
    expect(parseHouseFloorXml("<html><body>404</body></html>")).toBeNull();
    expect(parseHouseFloorXml("<floorschedule></floorschedule>")).toBeNull();
  });
});

describe("parseSenateFloorHtml", () => {
  it("extracts the next convene date and note", () => {
    const senate = parseSenateFloorHtml(senateHtml)!;
    expect(senate).not.toBeNull();
    expect(senate.date).toBe("Monday, Jul 13, 2026");
    expect(senate.note).toBe("Convene at 3:00 p.m.");
  });

  it("returns null when the schedule article is absent", () => {
    expect(parseSenateFloorHtml("<html><body>maintenance</body></html>")).toBeNull();
  });
});
