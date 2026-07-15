"use client";

import { useId, useState, useTransition } from "react";
import type { Chamber, CommitteeDocket } from "@/lib/types";
import { committeeDocketAction } from "./actions";
import ExternalLink from "./ExternalLink";
import { BillSummary } from "./BillSummary";

// The committee-docket disclosure (Issue #21): an expandable control under each
// committee/subcommittee a rep sits on. Bills waiting in a committee run to the
// hundreds and most visitors won't open most committees, so the docket is
// fetched on demand — on first expand — via a server action, then cached in
// local state for the session. Warm on the common path (cron-warmed KV).
//
// Rendering matches the sponsored/cosponsored `Bills` list in RepSection: the
// verbatim CRS summary where one exists, structured-only (title + Congress.gov
// link) otherwise. No LLM.

type DocketState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; docket: CommitteeDocket }
  | { status: "error"; message: string };

/** Format a referral date ("2026-07-13" or ISO) as "Jul 13, 2026". */
function formatDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CommitteeBills({
  congress,
  chamber,
  systemCode,
}: {
  congress: number;
  chamber: Chamber;
  systemCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DocketState>({ status: "idle" });
  const [, startTransition] = useTransition();
  const panelId = useId();

  function toggle() {
    const next = !open;
    setOpen(next);
    // Fetch once, on first expand; keep the result for the session.
    if (next && state.status === "idle") {
      setState({ status: "loading" });
      startTransition(async () => {
        const result = await committeeDocketAction(congress, chamber, systemCode);
        if ("error" in result) setState({ status: "error", message: result.error });
        else setState({ status: "loaded", docket: result });
      });
    }
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
      >
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 1 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        {open ? "Hide bills waiting here" : "Bills waiting in this committee"}
      </button>

      {open && (
        <div id={panelId} className="mt-2">
          {state.status === "loading" && (
            <p className="text-sm text-slate-500" aria-live="polite">
              Loading bills…
            </p>
          )}

          {state.status === "error" && (
            <p className="text-sm text-slate-500" aria-live="polite">
              {state.message}
            </p>
          )}

          {state.status === "loaded" && state.docket.bills.length === 0 && (
            <p className="text-sm text-slate-500">
              No bills are currently waiting in this committee.
            </p>
          )}

          {state.status === "loaded" && state.docket.bills.length > 0 && (
            <>
              <p className="mb-2 text-xs text-slate-500">
                {state.docket.totalReferred > state.docket.bills.length
                  ? `Showing the ${state.docket.bills.length} most recently referred of ${state.docket.totalReferred} bills waiting here.`
                  : `${state.docket.totalReferred} bill${state.docket.totalReferred === 1 ? "" : "s"} waiting here.`}{" "}
                <ExternalLink
                  className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                  href={state.docket.committeeUrl}
                >
                  {state.docket.totalReferred > state.docket.bills.length
                    ? "See the full list on Congress.gov"
                    : "View on Congress.gov"}
                </ExternalLink>
              </p>
              <ul className="flex flex-col gap-2">
                {state.docket.bills.map((b) => (
                  <li key={b.billId} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <ExternalLink
                        className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                        href={b.url}
                      >
                        {b.displayId}
                      </ExternalLink>
                      {b.referredDate && (
                        <span className="text-xs text-slate-500">
                          Referred {formatDate(b.referredDate)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-800">{b.title}</p>
                    <BillSummary
                      summary={b.summary}
                      summaryBasedOn={b.summaryBasedOn}
                      summaryAmended={b.summaryAmended}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
