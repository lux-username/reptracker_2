> Generated 2026-07-23 by /end-session at commit c01efea.

# STATUS

## Where things stand

**Session 2026-07-23 (1) — naming exploration + a doc-drift audit that found real staleness.**
No application code changed. Two threads:

**1. Product name.** Explored alternatives to "Representative Tracker" — the concern being
that "tracker" frames the representative as a subject under watch, which inverts the
product's actual stance (the constituent is the principal). Landed on a candidate,
**Representative Activity Lookup**, filed as a decision issue (#46) rather than
implemented. The reasoning is worth more than the name: any candidate has to clear two
constraints already established by prior decisions — **no synthesis** (the LLM was retired
in session 6, so "Brief"/"Digest"/"Report" promise an editorial condensation that doesn't
exist) and **no decision-overclaim** (#30 retired "upcoming decisions", so "Docket"/"Before
the Vote" misdescribe what is mostly hearings and sponsored bills). Both constraints are
recorded in `decisions.md` this session because they will outlive this particular name.

**2. Doc drift.** The naming discussion surfaced that `CLAUDE.md` still described a stack
that no longer exists — it claimed an Anthropic/Haiku LLM layer retired seven months of
sessions ago. A follow-up audit found four more stale claims. `CLAUDE.md` is now fixed: the
Stack section was **replaced with a pointer to `spec.md` §Tech stack** rather than
corrected in place, because the duplication was itself the drift mechanism — every stale
claim in it was a copy that diverged from its original. Also fixed: the project
description no longer uses the retired "upcoming decisions" phrasing, three rows were added
to the Derived Facts table, and `sessions/` was added to the one-home routing rule.

**The pointer created a dependency:** `CLAUDE.md` now sends readers to `spec.md` §Tech
stack, and that section carries two of the same errors (#47). Until #47 is fixed the
pointer launders stale facts as authoritative — worse than the duplication it replaced.
**#47 is the highest-value next task.**

**Priorities next** — **#47** first (see above). Then **#46** is a decision to make, not
work to do. #48 and #49 are small and independent.

## Derived facts (from CLAUDE.md commands)

| Fact | Command | Result |
|---|---|---|
| Test status | `npm test` | ✓ 195 tests passing, 24 files (Vitest 4.1.10) |
| Typecheck | `npx tsc --noEmit` | ✓ exit 0 |
| Routes/pages | `find app -name 'route.ts' -o -name 'page.tsx'` | `app/api/cron/prewarm/route.ts`, `app/api/health/route.ts`, `app/page.tsx`, `app/privacy/page.tsx` |
| Latest commit | `git log --oneline -1` (pre-doc-commit) | `c01efea Close session 2026-07-16 (2): reframe "pre-launch gates" as accepted risk + forever invariant` |
| Open issues | `gh issue list --state open` | 5 — #45, #46, #47, #48, #49 |
| Active milestone | `gh issue list --milestone MVP --state open` | 2 open — #46, #47 |
| Deploy | `vercel ls` | latest: `reptracker2-2cf54ytfx-lukitux-4243s-projects.vercel.app` |

## Active Milestone

**MVP** — https://github.com/lux-username/reptracker_2/milestone/1 — **2 open (#46, #47)**.

⚠ **This reverses last session's "MVP complete, 0 open."** Nothing regressed; both issues
were filed *into* MVP this session on the judgement that pre-launch identity (#46) and the
accuracy of the doc `CLAUDE.md` now depends on (#47) are MVP concerns. If you disagree,
unmilestone them and MVP returns to complete — the code has not moved.

## Blockers / open questions

- **#47 blocks trusting `CLAUDE.md`'s Stack pointer.** Not a launch blocker; a
  correctness-of-documentation blocker. Highest-value next task.
- **#46 is an open decision, not a task.** Nothing is implemented. If accepted, the
  user-facing rename is exactly two strings (`app/layout.tsx:6`, `app/page.tsx:27`) — the
  metadata description and hero subhead are already correct. Repo/Vercel/`prewarm.yml`
  names are explicitly out of scope: renaming the deploy would break the prewarm cron.
- **Untracked files in the working tree, disposition unknown** — `portfolio_draft2.md`,
  `portfolio_draft3.md`, `documents outdated/`, `portfolio materials/`. These predate this
  session and were deliberately **not** committed by /end-session, since they are not
  session work and may be intended as local-only. They need a home: commit them, gitignore
  them, or move them out of the repo. No issue filed — this is a question for the owner,
  not a defect.
- **Prior invariants still stand** (unchanged this session): shipping #43 without counsel
  is an accepted risk, not a gate (decisions.md 2026-07-16); and the #43 privacy claim
  depends on infra staying as-is — Vercel Hobby, no body-capturing log drain, no
  payload-capturing observability. Re-verify only if that changes.
