// The committee docket (Issue #21) — the bills currently referred to and waiting
// in a committee the rep sits on. A browsable view of the "in the rep's
// committee" relevance signal (spec.md:93): these are the decisions this rep can
// influence *before* a floor vote exists.
//
// Data source: Congress.gov `/committee/{congress}/{chamber}/{systemCode}/bills`.
// Each row is a bill's *relationship* to the committee — one row per bill, with a
// single `relationshipType`. "Referred To" (case varies by full/sub committee)
// means it is waiting in the committee; "Discharged From" / "Reported By" /
// "Markup By" mean it has moved on. The row's `actionDate` is the *referral*
// date; the list carries no title, so the capped set is enriched from the base
// bill record (title) + the CRS summary pipeline (lib/summaries.ts). No LLM.
//
// The list can run to hundreds of bills (Agriculture ~630, Senate Judiciary
// ~810), so we page a bounded window, filter to pending, sort most-recently-
// referred first, and cap. The select logic is pure + fixture-tested; only
// fetching touches the network. Warm path reads a cron-warmed artifact from KV;
// cold path builds it live (bounded) and caches it — mirroring the events-index
// warm/cold split in committee-actions.ts.
import type { Chamber, CommitteeAssignment, CommitteeDocket, PendingBill } from "./types";
import { cached, cacheKey, redisClient, TTL } from "./cache";
import { congressFetch } from "./rate-limit";
import { billDisplayId, billUrl, committeePageUrl } from "./bill-format";
import { fetchBillSources, extractBillSummary, fetchBillTitle } from "./summaries";

/** Raw Congress.gov committee-bills list row (fields we consume). */
export interface RawCommitteeBill {
  congress?: number;
  type?: string;
  number?: string;
  actionDate?: string;
  relationshipType?: string;
}

/** Most bills shown per committee. The list is huge; this keeps it scannable. */
export const DOCKET_CAP = 10;

/** Max list pages (250 each) paged on a cold build before we stop (logged). */
const MAX_PAGES = 4;

/**
 * A relationship means the bill is *waiting in* the committee (vs discharged /
 * reported / marked up, which mean it moved on). Case varies across the API:
 * full committees return "Referred To", subcommittees "Referred to".
 */
export function isReferredPending(relationshipType: string | undefined): boolean {
  return (relationshipType ?? "").trim().toLowerCase() === "referred to";
}

/**
 * Select the pending docket from raw list rows (pure): keep only bills still
 * referred to the committee, most-recently-referred first, capped at DOCKET_CAP.
 * Returns the capped set (structured-only — enrichment happens in the I/O layer)
 * plus the true total pending count so the UI can say "showing N of M".
 */
export function selectPendingBills(
  rows: RawCommitteeBill[],
  chamber: Chamber,
  systemCode: string,
): CommitteeDocket {
  const pending: PendingBill[] = rows
    .filter((r) => isReferredPending(r.relationshipType))
    .map((r) => {
      const { congress, type, number } = r;
      if (!congress || !type || !number) return null;
      const upper = type.toUpperCase();
      const bill: PendingBill = {
        billId: `${upper.toLowerCase()}-${number}-${congress}`,
        displayId: billDisplayId(upper, number),
        congress,
        type: upper,
        number,
        title: billDisplayId(upper, number), // placeholder until enriched
        referredDate: r.actionDate ?? null,
        url: billUrl(congress, upper, number),
      };
      return bill;
    })
    .filter((b): b is PendingBill => b !== null)
    // Most-recently-referred first; undated rows sort last.
    .sort((a, b) => (b.referredDate ?? "").localeCompare(a.referredDate ?? ""));

  // totalReferred counts *valid* pending bills so the "showing N of M" line is
  // honest (a malformed row missing a bill number isn't a bill we could show).
  return {
    systemCode,
    totalReferred: pending.length,
    bills: pending.slice(0, DOCKET_CAP),
    committeeUrl: committeePageUrl(chamber, systemCode),
  };
}

/**
 * Congress.gov systemCode for one of our committee-membership codes. Inverse of
 * `normalizeSystemCode` (committee-actions.ts): full committees carry a trailing
 * "00", subcommittees carry their own suffix already. HSAG → "hsag00",
 * HSAG16 → "hsag16".
 */
export function systemCodeFor(code: string, isSubcommittee: boolean): string {
  return code.toLowerCase() + (isSubcommittee ? "" : "00");
}

/**
 * Chamber for a committee code, from its leading letter (H = House, S = Senate).
 * Joint committees ("J…") have no single chamber for the bills endpoint → null,
 * and the caller degrades (no docket expander).
 */
export function chamberForCommittee(code: string): Chamber | null {
  const c = code.toUpperCase();
  if (c.startsWith("H")) return "house";
  if (c.startsWith("S")) return "senate";
  return null;
}

/** A committee the cron can warm a docket for: chamber + Congress.gov systemCode. */
export interface CommitteeRef {
  chamber: Chamber;
  systemCode: string;
}

/**
 * The distinct set of committees any current member sits on, derived from the
 * assignment index — bounded (~200 across both chambers), so the nightly warm
 * can converge over it. Stable-sorted so a persisted cursor walks it
 * deterministically. Joint committees (no single chamber) are skipped.
 */
export function committeeRoster(
  assignmentIndex: Map<string, CommitteeAssignment[]>,
): CommitteeRef[] {
  const seen = new Map<string, CommitteeRef>();
  for (const assignments of assignmentIndex.values()) {
    for (const a of assignments) {
      const chamber = chamberForCommittee(a.code);
      if (!chamber) continue;
      const systemCode = systemCodeFor(a.code, a.isSubcommittee);
      const key = `${chamber}:${systemCode}`;
      if (!seen.has(key)) seen.set(key, { chamber, systemCode });
    }
  }
  return [...seen.values()].sort((x, y) =>
    `${x.chamber}:${x.systemCode}`.localeCompare(`${y.chamber}:${y.systemCode}`),
  );
}

// ---------------------------------------------------------------------------
// I/O: warm read (cron-warmed artifact) → bounded live build → enrich.
// ---------------------------------------------------------------------------

export class CommitteeBillsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitteeBillsError";
  }
}

const docketKey = (congress: number, systemCode: string) =>
  cacheKey("cmte-docket", congress, systemCode);

async function apiJson<T>(url: string): Promise<T> {
  const resp = await congressFetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new CommitteeBillsError(`Congress.gov returned HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

/** Page the committee-bills list, bounded to MAX_PAGES; log if truncated. */
async function collectBillRows(
  congress: number,
  chamber: Chamber,
  systemCode: string,
  apiKey: string,
): Promise<RawCommitteeBill[]> {
  const rows: RawCommitteeBill[] = [];
  let total = 0;
  const PAGE = 250; // Congress.gov max page size
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(
      `https://api.congress.gov/v3/committee/${congress}/${chamber}/${systemCode}/bills`,
    );
    url.searchParams.set("offset", String(page * PAGE));
    url.searchParams.set("limit", String(PAGE));
    url.searchParams.set("api_key", apiKey);
    const body = await apiJson<{
      "committee-bills"?: { bills?: RawCommitteeBill[]; count?: number };
    }>(url.toString());
    const cb = body["committee-bills"];
    const batch = cb?.bills ?? [];
    total = cb?.count ?? total;
    if (batch.length === 0) break;
    rows.push(...batch);
    if (total && rows.length >= total) break;
  }
  if (total > rows.length) {
    console.warn(
      `[committee-bills] ${systemCode} list paged ${rows.length} of ${total} rows (MAX_PAGES=${MAX_PAGES}); the nightly warm covers the rest`,
    );
  }
  return rows;
}

/** Attach each capped bill's official title + verbatim CRS summary (no LLM). */
async function enrichBill(bill: PendingBill): Promise<PendingBill> {
  try {
    const [title, sources] = await Promise.all([
      fetchBillTitle(bill.congress, bill.type, bill.number),
      fetchBillSources(bill.congress, bill.type, bill.number),
    ]);
    const s = extractBillSummary({
      billId: bill.billId,
      crsSummaries: sources.crsSummaries,
      textVersions: sources.textVersions,
    });
    return {
      ...bill,
      title: title ?? bill.title,
      summary: s.text,
      summaryBasedOn: s.basedOnDate,
      summaryAmended: s.amendedSince,
    };
  } catch {
    // One bad enrichment shouldn't sink the docket — keep structured-only.
    return { ...bill, summary: null, summaryBasedOn: null, summaryAmended: false };
  }
}

/**
 * Build a committee's pending docket live: page the list (bounded), select the
 * pending set, enrich the capped bills, and cache the result. Stored in the
 * cron-artifact tier (like the events index) so a nightly warm survives to serve
 * the whole next day rather than expiring mid-afternoon. Used by the cold path
 * and by the nightly warm.
 */
export async function buildCommitteeDocket(
  congress: number,
  chamber: Chamber,
  systemCode: string,
): Promise<CommitteeDocket> {
  return cached(docketKey(congress, systemCode), TTL.prewarm, async () => {
    const apiKey = process.env.CONGRESS_GOV_API_KEY;
    if (!apiKey) throw new CommitteeBillsError("CONGRESS_GOV_API_KEY is not set");
    const rows = await collectBillRows(congress, chamber, systemCode, apiKey);
    const docket = selectPendingBills(rows, chamber, systemCode);
    const bills = await Promise.all(docket.bills.map(enrichBill));
    return { ...docket, bills };
  });
}

/**
 * Fetch a committee's docket for the read path. Warm: a `cached`-stored artifact
 * (populated by the cron or a prior visit) returns straight from KV. Cold: build
 * it live (bounded) and cache it. `buildCommitteeDocket` already wraps both in
 * `cached`, so this is a thin, intention-revealing alias for the read path.
 */
export function fetchCommitteeDocket(
  congress: number,
  chamber: Chamber,
  systemCode: string,
): Promise<CommitteeDocket> {
  return buildCommitteeDocket(congress, chamber, systemCode);
}

/**
 * Peek the *warm* pending-bill count for each committee, KV-only (Issue #39).
 *
 * Unlike `fetchCommitteeDocket`, this NEVER builds a docket live — it only reads
 * the cron-warmed artifacts already in KV via a single `mget`, so profile
 * assembly can decide whether to render a committee's docket expander without
 * adding a live fetch per committee. A committee absent from KV (cold miss),
 * a disabled cache, or any Redis error yields no entry — the caller treats the
 * count as unknown and shows the expander (degrade to on-demand).
 *
 * Returns a map keyed by `systemCode` → `totalReferred`. Keyed by systemCode
 * alone because the docket cache key already is (systemCode encodes chamber).
 */
export async function peekDocketCounts(
  congress: number,
  systemCodes: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const unique = [...new Set(systemCodes)];
  if (unique.length === 0) return counts;

  const client = redisClient();
  if (!client) return counts; // no cache → all unknown, expanders shown

  try {
    const keys = unique.map((sc) => docketKey(congress, sc));
    const dockets = await client.mget<(CommitteeDocket | null)[]>(...keys);
    unique.forEach((sc, i) => {
      const d = dockets[i];
      if (d && typeof d.totalReferred === "number") counts.set(sc, d.totalReferred);
    });
  } catch (e) {
    console.warn(`[committee-bills] docket-count peek failed: ${String(e)}`);
  }
  return counts;
}
