// Nightly pre-warm orchestrator (Issue #16, #7).
//
// The cron's job is to make the common visit a warm-cache hit. It warms, in
// order of value-per-call:
//
//   1. The two congress-legislators committee JSONs (shared by every rep) — 2
//      calls, via fetchAssignmentIndex.
//   2. Every jurisdiction's member list — ~56 cheap calls that warm the member-
//      identity path for all 435 districts + delegates + 100 senators at once.
//   3. Per-member DC-office contact — 535+ calls, the expensive tier. Warmed as
//      a **convergent slice** per run (a cursor walks the roster over several
//      nights) so it fits the ~60s Vercel Hobby function ceiling.
//   4. The upcoming-events index (Issue #16's real payload) — see events-index.
//
// Everything is budgeted and the route reports what each pass covered; nothing
// is silently capped (spec: no silent caps, degrade don't stall). Geocoding is
// per-address and Anthropic is retired, so neither is touched — the cron makes
// no variable-cost calls. See the 2026-07-09 free-tier decision.
import { fetchAssignmentIndex } from "./committees";
import { fetchStateMembers } from "./congress";
import { fetchContact } from "./rep-profile";
import { mapLimit, refreshEventsIndex, type RefreshStats } from "./events-index";
import { cacheKey, redisClient } from "./cache";

/**
 * Jurisdictions Congress.gov lists members for: the 50 states plus the five
 * delegate territories and DC (Puerto Rico's resident commissioner included).
 */
export const JURISDICTIONS: readonly string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "AS", "DC", "GU", "MP", "PR", "VI",
];

const CONTACT_CURSOR_KEY = cacheKey("prewarm-contact-cursor");

/** Best-effort current congress from the year (matches resolve-reps). */
export function currentCongress(now: Date): number {
  return Math.floor((now.getFullYear() - 1789) / 2) + 1;
}

export interface PrewarmStats {
  congress: number;
  committeeData: "warmed" | "failed";
  members: { warmed: number; failed: number; roster: number };
  contacts: { warmed: number; failed: number; from: number; to: number; roster: number };
  events: RefreshStats | null;
}

export interface PrewarmOptions {
  now: Date;
  /** Concurrent Congress.gov fetches for member/contact warming. */
  concurrency?: number;
  /** Contacts warmed per run (the convergent slice). */
  contactBudget?: number;
  /** Detail fetches for the events index refresh. */
  eventsDetailBudget?: number;
}

/**
 * Run one nightly pre-warm pass. Individual warm failures are counted and
 * swallowed — a warm miss just means that key stays cold until the next visit or
 * run; it never fails the cron.
 */
export async function prewarm(opts: PrewarmOptions): Promise<PrewarmStats> {
  const { now } = opts;
  const concurrency = opts.concurrency ?? 8;
  const contactBudget = opts.contactBudget ?? 120;
  const congress = currentCongress(now);

  // 1. Shared committee data (also feeds nothing else here, but warms the JSONs).
  let committeeData: PrewarmStats["committeeData"] = "warmed";
  try {
    await fetchAssignmentIndex();
  } catch (e) {
    committeeData = "failed";
    console.warn(`[prewarm] committee data warm failed: ${String(e)}`);
  }

  // 2. Member lists for every jurisdiction; collect the roster of bioguide ids.
  const bioguides = new Set<string>();
  let membersWarmed = 0;
  let membersFailed = 0;
  await mapLimit(JURISDICTIONS, concurrency, async (state) => {
    try {
      const members = await fetchStateMembers(congress, state);
      for (const m of members) if (m.bioguideId) bioguides.add(m.bioguideId);
      membersWarmed++;
    } catch (e) {
      membersFailed++;
      console.warn(`[prewarm] member list warm failed for ${state}: ${String(e)}`);
    }
  });

  // 3. Convergent contact warm: a cursor walks the (stable-sorted) roster so
  //    successive nights cover everyone without exceeding the function ceiling.
  const roster = [...bioguides].sort();
  const contacts = await warmContactSlice(roster, contactBudget, concurrency);

  // 4. The upcoming-events index — the cron's real payload.
  let events: RefreshStats | null = null;
  try {
    events = await refreshEventsIndex({
      congress,
      now,
      detailBudget: opts.eventsDetailBudget,
      concurrency,
    });
  } catch (e) {
    console.warn(`[prewarm] events index refresh failed: ${String(e)}`);
  }

  return { congress, committeeData, members: { warmed: membersWarmed, failed: membersFailed, roster: roster.length }, contacts, events };
}

/** Warm `budget` contacts starting at the persisted cursor; advance and wrap. */
async function warmContactSlice(
  roster: string[],
  budget: number,
  concurrency: number,
): Promise<PrewarmStats["contacts"]> {
  const empty = { warmed: 0, failed: 0, from: 0, to: 0, roster: roster.length };
  if (roster.length === 0) return empty;

  const client = redisClient();
  let from = 0;
  if (client) {
    try {
      from = (await client.get<number>(CONTACT_CURSOR_KEY)) ?? 0;
    } catch {
      from = 0;
    }
  }
  from = ((from % roster.length) + roster.length) % roster.length; // normalize

  const take = Math.min(budget, roster.length);
  const slice = Array.from({ length: take }, (_, i) => roster[(from + i) % roster.length]);

  let warmed = 0;
  let failed = 0;
  await mapLimit(slice, concurrency, async (bioguide) => {
    try {
      await fetchContact(bioguide);
      warmed++;
    } catch (e) {
      failed++;
      console.warn(`[prewarm] contact warm failed for ${bioguide}: ${String(e)}`);
    }
  });

  const to = (from + take) % roster.length;
  if (client) {
    try {
      await client.set(CONTACT_CURSOR_KEY, to);
    } catch (e) {
      console.warn(`[prewarm] contact cursor write failed: ${String(e)}`);
    }
  }
  return { warmed, failed, from, to, roster: roster.length };
}
