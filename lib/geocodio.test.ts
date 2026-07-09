import { describe, expect, it } from "vitest";
import {
  hasStreetLevelMatch,
  looksLikeStreetAddress,
  parseGeocodioResponse,
  stateFromOcdId,
  type GeocodioResponse,
} from "./geocodio";

// Real Geocodio v1.7 `cd`-field payloads captured from the live API.
import fullKs from "./__fixtures__/geocodio-full-ks.json";
import zipStraddleCa from "./__fixtures__/geocodio-zip-straddle-ca.json";
import zipMultiMo from "./__fixtures__/geocodio-zip-multi-mo.json";
import dc from "./__fixtures__/geocodio-dc.json";
import pr from "./__fixtures__/geocodio-pr.json";
import wy from "./__fixtures__/geocodio-wy.json";
import streetNomatch from "./__fixtures__/geocodio-street-nomatch.json";

const p = (fixture: unknown) => parseGeocodioResponse(fixture as GeocodioResponse);

describe("stateFromOcdId", () => {
  it("extracts state / district / territory codes", () => {
    expect(stateFromOcdId("ocd-division/country:us/state:ks/cd:2")).toBe("KS");
    expect(stateFromOcdId("ocd-division/country:us/district:dc/cd:at-large")).toBe("DC");
    expect(stateFromOcdId("ocd-division/country:us/territory:pr/cd:at-large")).toBe("PR");
  });
  it("returns null for an unparseable id", () => {
    expect(stateFromOcdId("garbage")).toBeNull();
  });
});

describe("parseGeocodioResponse", () => {
  it("resolves a rooftop full address to exactly one district", () => {
    const c = p(fullKs);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ state: "KS", district: 2, nonVoting: false, proportion: 1 });
    expect(c[0].congress).toBe(119);
  });

  it("surfaces both districts when a ZIP centroid straddles a line (within one result)", () => {
    const c = p(zipStraddleCa); // 90210 → CA-32 (0.62) and CA-36 (0.38)
    expect(c.map((x) => x.district).sort()).toEqual([32, 36]);
    // sorted most-likely first
    expect(c[0].proportion).toBeGreaterThan(c[1].proportion);
    expect(c[0].state).toBe("CA");
  });

  it("de-duplicates across many results down to distinct districts", () => {
    const c = p(zipMultiMo); // 65201 → MO-3 (dominant) + MO-4 (sliver)
    const districts = c.map((x) => x.district).sort((a, b) => a - b);
    expect(districts).toEqual([3, 4]);
    expect(c[0].district).toBe(3); // higher proportion first
  });

  it("classifies DC as a single non-voting at-large district", () => {
    const c = p(dc);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ state: "DC", district: 0, nonVoting: true });
  });

  it("classifies Puerto Rico as a single non-voting at-large district", () => {
    const c = p(pr);
    expect(c.every((x) => x.state === "PR")).toBe(true);
    expect(c.map((x) => x.district)).toEqual([0]);
    expect(c[0].nonVoting).toBe(true);
  });

  it("classifies a voting at-large state (WY) as district 0 but NOT non-voting", () => {
    const c = p(wy);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ state: "WY", district: 0, nonVoting: false });
  });

  it("returns an empty list when there are no results", () => {
    expect(p({ error: "Could not geocode address. No matches found." })).toEqual([]);
    expect(p({})).toEqual([]);
  });
});

describe("low-confidence-match guard (#12)", () => {
  it("recognizes a street address by a house number + street word", () => {
    expect(looksLikeStreetAddress("999 fake nowhere street lanett")).toBe(true);
    expect(looksLikeStreetAddress("1600 Pennsylvania Ave NW, Washington, DC")).toBe(true);
  });

  it("does NOT treat ZIP-only or city/state input as a street address", () => {
    // These are supported and legitimately resolve to place-level matches.
    expect(looksLikeStreetAddress("66044")).toBe(false);
    expect(looksLikeStreetAddress("Lawrence, KS")).toBe(false);
    expect(looksLikeStreetAddress("Lawrence, KS 66044")).toBe(false);
  });

  it("detects when nothing matched at street granularity", () => {
    // Garbage street input → all `place` (city centroids) across two districts.
    expect(hasStreetLevelMatch(streetNomatch as GeocodioResponse)).toBe(false);
    // A real rooftop address matched at street level.
    expect(hasStreetLevelMatch(fullKs as GeocodioResponse)).toBe(true);
  });

  it("the fixture would otherwise produce a misleading multi-district disambiguation", () => {
    // Confirms the case is real: without the guard these place matches span
    // different districts and reach the disambiguation screen.
    const districts = new Set(p(streetNomatch).map((c) => `${c.state}-${c.district}`));
    expect(districts.size).toBeGreaterThan(1);
  });
});
