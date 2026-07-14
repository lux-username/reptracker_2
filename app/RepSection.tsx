import type {
  CommitteeAssignment,
  Chamber,
  ContactBlock,
  RepProfile,
  SecondaryBill,
  UpcomingCommitteeAction,
} from "@/lib/types";
import type { ChamberStatus } from "@/lib/session-status";
import ExternalLink from "./ExternalLink";

// Full per-rep section (spec §2): header (name, party, district, delegate
// banner, committees) → contact block → upcoming committee action → secondary bills.
// The contact block sits in natural document flow — not pinned/sticky. LLM
// text (bill summaries, TL;DR) is Issue #5 and is intentionally absent here;
// the "what" is the official title + a Congress.gov link.
//
// Recess pivot (Issue #8 / #27): when this rep's chamber is out of session, a
// factual recess line leads the card and the (empty) committee-action list explains
// itself by the recess rather than looking like a data gap. Copy is minimal /
// factual only — no manufactured urgency (owner steer, decisions.md 2026-07-09).
// The contact block already sits above the committee action, so it becomes the natural
// point of action; the sponsored-bills list keeps its neutral heading.

function readableName(name: string): string {
  const [last, rest] = name.split(",", 2);
  return rest ? `${rest.trim()} ${last.trim()}` : name;
}

const ORDINAL: Record<string, string> = { "1": "st", "2": "nd", "3": "rd" };
function districtLabel(state: string, district: number, nonVoting: boolean): string {
  if (district === 0) return nonVoting ? `${state} (at-large)` : `${state} at-large`;
  const suffix =
    ORDINAL[String(district % 10)] && !(district >= 11 && district <= 13)
      ? ORDINAL[String(district % 10)]
      : "th";
  return `${state}-${String(district).padStart(2, "0")} (${district}${suffix} district)`;
}

/** tel: href — strip everything but digits and a leading +. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Format a date-only "2026-07-13" at local midnight (no UTC off-by-one). */
function formatDayLocal(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** The chamber's proper subject for recess copy. */
function chamberLabel(chamber: Chamber): string {
  return chamber === "senate" ? "The Senate" : "The House";
}

/**
 * Factual recess line for a rep whose chamber is out of session, or null when in
 * session / status unknown. "…in recess until [date]" when we have a return
 * date; the House has none (no machine-readable calendar), so it degrades to
 * "…not currently in session" rather than guessing a date.
 */
function recessLine(chamber: Chamber, status: ChamberStatus | null): string | null {
  if (!status || status.inSession) return null;
  const subject = chamberLabel(chamber);
  return status.returnDate
    ? `${subject} is in recess until ${formatDayLocal(status.returnDate)}.`
    : `${subject} is not currently in session.`;
}

function RoleBadge({ role }: { role: CommitteeAssignment["role"] }) {
  if (role === "Member") return null;
  const tone =
    role === "Chair"
      ? "bg-emerald-100 text-emerald-900"
      : role === "Ranking Member"
        ? "bg-sky-100 text-sky-900"
        : "bg-slate-100 text-slate-700";
  return (
    <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${tone}`}>{role}</span>
  );
}

function Committees({ committees }: { committees: CommitteeAssignment[] }) {
  if (committees.length === 0) {
    return (
      <p className="text-sm text-slate-500">Committee assignments unavailable.</p>
    );
  }
  // Group subcommittees under their parent full committee.
  const full = committees.filter((c) => !c.isSubcommittee);
  const subsByParent = new Map<string, CommitteeAssignment[]>();
  for (const c of committees.filter((c) => c.isSubcommittee)) {
    const key = c.parentCode ?? c.code;
    subsByParent.set(key, [...(subsByParent.get(key) ?? []), c]);
  }
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Committees
      </h4>
      <ul className="flex flex-col gap-2">
        {full.map((c) => (
          <li key={c.code}>
            <span className="font-medium text-slate-900">{c.name}</span>
            <RoleBadge role={c.role} />
            {subsByParent.get(c.code) && (
              <ul className="ml-4 mt-1 flex flex-col gap-1 border-l border-slate-200 pl-3">
                {subsByParent.get(c.code)!.map((s) => (
                  <li key={s.code} className="text-sm text-slate-700">
                    {s.name}
                    <RoleBadge role={s.role} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Contact({ contact }: { contact: ContactBlock }) {
  const hasAny =
    contact.dcOfficePhone ||
    contact.districtOfficePhone ||
    contact.dcOfficeAddress ||
    contact.districtOfficeAddress ||
    contact.websiteUrl;
  if (!hasAny) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-4">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Contact
      </h4>
      <dl className="flex flex-col gap-1 text-sm">
        {contact.dcOfficePhone && (
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="text-slate-500 sm:w-32 sm:shrink-0">DC office phone</dt>
            <dd>
              <a className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900" href={telHref(contact.dcOfficePhone)}>
                {contact.dcOfficePhone}
              </a>
            </dd>
          </div>
        )}
        {contact.districtOfficePhone && (
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="text-slate-500 sm:w-32 sm:shrink-0">District office phone</dt>
            <dd>
              <a
                className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                href={telHref(contact.districtOfficePhone)}
              >
                {contact.districtOfficePhone}
              </a>
            </dd>
          </div>
        )}
        {contact.districtOfficeAddress && (
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="text-slate-500 sm:w-32 sm:shrink-0">District office address</dt>
            <dd className="text-slate-700">{contact.districtOfficeAddress}</dd>
          </div>
        )}
        {contact.dcOfficeAddress && (
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="text-slate-500 sm:w-32 sm:shrink-0">DC office address</dt>
            <dd className="text-slate-700">{contact.dcOfficeAddress}</dd>
          </div>
        )}
        {contact.websiteUrl && (
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="text-slate-500 sm:w-32 sm:shrink-0">Web</dt>
            <dd>
              <ExternalLink
                className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                href={contact.websiteUrl}
              >
                Official website & contact form
              </ExternalLink>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function CommitteeActions({
  actions,
  chamber,
  inRecess,
}: {
  actions: UpcomingCommitteeAction[];
  chamber: Chamber;
  inRecess: boolean;
}) {
  // The product's reason for being (spec §2): rendered as the card's focal
  // panel — an indigo-tinted well with a labelled heading — so it reads at a
  // higher altitude than the supporting committee/contact/bill sections.
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
      <h4 className="flex items-center gap-2 text-sm font-bold tracking-tight text-indigo-950">
        <span className="h-2 w-2 rounded-full bg-indigo-500" aria-hidden />
        Upcoming committee action
      </h4>
      {actions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-indigo-200 bg-white/60 px-4 py-6 text-center">
          <p className="text-sm text-slate-500">
            {inRecess
              ? `No committee meetings while the ${chamber === "senate" ? "Senate" : "House"} is in recess.`
              : "No upcoming committee meetings scheduled for this rep right now."}
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {actions.map((d) => (
            <li
              key={d.eventId}
              className="rounded-lg border border-indigo-100 border-l-4 border-l-indigo-500 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                  {d.kind}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                  {d.roleLabel}
                </span>
              </div>
              <p className="mt-2 text-base font-semibold leading-snug text-slate-900">{d.title}</p>
              <p className="mt-1.5 text-sm font-medium text-slate-700">
                {formatDateTime(d.date)}
                {d.location ? ` · ${d.location}` : ""}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {d.committeeName} ·{" "}
                <ExternalLink className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900" href={d.url}>
                  View on Congress.gov
                </ExternalLink>
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function Bills({ bills }: { bills: SecondaryBill[] }) {
  if (bills.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Sponsored &amp; cosponsored bills
      </h4>
      <ul className="flex flex-col gap-2">
        {bills.map((b) => (
          <li key={b.billId} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <ExternalLink className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900" href={b.url}>
                {b.displayId}
              </ExternalLink>
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                  b.badge === "Primary sponsor"
                    ? "bg-indigo-100 text-indigo-900"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {b.badge}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-800">{b.title}</p>
            {b.summary ? (
              <>
                <p className="mt-1 text-sm text-slate-700">{b.summary}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Nonpartisan summary from the Congressional Research Service
                  {b.summaryBasedOn ? `; bill as introduced, ${formatDate(b.summaryBasedOn)}` : ""}.
                </p>
                {b.summaryAmended && (
                  <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    <span aria-hidden="true">⚠ </span>This bill has been amended since this summary was written. See
                    Congress.gov for current text.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                No plain-English summary yet — Congress.gov notes &ldquo;A summary
                is in progress.&rdquo;
              </p>
            )}
            {b.latestActionText && (
              <p className="mt-1 text-xs text-slate-500">
                Latest: {b.latestActionText}
                {b.latestActionDate ? ` (${b.latestActionDate})` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RepSection({
  profile,
  delegateBanner,
  chamberStatus,
}: {
  profile: RepProfile;
  delegateBanner: string | null;
  chamberStatus?: ChamberStatus | null;
}) {
  const { rep } = profile;
  const isSenator = rep.chamber === "senate";
  const status = chamberStatus ?? null;
  const inRecess = !!status && !status.inSession;
  const recess = recessLine(rep.chamber, status);
  const roleWord = isSenator
    ? "Senator"
    : rep.houseRole === "delegate"
      ? "Delegate"
      : rep.houseRole === "resident-commissioner"
        ? "Resident Commissioner"
        : "Representative";
  const jurisdiction = isSenator
    ? rep.state
    : rep.district !== null
      ? districtLabel(rep.state, rep.district, rep.houseRole !== "representative")
      : rep.state;

  const headingId = `rep-${rep.bioguideId}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {/* Recess pivot (Issue #8): factual status line leads the card; the
          contact block below becomes the natural point of action. */}
      {recess && (
        <p
          role="status"
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
        >
          {recess}
        </p>
      )}

      {/* Header block */}
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {rep.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={rep.imageUrl}
              alt={`${readableName(rep.name)}, ${rep.party} ${rep.state}`}
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
            />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-full bg-slate-100 ring-1 ring-slate-200" aria-hidden />
          )}
          <div>
            <h3 id={headingId} className="text-xl font-bold tracking-tight text-slate-900">
              {readableName(rep.name)}
            </h3>
            <p className="text-sm text-slate-600">
              {roleWord} · {rep.party} · {jurisdiction}
            </p>
          </div>
        </div>

        {/* Delegate banner renders inside the header, before committees (spec §2.1). */}
        {delegateBanner && (
          <p
            role="note"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {delegateBanner}
          </p>
        )}

        <Committees committees={profile.committees} />
        <Contact contact={profile.contact} />
      </header>

      <CommitteeActions
        actions={profile.upcomingCommitteeActions}
        chamber={rep.chamber}
        inRecess={inRecess}
      />
      <Bills bills={profile.secondaryBills} />
    </section>
  );
}
