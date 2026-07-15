// Shared bill-identity formatting — display id + public Congress.gov URL for a
// (congress, type, number) triple. Used by both the sponsored/cosponsored list
// (lib/legislation.ts) and the committee-docket list (lib/committee-bills.ts) so
// the two render bill ids and links identically. Pure, no I/O.

/** Bill-type code → human display prefix, e.g. "HR" → "H.R.". */
export const TYPE_DISPLAY: Record<string, string> = {
  HR: "H.R.",
  S: "S.",
  HJRES: "H.J.Res.",
  SJRES: "S.J.Res.",
  HCONRES: "H.Con.Res.",
  SCONRES: "S.Con.Res.",
  HRES: "H.Res.",
  SRES: "S.Res.",
};

/** Bill-type code → Congress.gov URL path segment, e.g. "HR" → "house-bill". */
export const TYPE_URL_SEGMENT: Record<string, string> = {
  HR: "house-bill",
  S: "senate-bill",
  HJRES: "house-joint-resolution",
  SJRES: "senate-joint-resolution",
  HCONRES: "house-concurrent-resolution",
  SCONRES: "senate-concurrent-resolution",
  HRES: "house-resolution",
  SRES: "senate-resolution",
};

/** English ordinal for a positive integer, e.g. 119 → "119th", 121 → "121st". */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** Human display id, e.g. ("HR", "9425") → "H.R. 9425". */
export function billDisplayId(type: string, number: string): string {
  const upper = type.toUpperCase();
  return `${TYPE_DISPLAY[upper] ?? upper} ${number}`;
}

/**
 * Public Congress.gov bill URL. Falls back to a Congress.gov search when the bill
 * type has no known URL segment (so the link never 404s on an unmapped type).
 */
export function billUrl(congress: number, type: string, number: string): string {
  const upper = type.toUpperCase();
  const seg = TYPE_URL_SEGMENT[upper];
  return seg
    ? `https://www.congress.gov/bill/${ordinal(congress)}-congress/${seg}/${number}`
    : `https://www.congress.gov/search?q=${upper}${number}`;
}

/**
 * Public Congress.gov committee page — Congress.gov's own compiled home for a
 * committee, where its legislation (the bills referred to it) is listed. The
 * systemCode-only form redirects to the full slug URL; this is the same pattern
 * committee-actions.ts already uses for its committee links.
 */
export function committeePageUrl(
  chamber: "house" | "senate",
  systemCode: string,
): string {
  return `https://www.congress.gov/committee/${chamber}-committee/${systemCode.toLowerCase()}`;
}
