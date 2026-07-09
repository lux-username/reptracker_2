// Full upcoming-events index (Issue #16).
//
// `decisions.ts` used to do a bounded *live* sweep of the most-recently-updated
// committee meetings per request (SWEEP_LIMIT), because Congress.gov's
// committee-meeting LIST returns only event ids — no date, no committee, no
// member filter — so the date/committee live on each meeting's DETAIL and there
// is no way to ask "just the upcoming ones." A rep whose meeting fell outside
// that recent window was silently missed.
//
// This module replaces the per-request cap with a single pre-computed index in
// Upstash, built by the nightly cron (Issue #16, #7): the servable set of
// *upcoming, live* meetings across both chambers. `decisions.ts` reads the index
// and filters it to a rep's committees — no network on the warm path.
//
// The 60s Vercel Hobby function ceiling makes one exhaustive pass impossible
// (house+senate together are ~2,500 meeting details). So the refresh is
// **convergent**: each night it advances a per-chamber cursor through the LIST,
// fetches a bounded budget of details, and merges the upcoming/live ones into
// the index while pruning the ones that have passed or been cancelled. Over a
// few nights the cursor laps the full list, so no meeting stays missed — and the
// LIST is update-ordered, so freshly (re)scheduled meetings cluster at offset 0
// and surface on the very next run. See the 2026-07-09 free-tier decision.
import { type RawMeetingDetail, MeetingError } from "./decisions";
import { cached, cacheKey, redisClient, TTL } from "./cache";
import { congressFetch } from "./rate-limit";

/** The persisted index: the upcoming/live meeting set + convergence cursors. */
export interface EventsIndex {
  /** ISO timestamp of the run that last wrote this index. */
  builtAt: string;
  /** Congress the meetings belong to (the run's current congress). */
  congress: number;
  /** Per-chamber LIST offset the next run resumes from (wraps at list end). */
  cursor: { house: number; senate: number };
  /** Upcoming, live meeting details — exactly the set `decisions.ts` serves. */
  meetings: RawMeetingDetail[];
}

const INDEX_KEY = cacheKey("events-index");

type Chamber = "house" | "senate";
const CHAMBERS: Chamber[] = ["house", "senate"];

/** Max details re-swept from the front (update-ordered) of each list per run. */
const HEAD_SWEEP = 250;

/** A meeting is servable if it is dated in the future and not dead. */
const DEAD_STATUSES = new Set(["canceled", "cancelled", "postponed"]);
function isUpcomingLive(m: RawMeetingDetail, now: Date): boolean {
  if (!m.date) return false;
  const t = Date.parse(m.date);
  if (Number.isNaN(t) || t < now.getTime()) return false;
  if (m.meetingStatus && DEAD_STATUSES.has(m.meetingStatus.toLowerCase())) return false;
  return true;
}

/**
 * Merge freshly-fetched details into the existing index set: newer wins on
 * eventId collision, then keep only the upcoming/live meetings, sorted
 * chronologically. Pure so the convergence logic is fixture-testable.
 *
 * Pruning runs over the *whole* set, not just the fresh details, so a meeting
 * that has since passed or been cancelled drops out even on a run whose cursor
 * didn't revisit it.
 */
export function mergeMeetings(
  existing: RawMeetingDetail[],
  fresh: RawMeetingDetail[],
  now: Date,
): RawMeetingDetail[] {
  const byId = new Map<string, RawMeetingDetail>();
  // Existing first, then fresh overwrites — fresh is the newer read.
  for (const m of existing) if (m.eventId) byId.set(m.eventId, m);
  for (const m of fresh) if (m.eventId) byId.set(m.eventId, m);

  const out = [...byId.values()].filter((m) => isUpcomingLive(m, now));
  out.sort((a, b) => Date.parse(a.date ?? "") - Date.parse(b.date ?? ""));
  return out;
}

// ---------------------------------------------------------------------------
// Read path (warm): decisions.ts serves from here.
// ---------------------------------------------------------------------------

/**
 * Read the pre-computed index from Upstash, or null when it is absent, caching
 * is disabled, or Redis errors — every one of which degrades the caller to a
 * live sweep. Never throws.
 */
export async function readEventsIndex(): Promise<EventsIndex | null> {
  const client = redisClient();
  if (!client) return null;
  try {
    return (await client.get<EventsIndex>(INDEX_KEY)) ?? null;
  } catch (e) {
    console.warn(`[events-index] read failed: ${String(e)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write path (cron): the convergent refresh.
// ---------------------------------------------------------------------------

interface MeetingListItem {
  eventId?: string;
  url?: string;
}

async function apiJson<T>(url: string): Promise<T> {
  const resp = await congressFetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new MeetingError(`Congress.gov returned HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

/** Run `tasks` with at most `limit` in flight, preserving input order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Page a chamber's committee-meeting LIST starting at `offset`, collecting up to
 * `budget` items. Returns the items plus the total list count (for cursor wrap).
 */
async function collectListItems(
  congress: number,
  chamber: Chamber,
  offset: number,
  budget: number,
  apiKey: string,
): Promise<{ items: MeetingListItem[]; total: number }> {
  const items: MeetingListItem[] = [];
  let total = 0;
  let at = offset;
  const PAGE = 250; // Congress.gov max page size

  while (items.length < budget) {
    const url = new URL(
      `https://api.congress.gov/v3/committee-meeting/${congress}/${chamber}`,
    );
    url.searchParams.set("offset", String(at));
    url.searchParams.set("limit", String(Math.min(PAGE, budget - items.length)));
    url.searchParams.set("api_key", apiKey);

    const page = await apiJson<{
      committeeMeetings?: MeetingListItem[];
      pagination?: { count?: number };
    }>(url.toString());

    total = page.pagination?.count ?? total;
    const batch = page.committeeMeetings ?? [];
    if (batch.length === 0) break; // ran off the end
    items.push(...batch);
    at += batch.length;
    if (total && at >= total) break; // reached the end of the list
  }
  return { items, total };
}

/** Fetch one meeting DETAIL, cached by stable eventId in the events tier. */
async function fetchDetail(
  item: MeetingListItem,
  apiKey: string,
): Promise<RawMeetingDetail | null> {
  if (!item.url) return null;
  const u = item.url.replace(/\?.*$/, "") + `?api_key=${apiKey}`;
  const load = () => apiJson<{ committeeMeeting?: RawMeetingDetail }>(u);
  try {
    const d = item.eventId
      ? await cached(cacheKey("mtg", item.eventId), TTL.events, load)
      : await load();
    return d.committeeMeeting ?? null;
  } catch {
    return null; // one bad meeting shouldn't sink the sweep
  }
}

/** Stats a refresh returns so the cron can report (spec: no silent caps). */
export interface RefreshStats {
  congress: number;
  perChamber: Record<Chamber, { swept: number; total: number; cursor: number }>;
  detailsFetched: number;
  indexSize: number;
}

export interface RefreshOptions {
  /** Current congress number (meetings are per-congress). */
  congress: number;
  now: Date;
  /** Total detail fetches this run, split across chambers. Env-tunable. */
  detailBudget?: number;
  /** Max concurrent Congress.gov detail fetches. */
  concurrency?: number;
}

/**
 * One convergent pass: resume each chamber's cursor, sweep a bounded slice of
 * the LIST, fetch details, merge the upcoming/live ones into the persisted
 * index, prune the stale ones, advance the cursors, and write the index back.
 *
 * Returns null when caching is disabled (there is nowhere to persist an index).
 * Individual fetch failures degrade to a smaller merge; they never throw.
 */
export async function refreshEventsIndex(
  opts: RefreshOptions,
): Promise<RefreshStats | null> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) throw new MeetingError("CONGRESS_GOV_API_KEY is not set");
  const client = redisClient();
  if (!client) return null; // no KV → nothing to warm

  const { congress, now } = opts;
  const detailBudget = opts.detailBudget ?? 600;
  const concurrency = opts.concurrency ?? 8;
  const perChamberBudget = Math.max(2, Math.floor(detailBudget / CHAMBERS.length));
  // Reserve part of each chamber's budget for a from-the-front "head" sweep so
  // the most-recently-updated meetings refresh every run (promptness); the rest
  // advances the cursor deeper into the list (coverage).
  const headBudget = Math.min(HEAD_SWEEP, Math.floor(perChamberBudget / 2));

  const prior = (await readEventsIndex()) ?? null;
  // A congress rollover invalidates the old set; start clean.
  const seed = prior && prior.congress === congress ? prior : null;
  const cursor = { house: seed?.cursor.house ?? 0, senate: seed?.cursor.senate ?? 0 };

  const fresh: RawMeetingDetail[] = [];
  const perChamber = {} as RefreshStats["perChamber"];
  let detailsFetched = 0;

  for (const chamber of CHAMBERS) {
    // Head: the update-ordered front of the list, always re-swept.
    const head = await collectListItems(congress, chamber, 0, headBudget, apiKey);
    // Cursor slice: continue the deep sweep from where the last run stopped.
    const cursorBudget = perChamberBudget - head.items.length;
    const slice =
      cursorBudget > 0
        ? await collectListItems(congress, chamber, cursor[chamber], cursorBudget, apiKey)
        : { items: [] as MeetingListItem[], total: head.total };
    const total = slice.total || head.total;

    // Dedupe head ∩ cursor by eventId; detail fetches are cached by eventId so a
    // collision costs one fetch, but we avoid re-listing it twice.
    const seen = new Set<string>();
    const items = [...head.items, ...slice.items].filter((it) => {
      const id = it.eventId ?? it.url ?? "";
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const details = await mapLimit(items, concurrency, (it) => fetchDetail(it, apiKey));
    const kept = details.filter((d): d is RawMeetingDetail => d !== null);
    fresh.push(...kept);
    detailsFetched += kept.length;

    // Advance and wrap the cursor past this run's slice, looping at list end so
    // the cursor eventually laps the whole list (full coverage over N nights).
    const advanced = cursor[chamber] + slice.items.length;
    const nextCursor = total > 0 ? advanced % total : 0;
    perChamber[chamber] = { swept: items.length, total, cursor: nextCursor };
    cursor[chamber] = nextCursor;
  }

  const meetings = mergeMeetings(seed?.meetings ?? [], fresh, now);
  const index: EventsIndex = {
    builtAt: now.toISOString(),
    congress,
    cursor,
    meetings,
  };

  try {
    await client.set(INDEX_KEY, index, { ex: TTL.prewarm });
  } catch (e) {
    console.warn(`[events-index] write failed: ${String(e)}`);
  }

  return { congress, perChamber, detailsFetched, indexSize: meetings.length };
}
