// Dedicated feedback inbox for non-GitHub users — a standalone Gmail, not a
// personal/maintainer inbox (spec §5).
const FEEDBACK_EMAIL = "reptrackerfeedback@gmail.com";
const ISSUES_URL = "https://github.com/lux-username/reptracker_2/issues/new";

export default function Footer() {
  return (
    <footer className="mx-auto w-full max-w-2xl px-6 pb-16">
      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 text-sm text-slate-500">
        <p>
          An independent tool, <strong className="font-medium text-slate-600">not
          affiliated with the U.S. Congress or any government body</strong>.
          Schedules and contact details come from public records and may be
          incomplete or out of date. For the authoritative source, see{" "}
          <a
            href="https://www.congress.gov"
            className="underline underline-offset-2 hover:text-slate-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            Congress.gov
          </a>
          .
        </p>
        <p>
          Your address is used once to look up your district, then discarded — no
          accounts, no personal data stored, no analytics beyond Vercel&apos;s
          built-in request counts.
        </p>
        <p className="flex flex-wrap gap-x-6 gap-y-2">
          <a
            href={`mailto:${FEEDBACK_EMAIL}`}
            className="underline underline-offset-2 hover:text-slate-700"
          >
            Send feedback
          </a>
          <a
            href={ISSUES_URL}
            className="underline underline-offset-2 hover:text-slate-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            Report an issue
          </a>
        </p>
      </div>
    </footer>
  );
}
