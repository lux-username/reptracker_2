import type { Metadata } from "next";
import ExternalLink from "../ExternalLink";

// Dedicated privacy policy (Issue #43). CalOPPA requires any commercial online
// service that *collects* PII from California users to conspicuously post a
// privacy policy — the trigger is collection, not retention, so discarding the
// address immediately doesn't exempt us. Linked from the footer with the word
// "privacy". Every statement must be literally true end-to-end (FTC §5); the
// wording mirrors the (corrected) footer privacy copy (#26). Not legal advice —
// counsel should read the final wording before launch.
//
// Static content; no data fetch. `EFFECTIVE_DATE` is the single source of truth
// for the "as of" line — bump it (and add a change note) on any material change.
export const metadata: Metadata = {
  title: "Privacy Policy — Representative Tracker",
  description:
    "How Representative Tracker handles the address you enter: used once to find your district, never stored, no accounts, no tracking.",
};

const EFFECTIVE_DATE = "July 15, 2026";

export default function PrivacyPolicy() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 focus:outline-none sm:px-6 sm:py-16"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-500">Effective {EFFECTIVE_DATE}</p>
      </header>

      <div className="flex flex-col gap-6 text-base leading-relaxed text-slate-700">
        <p>
          Representative Tracker is a free, independent tool that turns your
          address into the federal representatives for your congressional
          district. This policy explains exactly what happens to the address you
          enter. In short: it is used once to find your district, and we do not
          store it or keep any account for you.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Information we collect
          </h2>
          <p>
            The only personal information we collect is{" "}
            <strong className="font-medium text-slate-900">
              the address (or ZIP code) you type into the lookup box
            </strong>
            . We use it transiently to resolve your congressional district and
            then to look up the representatives for that district. We do not ask
            for, and do not collect, your name, email, phone number, or any
            account information — there are no accounts.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            How your address is used and shared
          </h2>
          <p>
            To resolve your district, your address is sent once to our geocoding
            provider,{" "}
            <ExternalLink
              href="https://www.geocod.io"
              className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
            >
              Geocodio
            </ExternalLink>
            . Geocodio may retain the address in its own access logs (up to about
            46 days) under its{" "}
            <ExternalLink
              href="https://www.geocod.io/data-retention-policy/"
              className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
            >
              data-retention policy
            </ExternalLink>
            . We share your address with no one else. We do not sell or share
            your personal information for advertising or any other purpose.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Retention — what we keep
          </h2>
          <p>
            On our side, nothing. We do not store your address, we keep no
            account for you, and we retain no history of your lookups. To speed
            up repeat lookups, results may be cached under a one-way{" "}
            <span className="whitespace-nowrap">SHA-256</span> hash of the
            address — that hash is a cache key, not the address itself, and is
            not a guarantee that the address could never be reconstructed. We do
            not use cookies, analytics, ad trackers, or profiling; the only usage
            data we keep is host-level counts of how many requests the site
            receives, which are not tied to you or your address.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Reviewing or changing your information
          </h2>
          <p>
            Because we keep no address, no account, and no lookup history, there
            is nothing on our side for you to review, correct, or delete. If you
            would like Geocodio to address its own logs, see their data-retention
            policy linked above.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Do Not Track
          </h2>
          <p>
            We do not track you across websites or over time, so there is no
            cross-site tracking behavior for a browser &ldquo;Do Not Track&rdquo;
            signal to change.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Changes to this policy
          </h2>
          <p>
            If we make a material change to how we handle your information, we
            will update this page and revise the effective date shown above.
            Continued use of the tool after a change means the updated policy
            applies.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Contact</h2>
          <p>
            Questions about this policy? Email{" "}
            <a
              href="mailto:reptrackerfeedback@gmail.com"
              className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
            >
              reptrackerfeedback@gmail.com
            </a>
            .
          </p>
        </section>
      </div>

      <p className="border-t border-slate-200 pt-6 text-sm">
        <a
          href="/"
          className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
        >
          ← Back to the lookup
        </a>
      </p>
    </main>
  );
}
