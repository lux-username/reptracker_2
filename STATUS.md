> Generated 2026-07-09 by /end-session at commit 7c395d2.

# STATUS

## Where things stand

Strategy session: **#24 (utility gap vs. Congress.gov) resolved and closed.** No code
changed — this was a "why does this product exist" meeting whose output is a recorded
editorial position plus two follow-up Issues.

The resolution's sharp core: **every atom we render already exists on Congress.gov** (we
show CRS text verbatim and link back for every item), so we can't and don't out-content
it. Our entire moat is the **selection + ordering layer** — given your address, the
specific ~25-person committee decisions your specific reps are about to make, soonest
first, with the number to call. That's a *routing/timing* claim, never a "better data"
claim, which also keeps it compatible with the footer disclaimer that credits
Congress.gov as authoritative (differentiate on function, credit on authority).
One-liner of record: *"Congress.gov has every fact; it can't tell you which of them is
about to matter to you. We turn its archive into your personal, time-ordered call sheet."*
Full rationale in `decisions.md` (2026-07-09).

Two owner decisions: (1) **UI framing kept implicit** — the design embodies the bet;
over-framing reads salesy for a civic tool and risks stepping on the "not affiliated"
disclaimer. (2) The one real "worse Congress.gov" risk — the **empty upcoming-decisions
state**, where the secondary bill list becomes the de-facto headline — is filed as **#27**
(overlaps #8 recess) rather than built here.

Also this session: a committee-pipeline feature idea ("see the bills parked in a rep's
committee") was raised; it's a strong thesis fit but already existed as **#21**. The new
framing (no editorial "stuck" label; reuse §2.3's procedural-activity filter; doubles as
the #27 empty-state filler) was folded into **#21**; the duplicate I filed (#28) was
closed as a dup.

Underlying build unchanged since #16/#22: **nightly pre-warm cron + full events index**
live; structured-only bills carry the honest no-summary note. Production verified this
session (HTTP 200, ~0.32s).

Priorities next: remaining session-13 strategy Issues (**#25** design pass, **#26**
compliance); on the build side **#23** (short-notice freshness, the #16 fast-follow),
then **#4**/**#8**. **#27** (empty-state pivot) and **#21** (committee pipeline) are
strong post-MVP adds surfaced by the #24 work. **#12** geocode edge is low-priority.

Open Issues (13): #4, #8, #9, #12, #13, #17, #18, #21, #23, #25, #26, #27.
(#24 closed this session; #27 filed; #28 filed then closed as a dup of #21.)

## Derived facts (from CLAUDE.md commands)

| Fact | Command | Result |
|---|---|---|
| Test status | `npm test` | ✓ 85 tests passing, 13 files (Vitest 4.1.10) |
| Typecheck | `npx tsc --noEmit` | ✓ exit 0 |
| Routes/pages | `find app -name 'route.ts' -o -name 'page.tsx'` | `app/api/cron/prewarm/route.ts`, `app/api/health/route.ts`, `app/page.tsx` |
| Deploy | `curl` | ✓ **LIVE** https://reptracker2.vercel.app · HTTP 200 (~0.32s) |
| Git | `git log --oneline -1` | `7c395d2 Close session 9-of-day: implement #22 …` (pre end-session commit) |

## Active Milestone

**MVP** — https://github.com/lux-username/reptracker_2/milestone/1 (open MVP Issues:
#4, #8, #9, #12, #13, #17, #18). Roadmap lives there; not restated here.
#21, #23, #25, #26, #27 are backlog (no milestone) — #23 is the #16 fast-follow;
#25/#26 are strategy/direction items; #21/#27 are post-MVP feature adds.

## Blockers / open questions

None blocking. The strategy Issues (#25/#26) are open *questions* by nature but nothing
blocks continued build. Standing note (unchanged): the feedback Gmail
(`reptrackerfeedback@gmail.com`) exists but is unmonitored. Env var `CRON_SECRET` is
set in Vercel Production (Sensitive) + a copy in the macOS Keychain.
