import type { FloorSchedule } from "@/lib/floor-schedule";
import type { SessionStatus } from "@/lib/session-status";

// "On the floor this week" — the one global, address-independent section (Issue
// #4, spec §2.3). Every member votes on these same floor items, so it's shown to
// every visitor. Best-effort scraped: a clearly visible freshness stamp and a
// "schedules change frequently" note keep expectations honest.
//
// Recess (Issue #8): when a chamber is out of session, the posted floor XML is
// stale (an old week), so instead of that list we show a plain "not in session"
// line — factual only, no editorializing (owner steer, decisions.md 2026-07-09).

/** Format a date-only ("2026-06-29") or full ISO string as "June 29, 2026". */
function formatDay(value: string): string {
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Format the scrape timestamp as a short "as of" stamp. */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function FloorThisWeek({
  data,
  session,
}: {
  data: FloorSchedule | null;
  session?: SessionStatus | null;
}) {
  const houseOut = !!session && !session.house.inSession;
  const senateOut = !!session && !session.senate.inSession;

  const showHouseSchedule = !!data?.house && !houseOut;
  const showSenateSchedule =
    !!data?.senate && (!!data.senate.date || !!data.senate.note) && !senateOut;
  const showHouse = houseOut || showHouseSchedule;
  const showSenate = senateOut || showSenateSchedule;

  if (!showHouse && !showSenate) return null;

  const senateReturn = session?.senate.returnDate;

  return (
    <section
      aria-labelledby="floor-heading"
      className="flex flex-col gap-5 rounded-xl border border-slate-200 p-5"
    >
      <header className="flex flex-col gap-1">
        <h2 id="floor-heading" className="text-xl font-bold text-slate-900">
          On the floor this week
        </h2>
        <p className="text-sm text-slate-600">
          What the full House and Senate are scheduled to take up. Unlike committee
          decisions, every member votes on these — the same for everyone.
        </p>
      </header>

      {houseOut && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            House
          </h3>
          <p className="text-sm text-slate-700">The House is not currently in session.</p>
        </div>
      )}

      {showHouseSchedule && data?.house && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            House · week of {formatDay(data.house.weekOf)}
          </h3>
          {data.house.categories.map((cat) => (
            <div key={cat.heading} className="flex flex-col gap-2">
              {cat.heading && (
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {cat.heading}
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {cat.bills.map((b) => (
                  <li
                    key={`${b.legisNum}:${b.title}`}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    {b.url ? (
                      <a
                        className="font-medium text-sky-800 underline"
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {b.legisNum}
                      </a>
                    ) : (
                      <span className="font-medium text-slate-900">{b.legisNum}</span>
                    )}
                    {b.title && b.title !== b.legisNum && (
                      <p className="mt-1 text-sm text-slate-800">{b.title}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {senateOut && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Senate
          </h3>
          <p className="text-sm text-slate-700">
            {senateReturn
              ? `The Senate is in recess until ${formatDay(senateReturn)}.`
              : "The Senate is not currently in session."}
          </p>
        </div>
      )}

      {showSenateSchedule && data?.senate && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Senate
          </h3>
          <p className="text-sm text-slate-700">
            {data.senate.date}
            {data.senate.date && data.senate.note ? " — " : ""}
            {data.senate.note}
          </p>
          <p className="text-xs text-slate-500">
            The Senate publishes bill-level floor plans close to the day; see
            Congress.gov for the daily schedule.
          </p>
        </div>
      )}

      {data && (
        <p className="text-xs text-slate-500">
          Floor schedules change frequently. As of {formatStamp(data.builtAt)}. Sourced
          from docs.house.gov and senate.gov.
        </p>
      )}
    </section>
  );
}
