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
import { refreshFloorSchedule } from "./floor-schedule";
import { getSenateRecesses } from "./session-status";
import { refreshDistrictOffices } from "./district-offices";
import {
  committeeRoster,
  fetchCommitteeDocket,
  type CommitteeRef,
} from "./committee-bills";
import { cacheKey, redisClient } from "./cache";
import type { CommitteeAssignment } from "./types";

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
const DOCKET_CURSOR_KEY = cacheKey("prewarm-docket-cursor");

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
  /**
   * Floor-schedule scrape (Issue #4): house bill count, how many were enriched
   * with a CRS summary (Issue #37), and whether Senate posted.
   */
  floor: { houseBills: number; billsSummarized: number; senate: boolean };
  /** Senate recess calendar (Issue #8): count of State Work Period ranges warmed. */
  sessionCalendar: { senateRecesses: number };
  /** District-office index (Issue #13): members with a district office contact. */
  districtOffices: { members: number };
  /**
   * Committee dockets (Issue #21) — a convergent slice of the ~200 committees
   * reps sit on, warmed per run so an expand is a warm KV hit.
   */
  dockets: { warmed: number; failed: number; from: number; to: number; roster: number };
}

export interface PrewarmOptions {
  now: Date;
  /** Concurrent Congress.gov fetches for member/contact warming. */
  concurrency?: number;
  /** Contacts warmed per run (the convergent slice). */
  contactBudget?: number;
  /** Detail fetches for the events index refresh. */
  eventsDetailBudget?: number;
  /** Committee dockets warmed per run (the convergent slice). */
  docketBudget?: number;
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
  const docketBudget = opts.docketBudget ?? 8;
  const congress = currentCongress(now);

  // 1. Shared committee data. Warms the two congress-legislators JSONs and gives
  //    us the assignment index the committee-docket warm (step 7) walks.
  let committeeData: PrewarmStats["committeeData"] = "warmed";
  let assignmentIndex: Map<string, CommitteeAssignment[]> | null = null;
  try {
    assignmentIndex = await fetchAssignmentIndex();
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

  // 2b. District-office index (Issue #13) — one cheap fetch of a structured
  //     dataset, warmed *before* contacts so the contact warm reads it from KV.
  let districtOffices: PrewarmStats["districtOffices"] = { members: 0 };
  try {
    const idx = await refreshDistrictOffices();
    if (idx) districtOffices = { members: Object.keys(idx).length };
  } catch (e) {
    console.warn(`[prewarm] district-office refresh failed: ${String(e)}`);
  }

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

  // 5. Floor schedule (Issue #4) — a cheap best-effort scrape (~3 fetches) of the
  //    House weekly XML + Senate convene note, cached for the warm read path.
  let floor: PrewarmStats["floor"] = { houseBills: 0, billsSummarized: 0, senate: false };
  try {
    const fs = await refreshFloorSchedule(now);
    if (fs) {
      const bills = (fs.house?.categories ?? []).flatMap((c) => c.bills);
      const billsSummarized = bills.filter((b) => b.summary).length;
      floor = { houseBills: bills.length, billsSummarized, senate: fs.senate !== null };
    }
  } catch (e) {
    console.warn(`[prewarm] floor schedule refresh failed: ${String(e)}`);
  }

  // 6. Senate recess calendar (Issue #8) — one tiny near-static XML, warmed so
  //    the recess pivot reads it from KV. getSenateRecesses never throws.
  const senateRecesses = (await getSenateRecesses(now)).length;

  // 7. Committee dockets (Issue #21) — a convergent slice of the committees reps
  //    sit on, so expanding one is a warm hit. Skipped when committee data (and
  //    thus the roster) failed to load above.
  const dockets = await warmDocketSlice(
    assignmentIndex ? committeeRoster(assignmentIndex) : [],
    congress,
    docketBudget,
    concurrency,
  );

  return { congress, committeeData, members: { warmed: membersWarmed, failed: membersFailed, roster: roster.length }, contacts, events, floor, districtOffices, sessionCalendar: { senateRecesses }, dockets };
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

/**
 * Warm `budget` committee dockets starting at the persisted cursor; advance and
 * wrap. Same convergent-slice shape as warmContactSlice: over successive nights
 * the cursor laps the full roster. A docket already warm in KV is a cheap KV read
 * (fetchCommitteeDocket is `cached`), so a slot spent on it isn't wasted work.
 */
async function warmDocketSlice(
  roster: CommitteeRef[],
  congress: number,
  budget: number,
  concurrency: number,
): Promise<PrewarmStats["dockets"]> {
  const empty = { warmed: 0, failed: 0, from: 0, to: 0, roster: roster.length };
  if (roster.length === 0) return empty;

  const client = redisClient();
  let from = 0;
  if (client) {
    try {
      from = (await client.get<number>(DOCKET_CURSOR_KEY)) ?? 0;
    } catch {
      from = 0;
    }
  }
  from = ((from % roster.length) + roster.length) % roster.length; // normalize

  const take = Math.min(budget, roster.length);
  const slice = Array.from({ length: take }, (_, i) => roster[(from + i) % roster.length]);

  let warmed = 0;
  let failed = 0;
  await mapLimit(slice, concurrency, async (ref) => {
    try {
      await fetchCommitteeDocket(congress, ref.chamber, ref.systemCode);
      warmed++;
    } catch (e) {
      failed++;
      console.warn(`[prewarm] docket warm failed for ${ref.systemCode}: ${String(e)}`);
    }
  });

  const to = (from + take) % roster.length;
  if (client) {
    try {
      await client.set(DOCKET_CURSOR_KEY, to);
    } catch (e) {
      console.warn(`[prewarm] docket cursor write failed: ${String(e)}`);
    }
  }
  return { warmed, failed, from, to, roster: roster.length };
}
