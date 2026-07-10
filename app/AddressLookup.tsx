"use client";

import { useEffect, useState, useTransition } from "react";
import type { DistrictCandidate, LookupResult, Rep, RepProfile } from "@/lib/types";
import type { SessionStatus } from "@/lib/session-status";
import { lookupAction, resolveCandidateAction, buildProfilesAction } from "./actions";
import RepSection from "./RepSection";

// Issue #2 delivers the *lookup* — identifying who a constituent's reps are.
// Issue #3 layers the rich per-rep sections (committees, contact, upcoming
// decisions, bills) on top: identities render immediately as cards, then the
// heavier profile data fills in progressively (spec DoD cold-cache behavior).

const ORDINAL: Record<string, string> = { "1": "st", "2": "nd", "3": "rd" };
function districtLabel(state: string, district: number, nonVoting: boolean): string {
  if (district === 0) return nonVoting ? `${state} (at-large)` : `${state} at-large`;
  const suffix = ORDINAL[String(district % 10)] && !(district >= 11 && district <= 13)
    ? ORDINAL[String(district % 10)]
    : "th";
  return `${state}-${String(district).padStart(2, "0")} (${district}${suffix} district)`;
}

function readableName(name: string): string {
  const [last, rest] = name.split(",", 2);
  return rest ? `${rest.trim()} ${last.trim()}` : name;
}

const ROLE_LABEL: Record<NonNullable<Rep["houseRole"]>, string> = {
  representative: "Representative",
  delegate: "Delegate",
  "resident-commissioner": "Resident Commissioner",
};

function RepCard({ rep }: { rep: Rep }) {
  const role =
    rep.chamber === "senate" ? "Senator" : rep.houseRole ? ROLE_LABEL[rep.houseRole] : "Representative";
  return (
    <li className="flex items-center gap-4 rounded-lg border border-slate-200 p-4">
      {rep.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rep.imageUrl}
          alt={`${readableName(rep.name)}, ${rep.party} ${rep.state}`}
          className="h-14 w-14 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="h-14 w-14 shrink-0 rounded-full bg-slate-100" aria-hidden />
      )}
      <div>
        <p className="font-semibold text-slate-900">{readableName(rep.name)}</p>
        <p className="text-sm text-slate-600">
          {role} · {rep.party}
          {rep.chamber === "house" && rep.district !== null
            ? ` · ${districtLabel(rep.state, rep.district, rep.houseRole !== "representative")}`
            : ` · ${rep.state}`}
        </p>
      </div>
    </li>
  );
}

function Results({
  result,
  profiles,
  profilesLoading,
  session,
}: {
  result: Extract<LookupResult, { status: "resolved" }>;
  profiles: RepProfile[] | null;
  profilesLoading: boolean;
  session?: SessionStatus | null;
}) {
  const { reps } = result;

  // Full per-rep sections are ready — render them (delegate banner moves inside
  // the House member's header per spec §2.1). The rep's chamber recess status
  // (Issue #8) drives the section's recess pivot.
  if (profiles && profiles.length > 0) {
    return (
      <section aria-live="polite" className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold text-slate-900">
          Your federal representatives
        </h2>
        {profiles.map((p) => (
          <RepSection
            key={p.rep.bioguideId}
            profile={p}
            delegateBanner={
              p.rep.bioguideId === reps.houseMember?.bioguideId
                ? reps.delegateBanner
                : null
            }
            chamberStatus={session ? session[p.rep.chamber] : null}
          />
        ))}
      </section>
    );
  }

  // Identity-level fallback: shown while profiles load, or if enrichment failed.
  return (
    <section aria-live="polite" className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-slate-900">
        Your federal representatives
      </h2>
      {reps.delegateBanner && (
        <p
          role="note"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {reps.delegateBanner}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {reps.houseMember && <RepCard rep={reps.houseMember} />}
        {reps.senators.map((s) => (
          <RepCard key={s.bioguideId} rep={s} />
        ))}
      </ul>
      {!reps.houseMember && (
        <p className="text-sm text-slate-500">
          This seat appears to be vacant in the current Congress.
        </p>
      )}
      <p className="text-xs text-slate-500" aria-live="polite">
        {profilesLoading
          ? "Loading committee roles, contact info, and upcoming decisions…"
          : "Detailed sections couldn't be loaded right now — showing your representatives above."}
      </p>
    </section>
  );
}

function Disambiguation({
  candidates,
  onChoose,
  pending,
}: {
  candidates: DistrictCandidate[];
  onChoose: (c: DistrictCandidate) => void;
  pending: boolean;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Which district is yours?</h2>
        <p className="text-sm text-slate-600">
          That address could fall in {candidates.length} different congressional
          districts. Pick the one that matches you so we show the right
          representatives.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {candidates.map((c) => (
          <li key={c.ocdId}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onChoose(c)}
              className="w-full rounded-lg border border-slate-200 p-4 text-left hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-50"
            >
              <span className="block font-semibold text-slate-900">
                {districtLabel(c.state, c.district, c.nonVoting)}
              </span>
              <span className="block text-sm text-slate-600">
                {c.formattedAddress}
                {c.housePreviewSurname ? ` · Rep. ${c.housePreviewSurname}` : ""}
                {c.proportion < 1 ? ` · ${Math.round(c.proportion * 100)}% of this area` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AddressLookup({ session }: { session?: SessionStatus | null }) {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [profiles, setProfiles] = useState<RepProfile[] | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  // Enrich resolved identities into full sections. Runs whenever a new resolved
  // result arrives; identities are already on screen, so this fills in behind them.
  useEffect(() => {
    if (result?.status !== "resolved") {
      setProfiles(null);
      setProfilesLoading(false);
      return;
    }
    let ignore = false;
    setProfiles(null);
    setProfilesLoading(true);
    buildProfilesAction(result.reps)
      .then((p) => {
        if (!ignore) setProfiles(p);
      })
      .finally(() => {
        if (!ignore) setProfilesLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [result]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => setResult(await lookupAction(address)));
  }

  function onChoose(c: DistrictCandidate) {
    startTransition(async () => setResult(await resolveCandidateAction(c)));
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor="address" className="font-medium text-slate-900">
          Your address
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="address"
            name="address"
            type="text"
            autoComplete="street-address"
            aria-describedby="address-hint"
            placeholder="1600 Pennsylvania Ave NW, Washington, DC"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
          <button
            type="submit"
            disabled={pending || !address.trim()}
            className="rounded-md bg-slate-900 px-5 py-2 font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-50"
          >
            {pending ? "Looking up…" : "Find my reps"}
          </button>
        </div>
        <p id="address-hint" className="text-xs text-slate-500">
          A full street address gives the most accurate result. A ZIP code works
          too, but may ask you to pick your district.
        </p>
      </form>

      {result?.status === "disambiguate" && (
        <Disambiguation candidates={result.candidates} onChoose={onChoose} pending={pending} />
      )}
      {result?.status === "resolved" && (
        <Results
          result={result}
          profiles={profiles}
          profilesLoading={profilesLoading}
          session={session}
        />
      )}
      {(result?.status === "not_found" || result?.status === "error") && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {result.message}
        </p>
      )}
    </div>
  );
}
