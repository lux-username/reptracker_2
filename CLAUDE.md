# CLAUDE.md — how to work here

Read at the start of every session. This is "how we work here," not what the project is (that's spec.md).

## Project

Constituent Representative Tracker — a web app that lets a US constituent enter their address and see, in time to act, what their federal representatives are working on: the committee action ahead and the bills they're sponsoring, plus the structural context (committee role, contact info) needed to weigh in.

Note the vocabulary: **"what your reps are working on," not "upcoming decisions."** A hearing is not a decision, and the sponsored-bills half isn't one either — the "upcoming decisions" framing was retired as an overclaim under Issue #30 (see `decisions.md`). Don't reintroduce it in user-facing copy.

## Stack

**Stack → `spec.md` §Tech stack.** Do not restate it here. This section previously
duplicated that list, and every copy drifted: it still claimed an Anthropic/Haiku LLM
layer (retired session 6), "one page, one route" (now two pages + two route handlers),
and Vercel Cron as the scraper's scheduler (it is GitHub Actions). Derive from the code,
or read the one home.

Two standing constraints that are working practice rather than stack description:

- **No LLM, by decision.** No model sits between the citizen and authoritative
  government text — bill descriptions are nonpartisan CRS summaries rendered verbatim.
  Do not reintroduce generated prose without revisiting the "Retired the LLM entirely"
  decision in `decisions.md`.
- **Scraper cadence is split across two schedulers.** Vercel Hobby crons are daily-only,
  so the real cadence is GitHub Actions (`.github/workflows/prewarm.yml`) hitting
  `/api/cron/prewarm`, with `vercel.json`'s daily cron as backstop. Change one, check the
  other — and check `CRON_SECRET` in both places.

## Key commands

| Action | Command |
|---|---|
| Build | `npm run build` |
| Test | `npm test` |
| Run | `npm run dev` |

## Derived Facts — read by /end-session and /weekly-reconciliation

Every fact below is obtained by **running the command, never by recall**. If you catch yourself typing one of these from memory into any doc, stop and run the command instead. Add a row whenever a new kind of fact starts appearing in docs — an unrepresented fact here is a future drift.

| Fact | Command |
|---|---|
| Test status | `npm test` |
| Typecheck clean | `npx tsc --noEmit` |
| Implemented routes/pages | `find app -name 'route.ts' -o -name 'page.tsx' 2>/dev/null | sort` |
| Deploy URL / last deploy status | `vercel ls 2>/dev/null | head` (or check the Vercel dashboard) |
| Latest commit | `git log --oneline -1` |
| Open issues | `gh issue list --state open` |
| Active milestone + open count | `gh issue list --milestone MVP --state open` |

## Rules

- **Every fact has exactly one home.** Reference or derive; never copy into a second place.
- Current state → `STATUS.md` (overwritten). History → `journal/` (append). Rationale → `decisions.md` (append). Open tasks → GitHub Issues. Roadmap → Milestones. Design → `spec.md`. Session transcripts → `sessions/` (rendered by /end-session). Repo layout → `MAP.md` (tree derived by command; annotations curated; refreshed by /weekly-reconciliation).
- **Plans never live only in the journal.** If it's open work, it's an Issue.
- Session start: read `STATUS.md` (check its stamp date), then `gh issue list --state open`.
- Session end: run **/end-session**. Always — a skipped run is how STATUS.md starts lying.
- **Session labels are date-scoped: `YYYY-MM-DD #N`** (N = the day's Nth session, matching the `journal/YYYY-MM-DD-N.md` filename). Mirror it in commit subjects ("Close session YYYY-MM-DD (N): …"). A bare "session N" is meaningless without the date — always qualify. Existing pre-2026-07-15 journal entries used ad-hoc global/per-day numbering; that history is grandfathered, not rewritten (Issue #32).
