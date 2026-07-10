"use server";

import type { DistrictCandidate, LookupResult, RepProfile, ResolvedReps } from "@/lib/types";
import { lookupAddress, resolveCandidate } from "@/lib/resolve-reps";
import { buildProfiles } from "@/lib/rep-profile";

/** Look up an address string → reps, disambiguation, or a miss. */
export async function lookupAction(address: string): Promise<LookupResult> {
  return lookupAddress(address);
}

/** Resolve a single district the user picked from the disambiguation screen. */
export async function resolveCandidateAction(
  candidate: DistrictCandidate,
): Promise<LookupResult> {
  try {
    const reps = await resolveCandidate(candidate);
    return { status: "resolved", reps };
  } catch {
    return {
      status: "error",
      message: "We couldn't load representatives for that district. Please try again.",
    };
  }
}

/**
 * Enrich resolved rep identities into full per-rep section profiles (Issue #3).
 * Called after a `resolved` result so identities render immediately and the
 * heavier committee/committee-action/bills data fills in progressively. On failure the
 * UI keeps the identity-level cards, so an empty result degrades gracefully.
 */
export async function buildProfilesAction(
  reps: ResolvedReps,
): Promise<RepProfile[]> {
  try {
    return await buildProfiles(reps, new Date());
  } catch {
    return [];
  }
}
