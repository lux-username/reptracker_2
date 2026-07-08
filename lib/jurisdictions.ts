// Non-standard representation + district-encoding helpers.
//
// These encode stable constitutional / API-convention facts, not drifting data,
// so they are safe to hardcode (and unit-testable without network access).

/**
 * Two-letter codes for jurisdictions whose House seat is a non-voting delegate
 * or resident commissioner and which have no full Senate representation.
 * (DC, Puerto Rico, Guam, US Virgin Islands, American Samoa, Northern Marianas.)
 * A stable constitutional fact — not data that changes between Congresses.
 */
export const NON_VOTING_JURISDICTIONS: ReadonlySet<string> = new Set([
  "DC",
  "PR",
  "GU",
  "VI",
  "AS",
  "MP",
]);

/** Puerto Rico's House seat is titled "Resident Commissioner", not "Delegate". */
const RESIDENT_COMMISSIONER_STATE = "PR";

export function isNonVoting(state: string): boolean {
  return NON_VOTING_JURISDICTIONS.has(state.toUpperCase());
}

/**
 * Normalize Geocodio's district number to the Congress.gov convention.
 *
 * Geocodio uses 98 for at-large delegate districts (DC + territories) and 0 for
 * voting at-large states (e.g. WY). Congress.gov uses 0 for BOTH. Numbered
 * districts pass through unchanged.
 */
export function normalizeDistrict(geocodioDistrictNumber: number): number {
  return geocodioDistrictNumber === 98 ? 0 : geocodioDistrictNumber;
}

/**
 * The structural role of a House seat, given its jurisdiction.
 * Voting states → "representative"; PR → "resident-commissioner"; other
 * non-voting jurisdictions → "delegate".
 */
export function houseRole(
  state: string,
): "representative" | "delegate" | "resident-commissioner" {
  const s = state.toUpperCase();
  if (!isNonVoting(s)) return "representative";
  return s === RESIDENT_COMMISSIONER_STATE ? "resident-commissioner" : "delegate";
}

/** Full jurisdiction name for banner copy, keyed by two-letter code. */
const JURISDICTION_NAMES: Record<string, string> = {
  DC: "The District of Columbia",
  PR: "Puerto Rico",
  GU: "Guam",
  VI: "The US Virgin Islands",
  AS: "American Samoa",
  MP: "The Northern Mariana Islands",
};

/**
 * Plain-language banner explaining what a delegate can and cannot do (spec §1).
 * Returns null for standard voting jurisdictions.
 */
export function delegateBanner(state: string, memberName: string): string | null {
  const s = state.toUpperCase();
  if (!isNonVoting(s)) return null;
  const title = s === RESIDENT_COMMISSIONER_STATE ? "Resident Commissioner" : "Delegate";
  const place = JURISDICTION_NAMES[s] ?? s;
  const senateClause =
    s === "DC"
      ? "The District of Columbia has no Senate representation."
      : `${place} has no Senate representation.`;
  return `${title} ${memberName} votes in committee but not on the House floor. ${senateClause}`;
}

/**
 * Parse Geocodio's congress label ("119th") into a number. Falls back to a
 * best-effort value only if the label is malformed.
 */
export function parseCongressNumber(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = /(\d+)/.exec(label);
  return m ? Number(m[1]) : null;
}
