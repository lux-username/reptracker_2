> Generated 2026-07-10 by /end-session at commit b271328.

# STATUS

## Where things stand

**Terminology session — #30 closed: the "upcoming decisions" language is retired
across code identifiers, spec, and README.** This was the doc-debt cleanup flagged
since the pitch-reword session (#20/#21): the user-facing UI already said "upcoming
committee action" (a hearing is testimony, not a decision — calling it one
overclaims), but the rest of the codebase still said "decision." Now they speak the
same language.

**Done as one mechanical, typecheck-gated pass.** File rename via `git mv`
(`lib/decisions.ts` → `lib/committee-actions.ts`, plus its test), preserving history.
Identifiers renamed: `UpcomingDecision` → `UpcomingCommitteeAction`,
`buildUpcomingDecisions`/`fetchUpcomingDecisions`(`Live`) →
`…CommitteeActions`, `decisionRoleLabel` → `committeeActionRoleLabel`,
`RepProfile.upcomingDecisions` → `upcomingCommitteeActions`, the `Decisions`
component → `CommitteeActions` (heading now "Upcoming committee action"), log prefix
`[decisions]` → `[committee-actions]`. Import paths and cross-file `decisions.ts`
comment references updated. Docs: README one-liner, spec (§goal, §2.2, §MVP scope,
recess section), MAP.md (tree + annotations).

**Three other senses of "decision" deliberately left alone:** references to
`decisions.md` (the rationale log — append-only history), generic English in the
spec's load-bearing thesis prose (e.g. "leading with the decisions where a call
moves the needle" — the issue explicitly said to preserve the thesis), and
"design decision"/"free-tier decision" phrasing.

**Not yet deployed.** This is a code/docs rename with no runtime behavior change;
tests + typecheck are the gate (both green). No production deploy was needed this
session.

**Priorities next** — all behind a human gate or owner decision: **#9** (manual
Lighthouse/axe/VoiceOver), **#18** (favicon design), **#25/#26** (design/
compliance strategy). **#21** (committee → bills feature) and **#29** (recess PDF
calendar) are enhancements. The gate-free build queue is empty.

## Derived facts (from CLAUDE.md commands)

| Fact | Command | Result |
|---|---|---|
| Test status | `npm test` | ✓ 136 tests passing, 18 files (Vitest 4.1.10) |
| Typecheck | `npx tsc --noEmit` | ✓ exit 0 |
| Routes/pages | `find app -name 'route.ts' -o -name 'page.tsx'` | `app/api/cron/prewarm/route.ts`, `app/api/health/route.ts`, `app/page.tsx` |
| Deploy | `vercel ls` | Last prod: `reptracker2.vercel.app` (#31 hash + privacy copy, prior session; #30 not deployed — no runtime change) |
| Git | `git log --oneline -1` | `b271328 Close session 22: privacy fix #31 shipped; STATUS/journal/decisions sync` |

## Active Milestone

**MVP** — https://github.com/lux-username/reptracker_2/milestone/1 (open MVP Issues:
#9, #18). #4, #8, #12, #13, #17, #23, #27, #31 closed. #21, #25, #26, #29 are
backlog/enhancements (no milestone); #30 closed this session.

## Blockers / open questions

No code blockers. Human-gated items: **#9** (manual AT pass), **#18** (icon design),
**#25/#26** (strategy). Infra: `prewarm.yml` runs every 30 min; `CRON_SECRET` in
Vercel Production (Sensitive) + macOS Keychain + GitHub Actions. Standing note:
feedback Gmail (`reptrackerfeedback@gmail.com`) unmonitored. Optional env knobs:
`CONGRESS_RATE_BURST` / `CONGRESS_RATE_PER_MIN` (#17), `PREWARM_*` budgets (route).
