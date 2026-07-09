// Upcoming decisions — the chronological list of committee meetings, hearings,
// and markups a rep has a structural role in (spec §2.2).
//
// Congress.gov's committee-meeting LIST returns only event ids; the committee,
// date, and status live on each meeting's DETAIL. There is no member filter.
//
// Warm path (the common case): the nightly cron builds a complete index of all
// upcoming/live meetings in Upstash (Issue #16, `events-index.ts`); we read it
// and filter to the rep's committees with zero network. Cold path (no cron yet,
// KV disabled, or a Redis miss): fall back to a bounded live sweep of the recent
// detail window — usable but capped, and it logs when it truncates (spec: no
// silent caps, degrade don't stall).
//
// The match/order/label logic is pure and fixture-tested. Plain-English topic
// summaries are Issue #5 — here the "what" is the official meeting title + a
// Congress.gov committee link.
import type { CommitteeAssignment, UpcomingDecision } from "./types";
import { cached, cacheKey, TTL } from "./cache";
import { readEventsIndex } from "./events-index";

/** Raw committee reference inside a meeting detail. */
export interface RawMeetingCommittee {
  name?: string;
  systemCode?: string;
  url?: string;
}

/** Raw Congress.gov committee-meeting detail (fields we consume). */
export interface RawMeetingDetail {
  eventId?: string;
  type?: string;
  title?: string;
  meetingStatus?: string;
  date?: string;
  chamber?: string;
  /** Congress the meeting belongs to — needed for its public event URL. */
  congress?: number;
  committees?: RawMeetingCommittee[];
  location?: { building?: string; room?: string };
}

/**
 * Congress.gov meeting `systemCode` ("hsag00", "hsag16") → committee-membership
 * code ("HSAG", "HSAG16"). Full committees carry a trailing "00"; subcommittees
 * carry their own two-digit suffix.
 */
export function normalizeSystemCode(systemCode: string): string {
  const up = systemCode.toUpperCase();
  return up.endsWith("00") ? up.slice(0, -2) : up;
}

/** Structural role label for a decision, from the rep's role on its committee. */
export function decisionRoleLabel(assignment: CommitteeAssignment): string {
  const scope = assignment.isSubcommittee ? "Subcommittee" : "Committee";
  switch (assignment.role) {
    case "Chair":
      return assignment.isSubcommittee ? "Subcommittee Chair" : "Chair";
    case "Ranking Member":
      return assignment.isSubcommittee ? "Subcommittee Ranking Member" : "Ranking Member";
    case "Vice Chair":
      return `${scope} Vice Chair`;
    default:
      return `${scope} Member`;
  }
}

function formatLocation(loc: RawMeetingDetail["location"]): string | null {
  if (!loc) return null;
  const parts = [loc.room, loc.building].filter((p): p is string => !!p);
  return parts.length ? parts.join(", ") : null;
}

/** English ordinal suffix for a positive integer (119 → "th", 121 → "st"). */
function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * The public Congress.gov page for a specific committee meeting/event — the page
 * that actually shows *this Tuesday's meeting*, not the committee's landing page.
 * This is the form Congress.gov's own API returns for an event (the `videos[].url`
 * on a meeting detail, e.g.
 * `https://www.congress.gov/event/119th-Congress/house-event/119394`).
 * Returns null when we lack the pieces to build it (caller falls back).
 */
export function congressEventUrl(
  congress: number | undefined,
  chamber: "house" | "senate",
  eventId: string,
): string | null {
  if (!congress || !eventId) return null;
  return `https://www.congress.gov/event/${congress}${ordinalSuffix(congress)}-Congress/${chamber}-event/${eventId}`;
}

/** Statuses that mean the meeting is no longer an upcoming decision. */
const DEAD_STATUSES = new Set(["canceled", "cancelled", "postponed"]);

/**
 * Reduce a set of raw meeting details to the decisions a rep has a role in:
 * matched to the rep's committees, future + live only, chronological, each
 * carrying the rep's structural role on the committee holding it.
 */
export function buildUpcomingDecisions(
  meetings: RawMeetingDetail[],
  assignments: CommitteeAssignment[],
  now: Date,
): UpcomingDecision[] {
  const byCode = new Map(assignments.map((a) => [a.code, a]));
  const out: UpcomingDecision[] = [];

  for (const m of meetings) {
    if (!m.date) continue;
    const t = Date.parse(m.date);
    if (Number.isNaN(t) || t < now.getTime()) continue; // past → not upcoming
    if (m.meetingStatus && DEAD_STATUSES.has(m.meetingStatus.toLowerCase())) continue;

    // A meeting can list several committees; keep the one the rep sits on with
    // the most senior role (lowest weight wins).
    let best: { committee: RawMeetingCommittee; assignment: CommitteeAssignment } | null = null;
    for (const c of m.committees ?? []) {
      if (!c.systemCode) continue;
      const assignment = byCode.get(normalizeSystemCode(c.systemCode));
      if (!assignment) continue;
      if (!best || roleRank(assignment.role) < roleRank(best.assignment.role)) {
        best = { committee: c, assignment };
      }
    }
    if (!best) continue;

    const { committee, assignment } = best;
    const chamber = (m.chamber ?? "").toLowerCase() === "senate" ? "senate" : "house";
    const eventId = m.eventId ?? "";
    // Link to the specific event page (shows *this* meeting), falling back to the
    // committee landing page only when we can't build the event URL (Issue #20).
    const url =
      congressEventUrl(m.congress, chamber, eventId) ??
      `https://www.congress.gov/committee/${chamber}-committee/${(committee.systemCode ?? "").toLowerCase()}`;
    out.push({
      eventId,
      kind: m.type ?? "Meeting",
      title: m.title ?? `${assignment.name} ${m.type ?? "meeting"}`,
      date: m.date,
      location: formatLocation(m.location),
      committeeName: committee.name ?? assignment.name,
      committeeCode: assignment.code,
      roleLabel: decisionRoleLabel(assignment),
      url,
    });
  }

  out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)); // chronological
  return out;
}

function roleRank(role: CommitteeAssignment["role"]): number {
  return { Chair: 0, "Ranking Member": 1, "Vice Chair": 2, Member: 3 }[role];
}

// ---------------------------------------------------------------------------
// I/O: the read path (index-first, live-sweep fallback).
// ---------------------------------------------------------------------------

export class MeetingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetingError";
  }
}

/** How many recent meeting details to pull per sweep before we stop (logged). */
const SWEEP_LIMIT = 60;

interface MeetingListItem {
  eventId?: string;
  url?: string;
}

async function apiJson<T>(url: string): Promise<T> {
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new MeetingError(`Congress.gov returned HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

/**
 * Return the upcoming decisions the rep (via `assignments`) has a role in.
 *
 * Warm path: read the cron-built events index and filter it — no network. Cold
 * path (index absent / KV disabled / Redis miss): fall back to the bounded live
 * sweep below.
 */
export async function fetchUpcomingDecisions(
  congress: number,
  chamber: "house" | "senate",
  assignments: CommitteeAssignment[],
  now: Date,
): Promise<UpcomingDecision[]> {
  if (assignments.length === 0) return [];

  const index = await readEventsIndex();
  if (index) return buildUpcomingDecisions(index.meetings, assignments, now);

  return fetchUpcomingDecisionsLive(congress, chamber, assignments, now);
}

/**
 * Cold-path fallback: sweep the recent committee-meeting window for a chamber.
 * Bounded to SWEEP_LIMIT detail fetches; if the window is truncated we log it
 * (spec: no silent caps).
 */
async function fetchUpcomingDecisionsLive(
  congress: number,
  chamber: "house" | "senate",
  assignments: CommitteeAssignment[],
  now: Date,
): Promise<UpcomingDecision[]> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) throw new MeetingError("CONGRESS_GOV_API_KEY is not set");

  const listUrl = new URL(
    `https://api.congress.gov/v3/committee-meeting/${congress}/${chamber}`,
  );
  listUrl.searchParams.set("limit", String(SWEEP_LIMIT));
  listUrl.searchParams.set("api_key", apiKey);

  // Events tier (30-60min): the schedule can change on short notice, but a
  // per-request cache still absorbs repeat lookups within the window.
  const list = await cached(
    cacheKey("mtg-list", congress, chamber),
    TTL.events,
    () =>
      apiJson<{ committeeMeetings?: MeetingListItem[]; pagination?: { count?: number } }>(
        listUrl.toString(),
      ),
  );
  const items = list.committeeMeetings ?? [];
  const total = list.pagination?.count ?? items.length;
  if (total > SWEEP_LIMIT) {
    console.warn(
      `[decisions] cold-path ${chamber} meeting sweep capped at ${SWEEP_LIMIT} of ${total} — the warm events index (Issue #16) covers the rest`,
    );
  }

  const details = await Promise.all(
    items.map(async (it) => {
      if (!it.url) return null;
      try {
        const u = it.url.replace(/\?.*$/, "") + `?api_key=${apiKey}`;
        // Key detail fetches by eventId (stable, apiKey-free); fall back to a
        // live fetch when the list item omits one.
        const load = () => apiJson<{ committeeMeeting?: RawMeetingDetail }>(u);
        const d = it.eventId
          ? await cached(cacheKey("mtg", it.eventId), TTL.events, load)
          : await load();
        return d.committeeMeeting ?? null;
      } catch {
        return null; // one bad meeting shouldn't sink the section
      }
    }),
  );

  return buildUpcomingDecisions(
    details.filter((d): d is RawMeetingDetail => d !== null),
    assignments,
    now,
  );
}
