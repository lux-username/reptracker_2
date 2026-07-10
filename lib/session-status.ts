// Congressional session / recess detection (Issue #8, #27, spec §"Recess behavior").
//
// The page changes character during a recess: a constituent can't influence a
// committee vote that isn't happening, but they *can* reach a rep who's back in
// their state/district. The House and Senate recess on **different** schedules,
// so this is computed per chamber — never for "Congress" as one thing.
//
// Sources, in the "authoritative first, corroborate, never let a bare data-gap
// heuristic decide" order the owner set (decisions.md 2026-07-09):
//
//   - **Senate** — the official annual tentative-schedule XML
//     (`senate.gov/legislative/<year>_schedule.xml`) lists the year's
//     *non-legislative periods* as ISO date ranges. A multi-day "State Work
//     Period" range covering today ⇒ the Senate is in recess. (Single federal
//     holidays are separate rows with an empty `<action>` — they must NOT
//     trigger the pivot, so we key strictly on the "…Work Period" action.) The
//     Senate floor page's next-convene date — already scraped for #4 and passed
//     in via the FloorSchedule — refines the precise return date; the range's
//     end is the fallback.
//
//   - **House** — the House publishes no machine-readable calendar (only a PDF),
//     so we lean on the docs.house.gov weekly floor XML already scraped for #4:
//     its `weekOf` Monday is the authoritative "a session is scheduled this
//     week" signal. A `weekOf` earlier than the current week (nothing posted for
//     the week we're in) ⇒ the House is not in session. No reliable return date
//     exists without the PDF, so the House "until [date]" is **omitted** rather
//     than guessed (spec editorial stance: never state what we can't verify).
//
// Failure degrades toward the *normal* UI, never toward a false recess: if the
// Senate calendar can't be loaded we report "in session", so the worst case is
// the milder #27 "nothing scheduled" copy — never a wrong "Congress is home".
//
// The parsers/derivations are pure and fixture-tested; the I/O wraps them.
import * as cheerio from "cheerio";
import type { FloorSchedule, HouseFloor } from "./floor-schedule";
import { cached, cacheKey, TTL } from "./cache";

/** In-session/recess state for one chamber. */
export interface ChamberStatus {
  inSession: boolean;
  /**
   * When `!inSession`: the ISO date (YYYY-MM-DD) the chamber next convenes, or
   * null when we can't determine it (the House case). Meaningless when in
   * session.
   */
  returnDate: string | null;
}

/** Per-chamber session status for the whole page (address-independent). */
export interface SessionStatus {
  /** ISO timestamp of the derivation. */
  builtAt: string;
  house: ChamberStatus;
  senate: ChamberStatus;
}

/** One non-legislative "State Work Period" range from the Senate calendar. */
export interface RecessPeriod {
  /** ISO date the recess begins (inclusive). */
  begin: string;
  /** ISO date the recess ends (inclusive). */
  end: string;
}

// ---------------------------------------------------------------------------
// Pure parsers / derivations (fixture-tested).
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO calendar date (YYYY-MM-DD) of a Date, in UTC. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO date of the Monday of the week containing `now` (UTC, weekly granularity). */
export function mondayOf(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return isoDate(d);
}

/** ISO date of the next weekday (Mon–Fri) strictly after `iso`. */
function nextBusinessDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return isoDate(d);
}

/**
 * Parse the Senate annual tentative-schedule XML into its multi-day recess
 * ("State Work Period") ranges. Single-day federal holidays (empty `<action>`)
 * are deliberately excluded — they aren't a recess. Returns [] for a document
 * with no work periods (a legitimately possible, non-error result).
 */
export function parseSenateRecesses(xml: string): RecessPeriod[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out: RecessPeriod[] = [];
  $("schedule > dates > date").each((_, el) => {
    const d = $(el);
    const action = d.find("action").first().text().trim();
    if (!/work period/i.test(action)) return; // recesses only; skip holidays/other
    const begin = d.find("beginDate").first().text().trim();
    if (!ISO_DATE.test(begin)) return;
    const endRaw = d.find("endDate").first().text().trim();
    const end = ISO_DATE.test(endRaw) ? endRaw : begin; // single-day work period
    out.push({ begin, end });
  });
  return out;
}

/**
 * Normalize the Senate floor page's human next-convene string ("Monday, Jul 13,
 * 2026") to an ISO date, but only when it parses and is on/after `today`.
 * Returns null otherwise, so a stale convene note never becomes the return date.
 */
function normalizeConvene(raw: string | null, today: string): string | null {
  if (!raw) return null;
  const t = Date.parse(raw.replace(/^\s*[A-Za-z]+,\s*/, "")); // strip leading weekday
  if (Number.isNaN(t)) return null;
  const iso = isoDate(new Date(t));
  return iso >= today ? iso : null;
}

/**
 * Derive the Senate's status from its recess ranges + the floor next-convene
 * note. In recess when today falls inside a range; the return date prefers the
 * (more precise) floor convene date, falling back to the business day after the
 * range's end.
 */
export function senateStatus(
  now: Date,
  recesses: RecessPeriod[],
  nextConvene: string | null,
): ChamberStatus {
  const today = isoDate(now);
  const active = recesses.find((r) => r.begin <= today && today <= r.end);
  if (!active) return { inSession: true, returnDate: null };
  const returnDate = normalizeConvene(nextConvene, today) ?? nextBusinessDay(active.end);
  return { inSession: false, returnDate };
}

/**
 * Derive the House's status from the weekly floor XML already scraped for #4.
 * In session when a schedule is posted for the current week or later; out when
 * the latest posted week is in the past (or nothing is posted at all). No
 * return date is derivable without the PDF calendar, so it stays null.
 */
export function houseStatus(now: Date, house: HouseFloor | null): ChamberStatus {
  if (house && house.weekOf >= mondayOf(now)) return { inSession: true, returnDate: null };
  return { inSession: false, returnDate: null };
}

// ---------------------------------------------------------------------------
// I/O: fetch + cache the Senate calendar, then derive.
// ---------------------------------------------------------------------------

const UA = "Mozilla/5.0 (compatible; reptracker/1.0; +https://reptracker2.vercel.app)";

function senateScheduleUrl(now: Date): string {
  return `https://www.senate.gov/legislative/${now.getUTCFullYear()}_schedule.xml`;
}

/**
 * Read the year's Senate recess ranges, cached in Upstash (reference tier — the
 * annual calendar is near-static, revised only occasionally). Never throws: a
 * fetch/parse failure or disabled cache degrades to [], i.e. "no known recess"
 * (→ normal UI, never a false recess).
 */
export async function getSenateRecesses(now: Date): Promise<RecessPeriod[]> {
  try {
    return await cached(
      cacheKey("senate-schedule", now.getUTCFullYear()),
      TTL.reference,
      async () => {
        const resp = await fetch(senateScheduleUrl(now), {
          headers: { "User-Agent": UA, Accept: "application/xml,text/xml,*/*" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} from Senate schedule`);
        return parseSenateRecesses(await resp.text());
      },
    );
  } catch (e) {
    console.warn(`[session] senate schedule load failed: ${String(e)}`);
    return [];
  }
}

/**
 * Per-chamber session status for the page. Takes the already-fetched
 * FloorSchedule (so the House signal + the Senate convene date are reused with
 * no extra network) and the cached Senate calendar. Never throws.
 */
export async function getSessionStatus(
  now: Date,
  floor: FloorSchedule | null,
): Promise<SessionStatus> {
  const recesses = await getSenateRecesses(now);
  return {
    builtAt: now.toISOString(),
    house: houseStatus(now, floor?.house ?? null),
    senate: senateStatus(now, recesses, floor?.senate?.date ?? null),
  };
}
