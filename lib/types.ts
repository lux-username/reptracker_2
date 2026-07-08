// Domain types for address → representative resolution (Issue #2).
//
// Boundary: this layer identifies *who* a constituent's federal representatives
// are (identity + the bioguide_id join key). Rich per-rep metadata (committees,
// contact, upcoming decisions) is enriched from Congress.gov in later issues and
// is intentionally NOT modeled here.

/** A US state or non-voting-jurisdiction two-letter code, e.g. "KS", "DC", "PR". */
export type StateCode = string;

/** Chamber a member sits in. Delegates/resident commissioners sit in the House. */
export type Chamber = "house" | "senate";

/**
 * A single distinct congressional district a geocoded address maps to.
 * `district` is normalized to the Congress.gov convention (at-large = 0).
 */
export interface DistrictCandidate {
  /** Two-letter state / jurisdiction code, e.g. "KS", "CA", "DC", "PR". */
  state: StateCode;
  /** Congress.gov district number. Numbered districts as-is; at-large = 0. */
  district: number;
  /** Geocodio OCD division id, e.g. "ocd-division/country:us/state:ks/cd:2". */
  ocdId: string;
  /** Human display name from Geocodio, e.g. "Congressional District 2". */
  districtName: string;
  /** Congress number, e.g. 119. */
  congress: number;
  /** The formatted address Geocodio matched (for disambiguation display). */
  formattedAddress: string;
  /** Fraction of the geocoded area in this district (1 for a rooftop match). */
  proportion: number;
  /**
   * Cheap preview of the House member's surname from Geocodio's embedded
   * legislator data, used only to label a disambiguation choice. Authoritative
   * resolution is via Congress.gov. May be null if Geocodio omitted it.
   */
  housePreviewSurname: string | null;
  /** True for DC + territories: non-voting delegate, no (or partial) Senate. */
  nonVoting: boolean;
}

/** A resolved federal representative at identity level. */
export interface Rep {
  bioguideId: string;
  /** Display name as returned by Congress.gov, e.g. "Schmidt, Derek". */
  name: string;
  party: string;
  state: StateCode;
  chamber: Chamber;
  /** House district (0 for at-large / delegate); null for senators. */
  district: number | null;
  /**
   * Structural role of the House seat:
   * - "representative" — voting House member
   * - "delegate" — DC / territory delegate (non-voting on the floor)
   * - "resident-commissioner" — Puerto Rico's delegate
   * null for senators.
   */
  houseRole: "representative" | "delegate" | "resident-commissioner" | null;
  imageUrl: string | null;
}

/** The set of representatives for one resolved district. */
export interface ResolvedReps {
  state: StateCode;
  district: number;
  congress: number;
  /** True for DC + territories. */
  nonVoting: boolean;
  /**
   * When nonVoting, a plain-language banner explaining what the delegate can and
   * cannot do (spec §1). null for standard jurisdictions.
   */
  delegateBanner: string | null;
  /** The single House member or delegate for this district. */
  houseMember: Rep | null;
  /** Senators (0 for DC + territories, normally 2). */
  senators: Rep[];
}

/** Result of a lookup. Either resolved, needs disambiguation, or nothing found. */
export type LookupResult =
  | { status: "resolved"; reps: ResolvedReps }
  | { status: "disambiguate"; candidates: DistrictCandidate[] }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };
