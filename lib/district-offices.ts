// District-office contact enrichment (Issue #13).
//
// Issue #3 renders the Congress.gov **DC-office** phone/address as the guaranteed
// callable fallback; a rep's local **district office** — often the more reachable
// number for a constituent — was left null. The spec flags scraping individual
// house.gov/senate.gov member sites as the highest-risk data path (every site is
// laid out differently, and a wrong phone number defeats the product's purpose).
//
// So instead of scraping arbitrary member pages we consume a **structured, keyed
// dataset**: the community-maintained `unitedstates/congress-legislators`
// `legislators-district-offices` file (JSON mirror), keyed by the same bioguide id
// we already resolve. That removes the layout-fragility entirely; the remaining
// hygiene the spec asks for is validating each string looks like a phone before we
// render it as callable, and always keeping the DC office as the fallback (the
// caller does — this only *fills* the district slot, never replaces the DC one).
//
// Served warm: the nightly cron refreshes the reduced index into Upstash; the
// read path reads it (with a short in-process memo so a burst of contact lookups
// shares one load). Parsing/picking/validation are pure and fixture-tested.
import { cacheKey, redisClient, TTL } from "./cache";

/** The one district-office contact we surface for a member (phone + address). */
export interface DistrictOfficeContact {
  /** A validated, human-formatted phone string, e.g. "256-734-6043". */
  phone: string;
  /** Formatted mailing address, or null if the record lacked address parts. */
  address: string | null;
}

/**
 * Raw office record shape (only the fields we consume). Values are typed loosely
 * because the upstream dataset sometimes emits numeric zips/suites — everything
 * is coerced to a trimmed string before use.
 */
interface RawOffice {
  address?: string | number;
  suite?: string | number;
  building?: string | number;
  city?: string | number;
  state?: string | number;
  zip?: string | number;
  phone?: string | number;
}

/** Coerce a possibly-numeric field to a trimmed string, or "" when absent. */
function str(v: string | number | undefined): string {
  return v == null ? "" : String(v).trim();
}

/** bioguide → the chosen district-office contact. */
export type DistrictOfficeIndex = Record<string, DistrictOfficeContact>;

// ---------------------------------------------------------------------------
// Pure: validate / pick / format / parse (fixture-tested).
// ---------------------------------------------------------------------------

/**
 * True if a string looks like a US phone number — 10 digits, or 11 with a
 * leading country code. Guards against rendering a non-callable value (spec:
 * "validate scraped strings look like phone numbers before rendering").
 */
export function isPhoneLike(s: string | number | undefined): boolean {
  if (s == null) return false;
  const digits = String(s).replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

/** Assemble a one-line mailing address from an office record. */
export function formatDistrictOfficeAddress(o: RawOffice): string | null {
  const line1 = [o.address, o.building, o.suite].map(str).filter(Boolean).join(", ");
  const stateZip = [o.state, o.zip].map(str).filter(Boolean).join(" ");
  const cityLine = [str(o.city), stateZip].filter(Boolean).join(", ");
  return [line1, cityLine].filter(Boolean).join(", ") || null;
}

/**
 * Choose the district office to surface: the first one carrying a valid phone
 * (a member can list several; the primary is typically first, and offices
 * without a callable number are useless here). Returns null when none qualifies.
 */
export function pickDistrictOffice(offices: RawOffice[] | undefined): DistrictOfficeContact | null {
  for (const o of offices ?? []) {
    if (isPhoneLike(o.phone)) {
      return { phone: String(o.phone).trim(), address: formatDistrictOfficeAddress(o) };
    }
  }
  return null;
}

/** Reduce the raw dataset (array of {id, offices}) to a bioguide→contact index. */
export function parseDistrictOfficeIndex(raw: unknown): DistrictOfficeIndex {
  const out: DistrictOfficeIndex = {};
  if (!Array.isArray(raw)) return out;
  for (const rec of raw as { id?: { bioguide?: string }; offices?: RawOffice[] }[]) {
    const bioguide = rec?.id?.bioguide;
    if (!bioguide) continue;
    const picked = pickDistrictOffice(rec.offices);
    if (picked) out[bioguide] = picked;
  }
  return out;
}

// ---------------------------------------------------------------------------
// I/O: fetch → cache → serve.
// ---------------------------------------------------------------------------

const SOURCE_URL =
  "https://unitedstates.github.io/congress-legislators/legislators-district-offices.json";
const INDEX_KEY = cacheKey("district-offices");
const MEMO_TTL_MS = 10 * 60 * 1000;

async function fetchIndexLive(): Promise<DistrictOfficeIndex> {
  const resp = await fetch(SOURCE_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`district-offices source returned HTTP ${resp.status}`);
  return parseDistrictOfficeIndex(await resp.json());
}

/** Read the cached index, or null on miss / disabled cache / error. */
export async function readDistrictOfficeIndex(): Promise<DistrictOfficeIndex | null> {
  const client = redisClient();
  if (!client) return null;
  try {
    return (await client.get<DistrictOfficeIndex>(INDEX_KEY)) ?? null;
  } catch (e) {
    console.warn(`[district-offices] read failed: ${String(e)}`);
    return null;
  }
}

async function writeIndex(index: DistrictOfficeIndex): Promise<void> {
  const client = redisClient();
  if (!client) return;
  try {
    await client.set(INDEX_KEY, index, { ex: TTL.prewarm });
  } catch (e) {
    console.warn(`[district-offices] write failed: ${String(e)}`);
  }
}

/** Cron entry point: fetch the dataset live and write the reduced index. */
export async function refreshDistrictOffices(): Promise<DistrictOfficeIndex | null> {
  try {
    const index = await fetchIndexLive();
    await writeIndex(index);
    return index;
  } catch (e) {
    console.warn(`[district-offices] refresh failed: ${String(e)}`);
    return null;
  }
}

let memo: { at: number; index: DistrictOfficeIndex } | null = null;
let inflight: Promise<DistrictOfficeIndex> | null = null;

async function loadIndex(): Promise<DistrictOfficeIndex> {
  let index = await readDistrictOfficeIndex();
  if (!index) {
    try {
      index = await fetchIndexLive();
      await writeIndex(index);
    } catch (e) {
      console.warn(`[district-offices] cold load failed: ${String(e)}`);
      index = {};
    }
  }
  return index;
}

/**
 * The bioguide→contact index, cached in-process for MEMO_TTL_MS so a burst of
 * per-rep contact lookups (a page render, or the cron's contact warm slice)
 * shares a single load. Concurrent callers dedupe onto one in-flight promise.
 */
async function getIndex(): Promise<DistrictOfficeIndex> {
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.index;
  if (!inflight) {
    inflight = loadIndex().then((index) => {
      memo = { at: Date.now(), index };
      inflight = null;
      return index;
    });
  }
  return inflight;
}

/** The district-office contact for a member, or null when we have none. */
export async function fetchDistrictOffice(
  bioguideId: string,
): Promise<DistrictOfficeContact | null> {
  const index = await getIndex();
  return index[bioguideId] ?? null;
}
