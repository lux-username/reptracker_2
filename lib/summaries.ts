// Plain-English bill descriptions — rendered directly from the nonpartisan
// Congressional Research Service (CRS) summary. NO LLM.
//
// Design decision (session 6): we do not put a language model between the
// citizen and authoritative government text. CRS summaries are already
// plain-English descriptions written by nonpartisan human experts, so we show
// them verbatim. A bill with no CRS summary yet shows structured-only (official
// title + Congress.gov link) — we never infer what a bill does from its title
// or from raw legislative text. See decisions.md.
import { cached, cacheKey, TTL } from "./cache";
import { congressFetch } from "./rate-limit";

/** Raw Congress.gov bill-summary + text-version shapes (fields we consume). */
export interface RawCrsSummary {
  actionDate?: string;
  actionDesc?: string;
  text?: string;
  updateDate?: string;
  versionCode?: string;
}
export interface RawTextVersion {
  type?: string; // "Introduced in House", "Reported in House", …
  date?: string;
}

/** Strip HTML tags + decode the handful of entities Congress.gov emits. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
}

/** The most recently updated CRS summary (plain text), or null if none exist. */
export function selectCrsSummary(
  summaries: RawCrsSummary[],
): { text: string; date: string | null } | null {
  const withText = summaries.filter((s) => s.text && s.text.trim());
  if (withText.length === 0) return null;
  const latest = withText.reduce((a, b) =>
    (b.updateDate ?? "") > (a.updateDate ?? "") ? b : a,
  );
  return { text: stripHtml(latest.text!), date: latest.actionDate ?? null };
}

/** Newest text-version date across all versions (ISO), or null. */
export function latestTextVersionDate(versions: RawTextVersion[]): string | null {
  const dated = versions.map((v) => v.date).filter((d): d is string => !!d);
  if (dated.length === 0) return null;
  return dated.reduce((a, b) => (b > a ? b : a));
}

/** Date of the "Introduced in …" text version — the "as introduced" basis. */
export function introducedTextVersionDate(versions: RawTextVersion[]): string | null {
  const introduced = versions.find((v) => /introduced/i.test(v.type ?? ""));
  return introduced?.date ?? null;
}

/** Has the bill text moved past the version the summary is based on? */
export function isAmendedSince(
  basedOnDate: string | null,
  latestVersionDate: string | null,
): boolean {
  if (!basedOnDate || !latestVersionDate) return false;
  return latestVersionDate > basedOnDate;
}

export interface BillSummary {
  billId: string;
  /** Verbatim CRS summary text, or null ⇒ structured-only (title/link only). */
  text: string | null;
  /** "Based on bill as introduced, [date]" stamp source; null when unknown. */
  basedOnDate: string | null;
  /** Congress.gov has a newer bill text version than the CRS summary is based on. */
  amendedSince: boolean;
}

export interface ExtractBillSummaryInput {
  billId: string;
  crsSummaries: RawCrsSummary[];
  textVersions: RawTextVersion[];
  /** True for a markup of a bill not yet in Congress.gov → structured-only. */
  billNotInCongress?: boolean;
}

/**
 * Produce a bill's plain-English description from its CRS summary (verbatim).
 * Pure + deterministic — no LLM, no cache. No CRS summary ⇒ structured-only.
 */
export function extractBillSummary(input: ExtractBillSummaryInput): BillSummary {
  const crs = input.billNotInCongress ? null : selectCrsSummary(input.crsSummaries);
  const basedOnDate =
    introducedTextVersionDate(input.textVersions) ?? crs?.date ?? null;
  return {
    billId: input.billId,
    text: crs?.text ?? null,
    basedOnDate,
    amendedSince: isAmendedSince(basedOnDate, latestTextVersionDate(input.textVersions)),
  };
}

// ---------------------------------------------------------------------------
// I/O: fetch a bill's CRS summaries + text-version list from Congress.gov.
// (Issue #7 caches these responses.)
// ---------------------------------------------------------------------------

export class BillSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillSourceError";
  }
}

/**
 * Fetch a bill's CRS summaries + text-version list, cached in the reference tier
 * (4-6h). CRS summaries are slow-moving; the "amended since" warning
 * (extractBillSummary) covers the window between a new text version and the TTL.
 */
export function fetchBillSources(
  congress: number,
  type: string,
  number: string,
): Promise<{ crsSummaries: RawCrsSummary[]; textVersions: RawTextVersion[] }> {
  return cached(
    cacheKey("bill", congress, type.toLowerCase(), number),
    TTL.reference,
    () => fetchBillSourcesLive(congress, type, number),
  );
}

async function fetchBillSourcesLive(
  congress: number,
  type: string,
  number: string,
): Promise<{ crsSummaries: RawCrsSummary[]; textVersions: RawTextVersion[] }> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) throw new BillSourceError("CONGRESS_GOV_API_KEY is not set");
  const t = type.toLowerCase();
  const base = `https://api.congress.gov/v3/bill/${congress}/${t}/${number}`;
  const get = async (path: string) => {
    const url = `${base}${path}?api_key=${apiKey}`;
    const resp = await congressFetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new BillSourceError(`Congress.gov returned HTTP ${resp.status}`);
    return resp.json() as Promise<Record<string, unknown>>;
  };
  const [s, x] = await Promise.all([get("/summaries"), get("/text")]);
  return {
    crsSummaries: (s.summaries as RawCrsSummary[]) ?? [],
    textVersions: (x.textVersions as RawTextVersion[]) ?? [],
  };
}
