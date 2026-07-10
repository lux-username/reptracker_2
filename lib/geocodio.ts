// Server-only: reads GEOCODIO_API_KEY (a non-public env var, undefined in the
// browser) and is imported exclusively by server actions / components.
import { createHash } from "node:crypto";
import type { DistrictCandidate } from "./types";
import { isNonVoting, normalizeDistrict, parseCongressNumber } from "./jurisdictions";
import { cached, cacheKey, TTL } from "./cache";

// Minimal shapes for the Geocodio v1.7 `cd` (congressional district) field.
// Only the fields we consume are typed; the payload has much more.

interface GeocodioLegislator {
  type: string; // "representative" | "senator"
  bio?: { last_name?: string };
}

interface GeocodioDistrict {
  name: string;
  district_number: number;
  ocd_id: string;
  congress_number?: string; // e.g. "119th"
  proportion?: number;
  current_legislators?: GeocodioLegislator[];
}

interface GeocodioResult {
  formatted_address: string;
  /** Geocodio match confidence (0–1) and granularity ("rooftop", "place", …). */
  accuracy?: number;
  accuracy_type?: string;
  fields?: { congressional_districts?: GeocodioDistrict[] };
}

export interface GeocodioResponse {
  error?: string;
  results?: GeocodioResult[];
}

/** Extract the two-letter code from an OCD id (state:/district:/territory:). */
export function stateFromOcdId(ocdId: string): string | null {
  const m = /(?:state|district|territory):([a-z]{2})\b/.exec(ocdId);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Turn a parsed Geocodio response into the set of DISTINCT district candidates.
 *
 * Ambiguity can arise two ways, and both are handled here:
 *  - across `results` (a ZIP resolves to several buildings in different districts)
 *  - within one result's `congressional_districts` (a ZIP centroid straddles a
 *    district line — Geocodio returns multiple entries with `proportion`).
 *
 * Candidates are de-duplicated by (state, normalized district). When the same
 * district appears more than once, the entry with the highest proportion wins
 * (so the disambiguation UI shows the most representative address/proportion).
 * The returned list is sorted by descending proportion — most likely first.
 */
export function parseGeocodioResponse(resp: GeocodioResponse): DistrictCandidate[] {
  const byDistrict = new Map<string, DistrictCandidate>();

  for (const result of resp.results ?? []) {
    const districts = result.fields?.congressional_districts ?? [];
    for (const d of districts) {
      const state = stateFromOcdId(d.ocd_id);
      if (!state) continue; // unparseable division — skip rather than mis-resolve
      const district = normalizeDistrict(d.district_number);
      const key = `${state}-${district}`;

      const proportion = d.proportion ?? 1;
      const rep = (d.current_legislators ?? []).find(
        (l) => l.type === "representative",
      );

      const candidate: DistrictCandidate = {
        state,
        district,
        ocdId: d.ocd_id,
        districtName: d.name,
        congress: parseCongressNumber(d.congress_number) ?? 0,
        formattedAddress: result.formatted_address,
        proportion,
        housePreviewSurname: rep?.bio?.last_name ?? null,
        nonVoting: isNonVoting(state),
      };

      const existing = byDistrict.get(key);
      if (!existing || candidate.proportion > existing.proportion) {
        byDistrict.set(key, candidate);
      }
    }
  }

  return [...byDistrict.values()].sort((a, b) => b.proportion - a.proportion);
}

// ---------------------------------------------------------------------------
// Low-confidence-match guard (Issue #12).
//
// Geocodio lenient-matches garbage input to a real *place*: "999 fake nowhere
// street lanett" resolves to several AL towns in different districts (all
// `accuracy_type: place`), which our flow then presents as a bogus "which
// district is yours?" screen. We can't reject place-level matches outright —
// a legitimate ZIP-only or city lookup is *also* `place` and is supported. The
// safe discriminator: only when the input clearly names a *street address* (a
// house number + street word) yet nothing matched at street granularity did the
// geocoder fall back to a city centroid — treat that as a miss, not a district.
// ---------------------------------------------------------------------------

/** accuracy_types that mean Geocodio pinned an actual street location. */
const STREET_LEVEL_ACCURACY = new Set([
  "rooftop",
  "point",
  "range_interpolation",
  "nearest_rooftop_match",
  "street_center",
  "intersection",
]);

/** True if any result matched at street granularity (not a place/county/state centroid). */
export function hasStreetLevelMatch(resp: GeocodioResponse): boolean {
  return (resp.results ?? []).some(
    (r) => r.accuracy_type != null && STREET_LEVEL_ACCURACY.has(r.accuracy_type),
  );
}

/**
 * True if the input reads like a specific street address — a house number
 * followed by a street-name word. ZIP-only ("66044") and city/state
 * ("Lawrence, KS") inputs are deliberately NOT street-like, so the street-match
 * guard never rejects those legitimately place-level lookups.
 */
export function looksLikeStreetAddress(address: string): boolean {
  return /\b\d{1,6}\s+[a-z]/i.test(address);
}

export class GeocodioError extends Error {
  constructor(
    message: string,
    readonly kind: "not_found" | "error",
  ) {
    super(message);
    this.name = "GeocodioError";
  }
}

/**
 * Derive a stable, non-reversible cache key part from an address.
 *
 * We must NOT store the raw address anywhere — the footer/spec promise it is not
 * stored (privacy §, Issue #31). But we still want cache hits for the same input,
 * so we normalize (lower, trim, collapse ws, strip punctuation) then SHA-256: the
 * same address always maps to the same key, yet the key in Upstash (and in any
 * cache-error log line) reveals nothing about the address entered.
 */
function hashAddressForKey(address: string): string {
  const normalized = address
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Geocode a free-form US address (or ZIP) to its distinct district candidates.
 * Throws GeocodioError with kind "not_found" for an unprocessable address and
 * kind "error" for auth/quota/network failures.
 *
 * Cached 24h keyed by the normalized address (spec §Caching item 1). A throw
 * (not_found / auth / network) propagates uncached.
 */
export async function geocode(address: string): Promise<DistrictCandidate[]> {
  return cached(cacheKey("geo", hashAddressForKey(address)), TTL.geocode, () =>
    geocodeLive(address),
  );
}

async function geocodeLive(address: string): Promise<DistrictCandidate[]> {
  const apiKey = process.env.GEOCODIO_API_KEY;
  if (!apiKey) throw new GeocodioError("GEOCODIO_API_KEY is not set", "error");

  const url = new URL("https://api.geocod.io/v1.7/geocode");
  url.searchParams.set("q", address);
  url.searchParams.set("fields", "cd");
  url.searchParams.set("api_key", apiKey);

  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new GeocodioError(`Geocodio request failed: ${String(e)}`, "error");
  }

  // 422 = "Could not geocode address. No matches found." → a user-facing miss.
  if (resp.status === 422) {
    throw new GeocodioError("No matches found for that address.", "not_found");
  }
  if (!resp.ok) {
    throw new GeocodioError(`Geocodio returned HTTP ${resp.status}`, "error");
  }

  const data = (await resp.json()) as GeocodioResponse;

  // Street-address input that only matched a city centroid isn't a district we
  // can trust — surface a miss instead of a misleading disambiguation (Issue #12).
  if (looksLikeStreetAddress(address) && !hasStreetLevelMatch(data)) {
    throw new GeocodioError(
      "We couldn't find that exact street address. Double-check the house number and street name, or enter your ZIP code.",
      "not_found",
    );
  }

  const candidates = parseGeocodioResponse(data);
  if (candidates.length === 0) {
    throw new GeocodioError("No congressional district found for that address.", "not_found");
  }
  return candidates;
}
