> Generated 2026-07-09 by /end-session at commit a786ac3.

# STATUS

## Where things stand

**#23 (short-notice freshness) fully resolved and closed** — the external scheduler is live,
its cadence is now set from a real measurement, and the remaining investigation items are
answered.

**The measurement.** Sampled the 40 most-recently-updated House committee meetings and
compared Congress.gov's `updateDate` to the House's own docs.house.gov posting time (joined by
`eventId`): Congress.gov reflects a House meeting **~4–15 min (median 9)** after the House
posts it — 40/40 within 15 min, zero noise. So Congress.gov is a *fresh* source (~15-min
ingestion), and **our poll cadence, not the upstream, is the freshness bottleneck.** That also
settles the "is docs.house.gov materially fresher?" item (no — only ~15 min ahead, not worth
scraping) and the optional read-path head-check (declined — marginal at this cadence).

**The cadence.** Tightened the GitHub Actions scheduler from hourly to **every 30 min
(`15,45 * * * *`)** — halves worst-case staleness (~1h → ~30m) for the short-notice decisions
the product exists for, well within the Congress.gov quota and Upstash free tier, without
out-running the ~15-min source floor. The :15/:45 offset keeps both runs clear of the 08:00
UTC Vercel daily cron (no instance collision, #17). Full rationale + data in decisions.md
(2026-07-09).

Day's tally: **#4, #12, #13, #17, #23 shipped & closed**; **#9 implemented** (open only for the
manual browser AT pass). The `.github/workflows/prewarm.yml` scheduler + the Vercel daily cron
(baseline) both keep the caches warm; `CRON_SECRET` is set in all three places (Vercel /
Keychain / GitHub Actions).

Priorities next — all behind a human gate or owner decision: **#8** (recess pivot — needs an
in-session detection source + a framing steer), **#9** (manual Lighthouse/axe/VoiceOver),
**#18** (favicon — design taste), **#25/#26** (design/compliance strategy). **#21/#27** are
post-MVP. The gate-free build queue is empty.

## Derived facts (from CLAUDE.md commands)

| Fact | Command | Result |
|---|---|---|
| Test status | `npm test` | ✓ 115 tests passing, 17 files (Vitest 4.1.10) |
| Typecheck | `npx tsc --noEmit` | ✓ exit 0 |
| Routes/pages | `find app -name 'route.ts' -o -name 'page.tsx'` | `app/api/cron/prewarm/route.ts`, `app/api/health/route.ts`, `app/page.tsx` |
| Deploy | authorized `curl /api/cron/prewarm` | ✓ **LIVE** · HTTP 200 (serving #4 floor + #13 district offices + events index) |
| Scheduler | `gh run` (workflow_dispatch) | ✓ green · HTTP 200; now runs every 30 min (:15/:45 UTC) |
| Git | `git log --oneline -1` | `a786ac3 Close session 15-of-day: #23 external scheduler …` (pre end-session commit) |

## Active Milestone

**MVP** — https://github.com/lux-username/reptracker_2/milestone/1 (open MVP Issues:
#8, #9, #18). #4, #12, #13, #17, #23 closed; #9 advanced (manual AT pass remaining).
#21, #25, #26, #27 are backlog (no milestone).

## Blockers / open questions

No code blockers. Human-gated items: **#8** (recess detection source + framing steer), **#9**
(manual AT pass), **#18** (icon design), **#25/#26** (strategy). Infra: `prewarm.yml` runs
every 30 min; `CRON_SECRET` in Vercel Production (Sensitive) + macOS Keychain + GitHub Actions.
Standing note: feedback Gmail (`reptrackerfeedback@gmail.com`) unmonitored. Optional env knobs:
`CONGRESS_RATE_BURST` / `CONGRESS_RATE_PER_MIN` (#17), `PREWARM_*` budgets (route).
