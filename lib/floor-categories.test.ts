import { describe, expect, it } from "vitest";
import { floorCategoryGloss } from "./floor-categories";

describe("floorCategoryGloss", () => {
  // The three category `type` strings docs.house.gov actually publishes.
  it("glosses the suspension-of-the-rules category", () => {
    const g = floorCategoryGloss("Items that may be considered under suspension of the rules");
    expect(g?.text).toMatch(/two-thirds vote/i);
    expect(g?.sourceUrl).toContain("congress.gov");
  });

  it("glosses the pursuant-to-a-rule category", () => {
    const g = floorCategoryGloss("Items that may be considered pursuant to a rule");
    expect(g?.text).toMatch(/special rule/i);
    expect(g?.sourceUrl).toContain("rules.house.gov");
  });

  it("glosses the bare may-be-considered category as a tentative agenda", () => {
    const g = floorCategoryGloss("Items that may be considered");
    expect(g?.text).toMatch(/tentative/i);
    expect(g?.sourceUrl).toContain("docs.house.gov");
  });

  // Suspension must win even though the string also contains "may be considered".
  it("prefers the most specific match", () => {
    expect(
      floorCategoryGloss("Items that may be considered under suspension of the rules")?.text,
    ).toMatch(/two-thirds/i);
  });

  it("matches case-insensitively", () => {
    expect(floorCategoryGloss("SUSPENSION OF THE RULES")).not.toBeNull();
  });

  it("returns null for an unrecognized heading (degrades gracefully)", () => {
    expect(floorCategoryGloss("Some brand-new House category")).toBeNull();
    expect(floorCategoryGloss("")).toBeNull();
  });
});
