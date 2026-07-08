// Server-only: reads CONGRESS_GOV_API_KEY (a non-public env var) and is imported
// exclusively by server actions / components.
//
// Congress.gov is the authoritative source of member identity (spec data-source
// table). Given a (congress, state) we fetch every current member of the state
// and split them into the one House seat for the district + the senators.
import type { Chamber, Rep } from "./types";
import { houseRole } from "./jurisdictions";

interface CongressTermItem {
  chamber?: string; // "House of Representatives" | "Senate"
}

interface CongressMember {
  bioguideId: string;
  name: string;
  partyName?: string;
  state?: string;
  district?: number | null;
  depiction?: { imageUrl?: string };
  terms?: { item?: CongressTermItem[] };
}

interface CongressMemberListResponse {
  members?: CongressMember[];
}

function chamberOf(m: CongressMember): Chamber | null {
  const items = m.terms?.item ?? [];
  const latest = items[items.length - 1];
  const c = latest?.chamber;
  if (c === "Senate") return "senate";
  if (c === "House of Representatives") return "house";
  return null;
}

/**
 * Split a state's current members into the House seat for `district` and its
 * senators. Pure so it can be tested against real fixture payloads.
 *
 * `stateCode` supplies the jurisdiction used to label the House seat's role
 * (representative / delegate / resident-commissioner).
 */
export function selectReps(
  members: CongressMember[],
  stateCode: string,
  district: number,
): { houseMember: Rep | null; senators: Rep[] } {
  const senators: Rep[] = [];
  let houseMember: Rep | null = null;

  for (const m of members) {
    const chamber = chamberOf(m);
    if (chamber === "senate") {
      senators.push({
        bioguideId: m.bioguideId,
        name: m.name,
        party: m.partyName ?? "Unknown",
        state: stateCode,
        chamber: "senate",
        district: null,
        houseRole: null,
        imageUrl: m.depiction?.imageUrl ?? null,
      });
    } else if (chamber === "house" && (m.district ?? 0) === district) {
      houseMember = {
        bioguideId: m.bioguideId,
        name: m.name,
        party: m.partyName ?? "Unknown",
        state: stateCode,
        chamber: "house",
        district: m.district ?? 0,
        houseRole: houseRole(stateCode),
        imageUrl: m.depiction?.imageUrl ?? null,
      };
    }
  }

  // Stable display order: by surname (names arrive "Last, First").
  senators.sort((a, b) => a.name.localeCompare(b.name));
  return { houseMember, senators };
}

export class CongressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CongressError";
  }
}

/** Fetch every current member of a state/jurisdiction for a given congress. */
export async function fetchStateMembers(
  congress: number,
  stateCode: string,
): Promise<CongressMember[]> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) throw new CongressError("CONGRESS_GOV_API_KEY is not set");

  const url = new URL(
    `https://api.congress.gov/v3/member/congress/${congress}/${stateCode}`,
  );
  url.searchParams.set("currentMember", "true");
  url.searchParams.set("limit", "250");
  url.searchParams.set("api_key", apiKey);

  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new CongressError(`Congress.gov request failed: ${String(e)}`);
  }
  if (!resp.ok) {
    throw new CongressError(`Congress.gov returned HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as CongressMemberListResponse;
  return data.members ?? [];
}

/** Resolve the House seat + senators for a (congress, state, district). */
export async function resolveRepsForDistrict(
  congress: number,
  stateCode: string,
  district: number,
): Promise<{ houseMember: Rep | null; senators: Rep[] }> {
  const members = await fetchStateMembers(congress, stateCode);
  return selectReps(members, stateCode, district);
}
