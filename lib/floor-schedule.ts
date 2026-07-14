// "Floor this week" — the upcoming House and Senate floor schedule (Issue #4,
// spec §2.3 item 3). This is the one *global*, address-independent section: every
// member votes on these same floor items, so unlike committee action it is the
// same for every visitor.
//
// Sources (both public, best-effort — spec "Known risks: floor-schedule scrape
// will break"):
//   - House: docs.house.gov publishes a structured **weekly XML** feed
//     (`/billsthisweek/YYYYMMDD/YYYYMMDD.xml`). We scrape the /floor index only to
//     discover the current week's XML path (so we never have to guess which Monday
//     it is around week/recess boundaries), then parse the XML — far more robust
//     than scraping the rendered HTML. Empty in deep recess (no XML posted).
//   - Senate: senate.gov's floor-schedule page carries only the next convene
//     date/time in semantic HTML — no bill list far in advance (spec: "more
//     brittle; often absent"). We surface that convene note; bill-level Senate
//     floor plans are out of scope (they live in the Executive/Senate Calendar
//     PDFs).
//
// Warm path: the nightly cron scrapes both and stashes the result in Upstash
// (`refreshFloorSchedule`); the page reads it with `getFloorSchedule` — a single
// KV read. Cold path (no cron yet / KV disabled / the entry's TTL expired because
// scraping has failed for >TTL.prewarm): scrape live and write through. If even
// the live scrape yields nothing, the section renders nothing — graceful hide.
//
// The parsers are pure and fixture-tested; the I/O wraps them.
import * as cheerio from "cheerio";
import { ordinalSuffix } from "./committee-actions";
import { cacheKey, redisClient, TTL } from "./cache";
import { mapLimit } from "./events-index";
import { extractBillSummary, fetchBillPolicyArea, fetchBillSources } from "./summaries";

/** One bill/measure scheduled for floor consideration. */
export interface FloorBill {
  /** Legislative number as published, e.g. "H.R. 8873", "H. Res. 1383". */
  legisNum: string;
  /** Short description from the schedule, e.g. "SECURE Grid Act, as amended". */
  title: string;
  /** Congress.gov bill page, or null when the number can't be parsed. */
  url: string | null;
  // --- Per-bill enrichment (Issue #37), filled at scrape time from Congress.gov.
  //     The House XML carries none of this; unparseable numbers / fetch failures
  //     leave these null/false and the bill renders structured-only. ---
  /** Congress.gov top-level policy area, e.g. "Health" (Issue #36 tag). */
  policyArea?: string | null;
  /** Verbatim CRS summary text, or null ⇒ structured-only. */
  summary?: string | null;
  /** "bill as introduced, [date]" stamp source; null when unknown. */
  summaryBasedOn?: string | null;
  /** Congress.gov has a newer text version than the CRS summary is based on. */
  summaryAmended?: boolean;
}

/** A procedural grouping the House schedule uses, e.g. "under suspension of the rules". */
export interface FloorCategory {
  /** The category label verbatim from the source (structural, not editorial). */
  heading: string;
  bills: FloorBill[];
}

/** The House floor schedule for one week. */
export interface HouseFloor {
  /** Monday of the scheduled week, ISO date "YYYY-MM-DD". */
  weekOf: string;
  /** Source's own last-update timestamp (ISO), or null. */
  updatedAt: string | null;
  /** Congress the schedule belongs to (for building bill URLs), or null. */
  congress: number | null;
  categories: FloorCategory[];
}

/** The Senate floor schedule — best-effort; usually just the next convene note. */
export interface SenateFloor {
  /** Next convene day, as published, e.g. "Monday, Jul 13, 2026". */
  date: string | null;
  /** Convene note, e.g. "Convene at 3:00 p.m." */
  note: string | null;
}

/** The combined floor schedule as scraped and cached. */
export interface FloorSchedule {
  /** ISO timestamp of the scrape that produced this. */
  builtAt: string;
  house: HouseFloor | null;
  senate: SenateFloor | null;
}

// ---------------------------------------------------------------------------
// Pure parsers (fixture-tested).
// ---------------------------------------------------------------------------

/** Normalized legis-num prefix → Congress.gov bill-type URL slug. */
const BILL_TYPE_SLUGS: Record<string, string> = {
  HR: "house-bill",
  HRES: "house-resolution",
  HJRES: "house-joint-resolution",
  HCONRES: "house-concurrent-resolution",
  S: "senate-bill",
  SRES: "senate-resolution",
  SJRES: "senate-joint-resolution",
  SCONRES: "senate-concurrent-resolution",
};

/**
 * Parse a published legislative number like "H.R. 8873" or "H. Res. 1383" into
 * the Congress.gov API bill-type code + number (e.g. `{ type: "hr", number:
 * "8873" }`). Returns null when the number can't be parsed or the type isn't a
 * recognized bill/resolution prefix. The type is the normalized prefix
 * lowercased — the exact form `fetchBillSources`/`fetchBillPolicyArea` expect.
 */
export function parseLegisNum(legisNum: string): { type: string; number: string } | null {
  const m = legisNum.toUpperCase().match(/^([A-Z.\s]+?)\s*(\d+)\s*$/);
  if (!m) return null;
  const code = m[1].replace(/[.\s]/g, "");
  if (!BILL_TYPE_SLUGS[code]) return null;
  return { type: code.toLowerCase(), number: m[2] };
}

/**
 * Build the Congress.gov page URL for a legislative number like "H.R. 8873" or
 * "H. Res. 1383". Returns null when the congress is unknown or the number can't
 * be parsed — the caller still renders the bill, just without a link.
 */
export function billUrl(legisNum: string, congress: number | null): string | null {
  if (!congress) return null;
  const parsed = parseLegisNum(legisNum);
  if (!parsed) return null;
  const slug = BILL_TYPE_SLUGS[parsed.type.toUpperCase()];
  return `https://www.congress.gov/bill/${congress}${ordinalSuffix(congress)}-congress/${slug}/${parsed.number}`;
}

/**
 * Extract the current week's XML feed URL from the docs.house.gov/floor index
 * page. The page links it as `Download.aspx?file=/billsthisweek/YYYYMMDD/YYYYMMDD.xml`;
 * we rebuild the direct URL. Returns null when no weekly XML is linked (e.g. deep
 * recess with nothing posted).
 */
export function houseFloorXmlUrl(indexHtml: string): string | null {
  const m = indexHtml.match(/\/billsthisweek\/(\d{8})\/\1\.xml/);
  if (!m) return null;
  return `https://docs.house.gov/billsthisweek/${m[1]}/${m[1]}.xml`;
}

/**
 * Parse the House weekly floor XML into structured categories/bills. Returns null
 * when the document isn't a recognizable schedule or carries no bills.
 */
export function parseHouseFloorXml(xml: string): HouseFloor | null {
  const $ = cheerio.load(xml, { xmlMode: true });
  const root = $("floorschedule").first();
  if (root.length === 0) return null;

  const weekOf = (root.attr("week-date") ?? "").trim();
  if (!weekOf) return null;
  const congressNum = Number.parseInt(root.attr("congress-num") ?? "", 10);
  const congress = Number.isFinite(congressNum) ? congressNum : null;
  const updatedAt = root.attr("update-date")?.trim() || null;

  const categories: FloorCategory[] = [];
  root.find("category").each((_, catEl) => {
    const cat = $(catEl);
    const heading = (cat.attr("type") ?? "").trim();
    const bills: FloorBill[] = [];
    cat.find("floor-item").each((_, itemEl) => {
      const item = $(itemEl);
      const legisNum = item.find("legis-num").first().text().trim();
      if (!legisNum) return; // non-bill / procedural item — skip
      const title = item.find("floor-text").first().text().trim();
      bills.push({ legisNum, title: title || legisNum, url: billUrl(legisNum, congress) });
    });
    if (bills.length > 0) categories.push({ heading, bills });
  });

  if (categories.length === 0) return null;
  return { weekOf, updatedAt, congress, categories };
}

/**
 * Parse the senate.gov floor-schedule page for the next convene date + note.
 * Best-effort: returns null when neither is present.
 */
export function parseSenateFloorHtml(html: string): SenateFloor | null {
  const $ = cheerio.load(html);
  const article = $("#proceedings_schedule").first();
  if (article.length === 0) return null;
  const date = article.find("h3").first().text().trim() || null;
  const note = article.find(".floor-schedule").first().text().replace(/\s+/g, " ").trim() || null;
  if (!date && !note) return null;
  return { date, note };
}

// ---------------------------------------------------------------------------
// I/O: scrape → cache → serve.
// ---------------------------------------------------------------------------

const HOUSE_INDEX_URL = "https://docs.house.gov/floor/";
const SENATE_FLOOR_URL = "https://www.senate.gov/legislative/schedule/floor_schedule.htm";
const FLOOR_KEY = cacheKey("floor-schedule");
const UA = "Mozilla/5.0 (compatible; reptracker/1.0; +https://reptracker2.vercel.app)";

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xml,*/*" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.text();
}

/** Fetch + parse the House schedule. Returns null when nothing is posted. */
export async function fetchHouseFloor(): Promise<HouseFloor | null> {
  const index = await fetchText(HOUSE_INDEX_URL);
  const xmlUrl = houseFloorXmlUrl(index);
  if (!xmlUrl) return null;
  return parseHouseFloorXml(await fetchText(xmlUrl));
}

/** Fetch + parse the Senate schedule (best-effort). */
export async function fetchSenateFloor(): Promise<SenateFloor | null> {
  return parseSenateFloorHtml(await fetchText(SENATE_FLOOR_URL));
}

/**
 * Enrich one floor bill with its CRS summary + policy area (Issue #37/#36).
 * Best-effort and non-throwing: an unparseable number, unknown congress, or a
 * failed fetch leaves the bill structured-only (fields null/false), exactly like
 * `enrichBillSummary` in rep-profile. Summary text + amended-since come from
 * `fetchBillSources`; the policy-area tag needs the separate bill-detail fetch.
 */
export async function enrichFloorBill(
  bill: FloorBill,
  congress: number | null,
): Promise<FloorBill> {
  const parsed = congress ? parseLegisNum(bill.legisNum) : null;
  if (!congress || !parsed) return bill;
  const { type, number } = parsed;
  const [sources, policyArea] = await Promise.all([
    fetchBillSources(congress, type, number).then(
      ({ crsSummaries, textVersions }) =>
        extractBillSummary({ billId: bill.legisNum, crsSummaries, textVersions }),
      (e) => {
        console.warn(`[floor] summary fetch failed for ${bill.legisNum}: ${String(e)}`);
        return null;
      },
    ),
    fetchBillPolicyArea(congress, type, number).catch((e) => {
      console.warn(`[floor] policy-area fetch failed for ${bill.legisNum}: ${String(e)}`);
      return null;
    }),
  ]);
  return {
    ...bill,
    policyArea,
    summary: sources?.text ?? null,
    summaryBasedOn: sources?.basedOnDate ?? null,
    summaryAmended: sources?.amendedSince ?? false,
  };
}

/** Concurrent Congress.gov fetches while enriching floor bills. */
const FLOOR_ENRICH_CONCURRENCY = 6;

/**
 * Enrich every bill in a House schedule in place (bounded concurrency). Returns
 * the schedule with each `FloorBill` carrying its summary + policy tag, and the
 * count enriched-with-a-summary vs. total for logging (no silent caps).
 */
async function enrichHouseFloor(
  house: HouseFloor,
): Promise<{ house: HouseFloor; total: number; withSummary: number }> {
  const flat = house.categories.flatMap((cat) => cat.bills.map((bill) => ({ cat, bill })));
  const enriched = await mapLimit(flat, FLOOR_ENRICH_CONCURRENCY, ({ bill }) =>
    enrichFloorBill(bill, house.congress),
  );
  // Rebuild categories preserving order, swapping each bill for its enriched form.
  let i = 0;
  const categories = house.categories.map((cat) => ({
    ...cat,
    bills: cat.bills.map(() => enriched[i++]),
  }));
  const withSummary = enriched.filter((b) => b.summary).length;
  return { house: { ...house, categories }, total: enriched.length, withSummary };
}

/**
 * Scrape both chambers best-effort. A chamber that fails is logged and dropped;
 * only when *both* yield nothing do we return null (nothing to cache/show).
 * House bills are enriched with CRS summaries + policy tags (Issue #37) before
 * caching, so the warm page path stays a single KV read.
 */
export async function scrapeFloorSchedule(now: Date): Promise<FloorSchedule | null> {
  const [rawHouse, senate] = await Promise.all([
    fetchHouseFloor().catch((e) => {
      console.warn(`[floor] house scrape failed: ${String(e)}`);
      return null;
    }),
    fetchSenateFloor().catch((e) => {
      console.warn(`[floor] senate scrape failed: ${String(e)}`);
      return null;
    }),
  ]);
  let house = rawHouse;
  if (rawHouse) {
    const r = await enrichHouseFloor(rawHouse);
    house = r.house;
    console.info(`[floor] enriched ${r.withSummary}/${r.total} House bills with a CRS summary`);
  }
  if (!house && !senate) return null;
  return { builtAt: now.toISOString(), house, senate };
}

/** Read the cached floor schedule, or null on miss / disabled cache / error. */
export async function readFloorSchedule(): Promise<FloorSchedule | null> {
  const client = redisClient();
  if (!client) return null;
  try {
    return (await client.get<FloorSchedule>(FLOOR_KEY)) ?? null;
  } catch (e) {
    console.warn(`[floor] read failed: ${String(e)}`);
    return null;
  }
}

async function writeFloorSchedule(schedule: FloorSchedule): Promise<void> {
  const client = redisClient();
  if (!client) return;
  try {
    // Same TTL tier as the events index: outlives one missed cron; expiry after
    // ~40h is the graceful hide when scraping has failed for that long.
    await client.set(FLOOR_KEY, schedule, { ex: TTL.prewarm });
  } catch (e) {
    console.warn(`[floor] write failed: ${String(e)}`);
  }
}

/** Cron entry point: scrape live and write through to KV. Never throws. */
export async function refreshFloorSchedule(now: Date): Promise<FloorSchedule | null> {
  const schedule = await scrapeFloorSchedule(now);
  if (schedule) await writeFloorSchedule(schedule);
  return schedule;
}

/**
 * Read path (the page): serve the cron-built cache, or scrape live and write
 * through on a cold/expired cache. Returns null when there's nothing to show.
 */
export async function getFloorSchedule(now: Date): Promise<FloorSchedule | null> {
  const cached = await readFloorSchedule();
  if (cached) return cached;
  const live = await scrapeFloorSchedule(now);
  if (live) await writeFloorSchedule(live);
  return live;
}
