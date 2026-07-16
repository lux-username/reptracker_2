"use server";

import { headers } from "next/headers";
import type {
  Chamber,
  CommitteeDocket,
  DistrictCandidate,
  LookupResult,
  RepProfile,
  ResolvedReps,
} from "@/lib/types";
import { lookupAddress, resolveCandidate } from "@/lib/resolve-reps";
import { buildProfiles } from "@/lib/rep-profile";
import { fetchCommitteeDocket } from "@/lib/committee-bills";
import { checkRateLimit } from "@/lib/abuse-guard";

/**
 * The caller's IP for per-IP rate limiting (Issue #41). On Vercel the client IP
 * is the first entry of `x-forwarded-for`; `x-real-ip` is the fallback. Returns
 * "" when neither is present (e.g. local dev), which the limiter buckets under a
 * shared "unknown" key.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() ?? "";
}

/** A rejected-by-rate-limit LookupResult (Issue #41): silent throttle, friendly copy. */
function rateLimitedResult(): LookupResult {
  return {
    status: "error",
    message:
      "You've made a lot of lookups in a short time. Please wait a moment and try again.",
  };
}

/** Look up an address string → reps, disambiguation, or a miss. */
export async function lookupAction(address: string): Promise<LookupResult> {
  const limit = await checkRateLimit(await clientIp(), Date.now());
  if (!limit.allowed) return rateLimitedResult();
  return lookupAddress(address);
}

/** Resolve a single district the user picked from the disambiguation screen. */
export async function resolveCandidateAction(
  candidate: DistrictCandidate,
): Promise<LookupResult> {
  const limit = await checkRateLimit(await clientIp(), Date.now());
  if (!limit.allowed) return rateLimitedResult();
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

/**
 * Fetch the pending-bills docket for one committee (Issue #21), on demand when a
 * constituent expands it. Warm on the common path (cron-warmed KV); cold path
 * builds it live. Returns `{ error }` on failure so the expander shows a graceful
 * note rather than throwing.
 */
export async function committeeDocketAction(
  congress: number,
  chamber: Chamber,
  systemCode: string,
): Promise<CommitteeDocket | { error: string }> {
  try {
    return await fetchCommitteeDocket(congress, chamber, systemCode);
  } catch {
    return { error: "We couldn't load this committee's bills right now." };
  }
}
