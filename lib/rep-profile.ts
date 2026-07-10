// Per-rep section assembly (spec §2, Issue #3).
//
// Takes a resolved `Rep` identity (Issue #2) and enriches it into a full
// `RepProfile`: committee assignments + structural roles, a single contact
// block, upcoming committee action, and the secondary sponsored/cosponsored
// list. The neutral LLM TL;DR is Issue #5 and stays null here.
//
// Every fetch here is uncached; Issue #7 layers Upstash + a nightly pre-warm
// cron so the common case is warm-cache and fast. The contact block always
// carries the Congress.gov DC-office phone as the guaranteed callable number;
// district-office phones are scraped best-effort (deferred) and null for now.
import type {
  CommitteeAssignment,
  ContactBlock,
  Rep,
  RepProfile,
  ResolvedReps,
  SecondaryBill,
} from "./types";
import { fetchAssignmentIndex } from "./committees";
import { fetchSecondaryBills } from "./legislation";
import { fetchUpcomingCommitteeActions } from "./committee-actions";
import { fetchBillSources, extractBillSummary } from "./summaries";
import { cached, cacheKey, TTL } from "./cache";
import { congressFetch } from "./rate-limit";
import { fetchDistrictOffice } from "./district-offices";

/** Attach the verbatim CRS summary (Issue #5, no LLM) to a secondary bill. */
async function enrichBillSummary(bill: SecondaryBill): Promise<SecondaryBill> {
  try {
    const { crsSummaries, textVersions } = await fetchBillSources(
      bill.congress,
      bill.type,
      bill.number,
    );
    const s = extractBillSummary({ billId: bill.billId, crsSummaries, textVersions });
    return { ...bill, summary: s.text, summaryBasedOn: s.basedOnDate, summaryAmended: s.amendedSince };
  } catch {
    return { ...bill, summary: null, summaryBasedOn: null, summaryAmended: false };
  }
}

interface RawMemberDetail {
  member?: {
    addressInformation?: {
      officeAddress?: string;
      city?: string;
      district?: string;
      zipCode?: number | string;
      phoneNumber?: string;
    };
    officialWebsiteUrl?: string;
  };
}

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileError";
  }
}

type RawAddress = NonNullable<RawMemberDetail["member"]>["addressInformation"];

/**
 * Format a Congress.gov office address. The payload is heterogeneous: House
 * members carry just the building in `officeAddress` and complete it with
 * city/district/zipCode, while Senators embed the whole street/city/zip in
 * `officeAddress` already (and the top-level `zipCode` is a generic 20515 for
 * everyone). So: if `officeAddress` already names the city, trust it verbatim;
 * otherwise assemble the pieces.
 */
export function formatOfficeAddress(a: RawAddress): string | null {
  const office = a?.officeAddress?.replace(/\s+/g, " ").trim();
  if (!office) return null;
  if (a?.city && office.includes(a.city)) return office; // already complete
  const zipDistrict = [a?.district, a?.zipCode ? String(a.zipCode) : ""]
    .filter(Boolean)
    .join(" ");
  const line2 = [a?.city, zipDistrict].filter(Boolean).join(", ");
  return [office, line2].filter(Boolean).join(", ");
}

/**
 * Fetch a member's DC-office contact block from Congress.gov member detail.
 * Cached in the reference tier (4-6h).
 */
export async function fetchContact(bioguideId: string): Promise<ContactBlock> {
  return cached(cacheKey("contact", bioguideId), TTL.reference, () =>
    fetchContactLive(bioguideId),
  );
}

async function fetchContactLive(bioguideId: string): Promise<ContactBlock> {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) throw new ProfileError("CONGRESS_GOV_API_KEY is not set");
  const url = new URL(`https://api.congress.gov/v3/member/${bioguideId}`);
  url.searchParams.set("api_key", apiKey);
  const resp = await congressFetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new ProfileError(`Congress.gov returned HTTP ${resp.status}`);
  const data = (await resp.json()) as RawMemberDetail;
  const a = data.member?.addressInformation;

  // District office (Issue #13): best-effort enrichment on top of the guaranteed
  // Congress.gov DC office — a lookup failure just leaves the district slot null,
  // never the DC fallback.
  const district = await fetchDistrictOffice(bioguideId).catch(() => null);

  return {
    dcOfficePhone: a?.phoneNumber ?? null,
    dcOfficeAddress: formatOfficeAddress(a),
    districtOfficePhone: district?.phone ?? null,
    districtOfficeAddress: district?.address ?? null,
    websiteUrl: data.member?.officialWebsiteUrl ?? null,
  };
}

/** Enrich one resolved rep into a full section profile. */
export async function buildRepProfile(
  rep: Rep,
  congress: number,
  assignments: CommitteeAssignment[],
  now: Date,
): Promise<RepProfile> {
  const committeeNames = assignments.map((c) => c.name);
  const [contact, rawBills, upcomingCommitteeActions] = await Promise.all([
    fetchContact(rep.bioguideId),
    fetchSecondaryBills(rep.bioguideId, committeeNames, now),
    fetchUpcomingCommitteeActions(congress, rep.chamber, assignments, now),
  ]);

  // Issue #5: attach each bill's verbatim CRS summary (parallel). No LLM.
  const secondaryBills = await Promise.all(rawBills.map(enrichBillSummary));

  return { rep, committees: assignments, contact, upcomingCommitteeActions, secondaryBills };
}

/**
 * Build every rep section for a resolved district. Fetches the committee
 * assignment index once and enriches the House member + senators in parallel.
 */
export async function buildProfiles(
  reps: ResolvedReps,
  now: Date,
): Promise<RepProfile[]> {
  const assignmentIndex = await fetchAssignmentIndex();
  const members: Rep[] = [
    ...(reps.houseMember ? [reps.houseMember] : []),
    ...reps.senators,
  ];
  return Promise.all(
    members.map((rep) =>
      buildRepProfile(
        rep,
        reps.congress,
        assignmentIndex.get(rep.bioguideId) ?? [],
        now,
      ),
    ),
  );
}
