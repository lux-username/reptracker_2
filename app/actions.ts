"use server";

import type { DistrictCandidate, LookupResult } from "@/lib/types";
import { lookupAddress, resolveCandidate } from "@/lib/resolve-reps";

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
