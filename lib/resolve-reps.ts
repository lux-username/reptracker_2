// Server-only orchestrator: address → representatives.
//
// Flow: geocode → distinct district candidates.
//   0 candidates  → not_found
//   1 candidate   → resolve reps via Congress.gov → resolved
//   2+ candidates → disambiguate (spec §1: never silently pick a district)
import type { DistrictCandidate, LookupResult, ResolvedReps } from "./types";
import { geocode, GeocodioError } from "./geocodio";
import { resolveRepsForDistrict } from "./congress";
import { delegateBanner, isNonVoting } from "./jurisdictions";

/** Best-effort current congress, used only if Geocodio omits the label. */
function currentCongress(): number {
  return Math.floor((new Date().getFullYear() - 1789) / 2) + 1;
}

/** Convert Congress.gov "Last, First Middle" to a readable "First Middle Last". */
function readableName(name: string): string {
  const [last, rest] = name.split(",", 2);
  return rest ? `${rest.trim()} ${last.trim()}` : name;
}

/** Resolve a single chosen district candidate into its representatives. */
export async function resolveCandidate(
  candidate: DistrictCandidate,
): Promise<ResolvedReps> {
  const congress = candidate.congress || currentCongress();
  const nonVoting = isNonVoting(candidate.state);
  const { houseMember, senators } = await resolveRepsForDistrict(
    congress,
    candidate.state,
    candidate.district,
  );

  return {
    state: candidate.state,
    district: candidate.district,
    congress,
    nonVoting,
    delegateBanner:
      nonVoting && houseMember
        ? delegateBanner(candidate.state, readableName(houseMember.name))
        : null,
    houseMember,
    // DC + territories have no senators; Congress.gov omits them, but enforce it.
    senators: nonVoting ? [] : senators,
  };
}

/** Full lookup from a free-form address string. */
export async function lookupAddress(address: string): Promise<LookupResult> {
  const trimmed = address.trim();
  if (!trimmed) {
    return { status: "not_found", message: "Please enter an address." };
  }

  let candidates: DistrictCandidate[];
  try {
    candidates = await geocode(trimmed);
  } catch (e) {
    if (e instanceof GeocodioError && e.kind === "not_found") {
      return {
        status: "not_found",
        message:
          "We couldn't find that address. Try a full street address including city and state.",
      };
    }
    return {
      status: "error",
      message: "Something went wrong looking up that address. Please try again.",
    };
  }

  if (candidates.length > 1) {
    return { status: "disambiguate", candidates };
  }

  try {
    const reps = await resolveCandidate(candidates[0]);
    return { status: "resolved", reps };
  } catch {
    return {
      status: "error",
      message: "We found your district but couldn't load your representatives. Please try again.",
    };
  }
}
