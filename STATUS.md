> Generated 2026-07-09 by /end-session at commit b394045.

# STATUS

## Where things stand

**#23 (short-notice freshness) — external scheduler live and verified; issue kept open**
for the remaining measurement/tuning. The owner picked this up and asked to wire the secret.

The one missing piece was the **GitHub Actions repo secret** (Vercel env + Keychain copy
already existed; Actions had `total_count: 0` and there was no workflow). Set it **from the
Keychain over a pipe** (value never printed / never in argv), then confirmed with a live
**authorized 200** against prod that all three copies (Keychain / Vercel / Actions) match.
`.github/workflows/prewarm.yml` now curls `/api/cron/prewarm` **hourly at :20 UTC** with
Bearer auth — offset from the Vercel daily cron (08:00 UTC, kept as a baseline) so the two
never collide on one instance and throttle each other under the #17 limiter (that collision,
reproduced during testing, is what 504'd). The workflow tolerates transient 502/503/504
(incremental warm resumes next run) but hard-fails on auth/URL errors. Verified green: a
dispatched run returned HTTP 200 in 9.3s (floor=16, districtOffices=533, eventsIdx=41).

**#23 stays open** for its remaining acceptance items: measure Congress.gov's own publish
latency to confirm hourly isn't over-polling (and tune from data), investigate a fresher
upstream source (docs.house.gov feeds), and the optional read-path head-check. Hourly is a
safe conservative default until measured. Decision recorded in decisions.md (2026-07-09).

Day's build tally: **#4, #12, #13, #17 shipped & closed**; **#9 implemented** (open for the
manual AT pass); **#23** scheduler live (open for measurement).

Priorities next — all behind a human gate or owner decision: **#8** (recess pivot — detection
source + framing steer), **#9** (manual Lighthouse/axe/VoiceOver), **#18** (favicon — design
taste), **#25/#26** (design/compliance strategy), plus **#23**'s measurement/tuning. **#21/#27**
are post-MVP.

## Derived facts (from CLAUDE.md commands)

| Fact | Command | Result |
|---|---|---|
| Test status | `npm test` | ✓ 115 tests passing, 17 files (Vitest 4.1.10) |
| Typecheck | `npx tsc --noEmit` | ✓ exit 0 |
| Routes/pages | `find app -name 'route.ts' -o -name 'page.tsx'` | `app/api/cron/prewarm/route.ts`, `app/api/health/route.ts`, `app/page.tsx` |
| Deploy | authorized `curl /api/cron/prewarm` | ✓ **LIVE** · HTTP 200 (serving #4 floor + #13 district offices + events index) |
| Scheduler | `gh run` (workflow_dispatch) | ✓ green · HTTP 200 in 9.3s |
| Git | `git log --oneline -1` | `b394045 Harden #23 scheduler …` (pre end-session commit) |

## Active Milestone

**MVP** — https://github.com/lux-username/reptracker_2/milestone/1 (open MVP Issues:
#8, #9, #18). #4, #12, #13, #17 closed today; #9 advanced (manual AT pass remaining).
#21, #23, #25, #26, #27 are backlog (no milestone); #23 has its scheduler shipped.

## Blockers / open questions

No code blockers. Human-gated items: **#8** (recess detection source + framing steer),
**#9** (manual AT pass), **#18** (icon design), **#25/#26** (strategy), **#23** measurement.
New infra: `.github/workflows/prewarm.yml` runs hourly (needs the `CRON_SECRET` Actions
secret — now set). Standing notes: feedback Gmail (`reptrackerfeedback@gmail.com`) unmonitored;
`CRON_SECRET` in Vercel Production (Sensitive) + macOS Keychain + GitHub Actions. Optional env
knobs: `CONGRESS_RATE_BURST` / `CONGRESS_RATE_PER_MIN` (#17), `PREWARM_*` budgets (route).
