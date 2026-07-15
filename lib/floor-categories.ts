// Plain-English glosses for the House weekly-floor category headings (Issue #34).
//
// docs.house.gov publishes each week's agenda with free-text category `type`
// attributes, which we surface verbatim as `FloorCategory.heading`
// (see lib/floor-schedule.ts). Those procedural labels ("under suspension of the
// rules", "pursuant to a rule") are opaque to non-specialists. Each gloss below
// explains what the category *means* for a bill's path through the House.
//
// CIVIC-ACCURACY-SENSITIVE COPY. The factual claims are drawn verbatim from
// authoritative sources, not paraphrased loosely — verify against the cited
// `source` before changing wording:
//   - Suspension: CRS "Suspension of the Rules in the House: Principal Features"
//     (98-314) and GPO House Practice ch. 53 — 40-minute debate, no floor
//     amendments, two-thirds vote for passage, reserved for broadly-supported bills.
//   - Special rule: CRS R48308 — "A special rule (or rule) is a House resolution
//     (H.Res.) that regulates floor consideration of one or more measures identified
//     in its text"; the House adopts the rule first, then takes up the measure under it.
// The three headings below are the full set observed on docs.house.gov across the
// weeks sampled; the substring matching degrades to `null` for any other string the
// House might publish, so no unexplained/incorrect gloss is ever shown.

export interface CategoryGloss {
  /** Plain-English explanation of what the category means. */
  text: string;
  /** Human label for the authoritative source. */
  sourceLabel: string;
  /** Link to the authoritative source. */
  sourceUrl: string;
}

const SUSPENSION: CategoryGloss = {
  text:
    "A fast-track procedure the House uses for bills expected to have broad, " +
    "bipartisan support. Debate is limited to 40 minutes, no floor amendments are " +
    "allowed, and passage requires a two-thirds vote of those present — a higher bar " +
    "than the usual simple majority.",
  sourceLabel: "Congressional Research Service",
  sourceUrl: "https://www.congress.gov/crs-product/98-314",
};

const RULE: CategoryGloss = {
  text:
    "These bills are set to be considered under a “special rule” — a House " +
    "resolution that sets the terms of floor debate and which amendments may be offered. " +
    "The House first debates and votes on the rule itself; only after it is adopted does " +
    "the House take up the bill under those terms. This path is typical for major or " +
    "contested legislation.",
  sourceLabel: "House Committee on Rules",
  sourceUrl: "https://rules.house.gov/about/special-rule-process",
};

const MAY_BE_CONSIDERED: CategoryGloss = {
  text:
    "This is the House's tentative weekly agenda — bills leadership may bring to the " +
    "floor, not a guaranteed schedule of votes. Items can be added, dropped, or carried " +
    "to a later week.",
  sourceLabel: "docs.house.gov",
  sourceUrl: "https://docs.house.gov/floor/",
};

/**
 * Map a verbatim House floor category heading to its plain-English gloss.
 * Matches by normalized substring so minor wording drift at week boundaries still
 * resolves. Returns null for unrecognized headings (no gloss is shown).
 */
export function floorCategoryGloss(heading: string): CategoryGloss | null {
  const h = heading.toLowerCase();
  if (h.includes("suspension of the rules")) return SUSPENSION;
  if (h.includes("pursuant to a rule") || h.includes("under a rule")) return RULE;
  if (h.includes("may be considered")) return MAY_BE_CONSIDERED;
  return null;
}
