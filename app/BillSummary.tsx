// Shared bill-presentation atoms used by both the per-rep sponsored/cosponsored
// list (RepSection) and the floor-this-week list (FloorThisWeek): the neutral
// policy-area tag (Issue #36) and the verbatim CRS summary block with its
// "as introduced" stamp + "amended since" warning (Issue #5/#37). Kept in one
// home so the two lists stay visually and editorially identical — no LLM, CRS
// text shown verbatim, structured-only when no summary exists.

/** Format a date-only "2026-07-13" or ISO string as "Jul 13, 2026". */
function formatDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Neutral topic chip for a bill's Congress.gov policy area. Null ⇒ nothing. */
export function PolicyTag({ policyArea }: { policyArea: string | null | undefined }) {
  if (!policyArea) return null;
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
      {policyArea}
    </span>
  );
}

/**
 * The plain-English description block: verbatim CRS summary + attribution +
 * "amended since" warning, or the structured-only "summary in progress" note
 * when there is no CRS summary. Deterministic, no LLM (session-6 decision).
 */
export function BillSummary({
  summary,
  summaryBasedOn,
  summaryAmended,
}: {
  summary: string | null | undefined;
  summaryBasedOn: string | null | undefined;
  summaryAmended: boolean | undefined;
}) {
  if (!summary) {
    return (
      <p className="mt-1 text-xs text-slate-500">
        No plain-English summary yet — Congress.gov notes &ldquo;A summary is in
        progress.&rdquo;
      </p>
    );
  }
  return (
    <>
      <p className="mt-1 text-sm text-slate-700">{summary}</p>
      <p className="mt-1 text-xs text-slate-500">
        Nonpartisan summary from the Congressional Research Service
        {summaryBasedOn ? `; bill as introduced, ${formatDate(summaryBasedOn)}` : ""}.
      </p>
      {summaryAmended && (
        <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
          <span aria-hidden="true">⚠ </span>This bill has been amended since this
          summary was written. See Congress.gov for current text.
        </p>
      )}
    </>
  );
}
