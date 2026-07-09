// Committee assignments — who sits on what, with structural role.
//
// The Congress.gov API does NOT expose a member's committee assignments (there
// is no /member/{id}/committee endpoint — it 404s). The canonical machine-
// readable source is the unitedstates/congress-legislators project, published
// as static JSON. We consume two files:
//
//   committee-membership-current.json — keyed by committee code ("HSAG",
//     "HSAG16" for a subcommittee), value = list of { bioguide, title, rank }.
//   committees-current.json — the 49 standing committees with display names
//     and their subcommittees (thomas_id + name).
//
// The index build is pure so it can be fixture-tested without network access.
import type { CommitteeAssignment, CommitteeRole } from "./types";

const MEMBERSHIP_URL =
  "https://unitedstates.github.io/congress-legislators/committee-membership-current.json";
const COMMITTEES_URL =
  "https://unitedstates.github.io/congress-legislators/committees-current.json";

/** Raw shape of one member entry in committee-membership-current.json. */
export interface RawMembershipEntry {
  bioguide?: string;
  name?: string;
  title?: string | null;
  rank?: number;
  party?: string;
}

/** committee-membership-current.json: committee code → members. */
export type RawMembership = Record<string, RawMembershipEntry[]>;

/** Raw shape of committees-current.json entries. */
export interface RawCommittee {
  type?: string;
  name?: string;
  thomas_id?: string;
  subcommittees?: { name?: string; thomas_id?: string }[];
}

/** Normalize a congress-legislators `title` into a structural role. */
export function roleFromTitle(title: string | null | undefined): CommitteeRole {
  if (!title) return "Member";
  const t = title.toLowerCase();
  // "Chair" and "Chairman"/"Chairwoman" are the same office; keep Vice Chair distinct.
  if (t.includes("vice chair")) return "Vice Chair";
  if (t.includes("ranking")) return "Ranking Member";
  if (t.includes("chair")) return "Chair";
  return "Member";
}

/**
 * Rank a role for display ordering within a rep's committee list. Lower sorts
 * first: leadership roles before rank-and-file membership.
 */
function roleWeight(role: CommitteeRole): number {
  switch (role) {
    case "Chair":
      return 0;
    case "Ranking Member":
      return 1;
    case "Vice Chair":
      return 2;
    default:
      return 3;
  }
}

/**
 * Build a bioguide → assignments index from the two raw datasets.
 *
 * A committee code is a subcommittee when it is longer than its parent's code
 * (e.g. "HSAG16" under "HSAG"); we resolve the display name from
 * committees-current, falling back to the raw code if a committee is unlisted.
 */
export function buildAssignmentIndex(
  membership: RawMembership,
  committees: RawCommittee[],
): Map<string, CommitteeAssignment[]> {
  // code → { name, parentName, parentCode, isSubcommittee }
  const meta = new Map<
    string,
    { name: string; parentName: string | null; parentCode: string | null; isSubcommittee: boolean }
  >();

  for (const c of committees) {
    const code = c.thomas_id;
    if (!code) continue;
    const name = c.name ?? code;
    meta.set(code.toUpperCase(), {
      name,
      parentName: null,
      parentCode: null,
      isSubcommittee: false,
    });
    for (const sub of c.subcommittees ?? []) {
      if (!sub.thomas_id) continue;
      const subCode = (code + sub.thomas_id).toUpperCase();
      meta.set(subCode, {
        name: sub.name ?? subCode,
        parentName: name,
        parentCode: code.toUpperCase(),
        isSubcommittee: true,
      });
    }
  }

  const index = new Map<string, CommitteeAssignment[]>();
  for (const [rawCode, members] of Object.entries(membership)) {
    const code = rawCode.toUpperCase();
    const m = meta.get(code);
    for (const entry of members) {
      const bioguide = entry.bioguide;
      if (!bioguide) continue;
      const assignment: CommitteeAssignment = {
        code,
        name: m?.name ?? code,
        role: roleFromTitle(entry.title),
        isSubcommittee: m?.isSubcommittee ?? false,
        parentName: m?.parentName ?? null,
        parentCode: m?.parentCode ?? null,
      };
      const list = index.get(bioguide) ?? [];
      list.push(assignment);
      index.set(bioguide, list);
    }
  }

  // Stable per-rep order: full committees before their subcommittees, grouped
  // by parent, leadership roles first, then alphabetical.
  for (const list of index.values()) {
    list.sort((a, b) => {
      const aGroup = a.isSubcommittee ? a.parentCode ?? a.code : a.code;
      const bGroup = b.isSubcommittee ? b.parentCode ?? b.code : b.code;
      if (aGroup !== bGroup) return aGroup.localeCompare(bGroup);
      // Within a committee family: the full committee before its subcommittees.
      if (a.isSubcommittee !== b.isSubcommittee) return a.isSubcommittee ? 1 : -1;
      const w = roleWeight(a.role) - roleWeight(b.role);
      if (w !== 0) return w;
      return a.name.localeCompare(b.name);
    });
  }

  return index;
}

export class CommitteeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitteeError";
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new CommitteeError(`committee data request failed: ${String(e)}`);
  }
  if (!resp.ok) {
    throw new CommitteeError(`committee data returned HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

/**
 * Fetch + index committee assignments for all current members. Callers pass a
 * bioguide into the returned map; missing members simply have no assignments
 * (e.g. senators-only committees or a member the dataset lags on).
 */
export async function fetchAssignmentIndex(): Promise<Map<string, CommitteeAssignment[]>> {
  const [membership, committees] = await Promise.all([
    fetchJson<RawMembership>(MEMBERSHIP_URL),
    fetchJson<RawCommittee[]>(COMMITTEES_URL),
  ]);
  return buildAssignmentIndex(membership, committees);
}
