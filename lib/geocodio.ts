// Server-only: reads GEOCODIO_API_KEY (a non-public env var, undefined in the
// browser) and is imported exclusively by server actions / components.
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

export class GeocodioError extends Error {
  constructor(
    message: string,
    readonly kind: "not_found" | "error",
  ) {
    super(message);
    this.name = "GeocodioError";
  }
}

/** Normalize an address into a stable cache key: lower, trim, collapse ws, strip punctuation. */
function normalizeForKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  return cached(cacheKey("geo", normalizeForKey(address)), TTL.geocode, () =>
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
  const candidates = parseGeocodioResponse(data);
  if (candidates.length === 0) {
    throw new GeocodioError("No congressional district found for that address.", "not_found");
  }
  return candidates;
}
