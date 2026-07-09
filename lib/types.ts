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

// ---------------------------------------------------------------------------
// Issue #3 — per-rep section layout. Rich metadata enriched on top of the
// identity-level `Rep` above. LLM-generated text (bill summaries, TL;DR) is
// Issue #5 and is intentionally left as a null slot here.
// ---------------------------------------------------------------------------

/**
 * Structural role on a committee. Neutral / factual only — no leverage scoring
 * (spec editorial stance). "Vice Chair" is a real structural office and kept as
 * such; everything untitled is a plain "Member".
 */
export type CommitteeRole = "Chair" | "Ranking Member" | "Vice Chair" | "Member";

/** One committee or subcommittee a rep sits on, with their structural role. */
export interface CommitteeAssignment {
  /** committee-membership code: "HSAG" (full) or "HSAG16" (subcommittee). */
  code: string;
  /** Display name, e.g. "House Committee on Agriculture" or the subcommittee. */
  name: string;
  role: CommitteeRole;
  isSubcommittee: boolean;
  /** Parent full-committee display name (subcommittees only). */
  parentName: string | null;
  /** Parent full-committee code, e.g. "HSAG" (subcommittees only). */
  parentCode: string | null;
}

/**
 * Single contact block for a rep (spec §2.1). The DC office phone/address come
 * from Congress.gov and are the guaranteed fallback; the district-office phone
 * is scraped best-effort (deferred — null in this issue).
 */
export interface ContactBlock {
  dcOfficePhone: string | null;
  dcOfficeAddress: string | null;
  districtOfficePhone: string | null;
  websiteUrl: string | null;
}

/** An upcoming committee meeting/hearing/markup the rep has a role in. */
export interface UpcomingDecision {
  eventId: string;
  /** Congress.gov meeting type, e.g. "Hearing" | "Markup" | "Meeting". */
  kind: string;
  title: string;
  /** ISO datetime of the meeting. */
  date: string;
  /** "Room, Building" or null. */
  location: string | null;
  committeeName: string;
  committeeCode: string;
  /**
   * Structural role label for this specific decision, derived from the rep's
   * role on the committee holding it — "Chair", "Ranking Member",
   * "Subcommittee Chair", "Committee Member", etc. Structural only.
   */
  roleLabel: string;
  /** Official Congress.gov event URL. */
  url: string;
}

export type SponsorBadge = "Primary sponsor" | "Cosponsor";

/** A sponsored/cosponsored bill shown as secondary context (spec §2.3). */
export interface SecondaryBill {
  /** Stable key, e.g. "hr-9425-119". */
  billId: string;
  /** Human display id, e.g. "H.R. 9425". */
  displayId: string;
  congress: number;
  type: string;
  number: string;
  title: string;
  introducedDate: string | null;
  latestActionDate: string | null;
  latestActionText: string | null;
  badge: SponsorBadge;
  /** Congress.gov public bill URL. */
  url: string;
}

/**
 * Fully enriched per-rep section (spec §2). Assembled on top of a resolved
 * `Rep` identity. `tldr` is the neutral LLM digest — populated by Issue #5,
 * null until then.
 */
export interface RepProfile {
  rep: Rep;
  committees: CommitteeAssignment[];
  contact: ContactBlock;
  upcomingDecisions: UpcomingDecision[];
  secondaryBills: SecondaryBill[];
  tldr: string | null;
}

/** Result of a lookup. Either resolved, needs disambiguation, or nothing found. */
export type LookupResult =
  | { status: "resolved"; reps: ResolvedReps }
  | { status: "disambiguate"; candidates: DistrictCandidate[] }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };
