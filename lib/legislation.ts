// Sponsored & cosponsored bills — the "secondary context" list (spec §2.3).
//
// All rules are factual / non-editorial. Inclusion, sort, and cap are pure and
// fixture-tested; only the two fetches touch the network. Plain-English bill
// summaries are Issue #5 — here we carry the official title + a Congress.gov
// link, which is the spec's structured fallback.
import type { SecondaryBill, SponsorBadge } from "./types";
import { cached, cacheKey, TTL } from "./cache";
import { congressFetch } from "./rate-limit";

/** Raw Congress.gov sponsored/cosponsored-legislation list item. */
export interface RawLegislationItem {
  congress?: number;
  type?: string;
  number?: string;
  title?: string;
  introducedDate?: string;
  latestAction?: { actionDate?: string; text?: string };
  policyArea?: { name?: string };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `date` to `now` (positive = date is in the past). */
function daysAgo(now: Date, date: string | null | undefined): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / DAY_MS;
}

/**
 * Does a latest-action text describe a *procedural milestone*? Defined narrowly
 * (spec §2.3): referral, committee report, markup, hearing, floor action,
 * passage, conference. Cosponsor-count changes, sponsorship reprints, and text
 * revisions explicitly do NOT count.
 */
export function isProceduralMilestone(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // Denylist first: sponsorship/cosponsor bookkeeping is not procedural activity.
  if (/cosponsor|sponsorship|reprint|assuming first sponsor/.test(t)) return false;
  return /referred to|reported|ordered to be reported|committee report|report of the committee|mark(ed)? up|markup|hearing|passed|agreed to|placed on the .*calendar|floor|conference|received in the (house|senate)|read (the )?(first|second) time|became public law|signed by president|presented to president/.test(
    t,
  );
}

const TYPE_DISPLAY: Record<string, string> = {
  HR: "H.R.",
  S: "S.",
  HJRES: "H.J.Res.",
  SJRES: "S.J.Res.",
  HCONRES: "H.Con.Res.",
  SCONRES: "S.Con.Res.",
  HRES: "H.Res.",
  SRES: "S.Res.",
};

const TYPE_URL_SEGMENT: Record<string, string> = {
  HR: "house-bill",
  S: "senate-bill",
  HJRES: "house-joint-resolution",
  SJRES: "senate-joint-resolution",
  HCONRES: "house-concurrent-resolution",
  SCONRES: "senate-concurrent-resolution",
  HRES: "house-resolution",
  SRES: "senate-resolution",
};

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

function toSecondaryBill(item: RawLegislationItem, badge: SponsorBadge): SecondaryBill | null {
  const { congress, type, number } = item;
  if (!congress || !type || !number) return null;
  const upper = type.toUpperCase();
  const seg = TYPE_URL_SEGMENT[upper];
  return {
    billId: `${upper.toLowerCase()}-${number}-${congress}`,
    displayId: `${TYPE_DISPLAY[upper] ?? upper} ${number}`,
    congress,
    type: upper,
    number,
    title: item.title ?? `${TYPE_DISPLAY[upper] ?? upper} ${number}`,
    introducedDate: item.introducedDate ?? null,
    latestActionDate: item.latestAction?.actionDate ?? null,
    latestActionText: item.latestAction?.text ?? null,
    policyArea: item.policyArea?.name ?? null,
    badge,
    url: seg
      ? `https://www.congress.gov/bill/${ordinal(congress)}-congress/${seg}/${number}`
      : `https://www.congress.gov/search?q=${upper}${number}`,
  };
}

/** A distinctive keyword per committee name for the loose in-committee match. */
function committeeKeyword(name: string): string {
  // "House Committee on Agriculture" → "agriculture"; subcommittee names pass through.
  return name
    .replace(/^(house|senate|joint)\s+committee\s+on\s+/i, "")
    .replace(/^(house|senate)\s+/i, "")
    .toLowerCase()
    .trim();
}

/**
 * Is a bill within a committee the rep sits on? Best-effort: the list endpoint
 * carries no structured committee, so we match the rep's committee keywords
 * against the bill's latest-action text + policy area. (A precise match needs
 * the per-bill /committees endpoint — deferred with the summary pipeline.)
 */
function inRepCommittee(item: RawLegislationItem, committeeKeywords: string[]): boolean {
  const hay = `${item.latestAction?.text ?? ""} ${item.policyArea?.name ?? ""}`.toLowerCase();
  return committeeKeywords.some((kw) => kw.length > 3 && hay.includes(kw));
}

/** Temporal-urgency bucket from the latest action's recency (0 = most urgent). */
function urgencyBucket(now: Date, item: RawLegislationItem): number {
  const d = daysAgo(now, item.latestAction?.actionDate);
  if (d === null) return 3;
  if (d < 0 && d >= -14) return 0; // scheduled in the next 14 days
  if (d >= 0 && d <= 14) return 1; // acted on in the last 14 days
  if (d > 14 && d <= 30) return 2; // acted on in the last 15–30 days
  return 3;
}

interface Scored extends SecondaryBill {
  _bucket: number;
  _inCommittee: boolean;
  _actionMs: number;
}

/**
 * Select the secondary-context bills (spec §2.3): primary-sponsored bills from
 * the last 60 days, plus cosponsored bills with procedural activity in the last
 * 30 days; hierarchically sorted; capped at 7.
 */
export function selectSecondaryBills(
  sponsored: RawLegislationItem[],
  cosponsored: RawLegislationItem[],
  committeeNames: string[],
  now: Date,
): SecondaryBill[] {
  const keywords = committeeNames.map(committeeKeyword);
  const scored: Scored[] = [];

  const consider = (item: RawLegislationItem, badge: SponsorBadge) => {
    const bill = toSecondaryBill(item, badge);
    if (!bill) return;
    const actionMs = item.latestAction?.actionDate
      ? Date.parse(item.latestAction.actionDate)
      : NaN;
    scored.push({
      ...bill,
      badge,
      _bucket: urgencyBucket(now, item),
      _inCommittee: inRepCommittee(item, keywords),
      _actionMs: Number.isNaN(actionMs) ? 0 : actionMs,
    });
  };

  for (const item of sponsored) {
    const age = daysAgo(now, item.introducedDate);
    // Primary sponsor: introduced in the last 60 days (ignore future-dated noise).
    if (age !== null && age >= 0 && age <= 60) consider(item, "Primary sponsor");
  }
  for (const item of cosponsored) {
    const actionAge = daysAgo(now, item.latestAction?.actionDate);
    if (
      actionAge !== null &&
      actionAge <= 30 &&
      isProceduralMilestone(item.latestAction?.text)
    ) {
      consider(item, "Cosponsor");
    }
  }

  scored.sort((a, b) => {
    // 1. sponsor type — primary before cosponsor
    const sa = a.badge === "Primary sponsor" ? 0 : 1;
    const sb = b.badge === "Primary sponsor" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    // 2. temporal urgency
    if (a._bucket !== b._bucket) return a._bucket - b._bucket;
    // 3. in the rep's committee
    if (a._inCommittee !== b._inCommittee) return a._inCommittee ? -1 : 1;
    // 4. timestamp — soonest-upcoming first in the future bucket, else most-recent
    return a._bucket === 0 ? a._actionMs - b._actionMs : b._actionMs - a._actionMs;
  });

  return scored.slice(0, 7).map(({ _bucket, _inCommittee, _actionMs, ...bill }) => bill);
}

// ---------------------------------------------------------------------------
// I/O: the two Congress.gov list fetches (Issue #7 adds caching on top).
// ---------------------------------------------------------------------------

export class LegislationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegislationError";
  }
}

/** Fetch one legislation list, cached in the reference tier (4-6h). */
function fetchList(
  bioguideId: string,
  kind: "sponsored-legislation" | "cosponsored-legislation",
  field: "sponsoredLegislation" | "cosponsoredLegislation",
): Promise<RawLegislationItem[]> {
  return cached(cacheKey("leg", kind, bioguideId), TTL.reference, () =>
    fetchListLive(bioguideId, kind, field),
  );
}

async function fetchListLive(
  bioguideId: string,
  kind: "sponsored-legislation" | "cosponsored-legislation",
  field: "sponsoredLegislation" | "cosponsoredLegislation",
): Promise<RawLegislationItem[]> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) throw new LegislationError("CONGRESS_GOV_API_KEY is not set");
  const url = new URL(`https://api.congress.gov/v3/member/${bioguideId}/${kind}`);
  url.searchParams.set("limit", "50");
  url.searchParams.set("api_key", apiKey);
  const resp = await congressFetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new LegislationError(`Congress.gov returned HTTP ${resp.status}`);
  const data = (await resp.json()) as Record<string, RawLegislationItem[] | undefined>;
  return data[field] ?? [];
}

/** Fetch + select the secondary-context bills for a rep. */
export async function fetchSecondaryBills(
  bioguideId: string,
  committeeNames: string[],
  now: Date,
): Promise<SecondaryBill[]> {
  const [sponsored, cosponsored] = await Promise.all([
    fetchList(bioguideId, "sponsored-legislation", "sponsoredLegislation"),
    fetchList(bioguideId, "cosponsored-legislation", "cosponsoredLegislation"),
  ]);
  return selectSecondaryBills(sponsored, cosponsored, committeeNames, now);
}
