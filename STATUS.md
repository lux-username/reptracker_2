> Generated 2026-07-09 by /end-session at commit 67e8739.

# STATUS

## Where things stand

Build session: **#4 ('Floor this week' section) implemented, verified, and closed.**
The app's first scrape feature and its one *global*, address-independent section — the
upcoming House + Senate floor schedule, shown to every visitor because every member
votes on floor items (unlike the ~25-person committee decisions that are the product's
spine).

Design that made it robust: the House publishes a **structured weekly XML feed**
(`docs.house.gov/billsthisweek/YYYYMMDD/YYYYMMDD.xml`), so instead of scraping rendered
HTML we scrape the `/floor` index *only* to discover the current week's XML path (no
guessing which Monday it is around week/recess boundaries), then parse the XML. Bills are
grouped by the source's own procedural categories (suspension / pursuant to a rule) and
each links to its Congress.gov page — keeping the "credit Congress.gov as authority"
stance. The **Senate** side is best-effort per spec ("more brittle; often absent"):
senate.gov's floor page carries only the next convene date/time, which we surface; Senate
bill-level plans live in Calendar PDFs and stay out of scope.

Serving mirrors the events-index pattern: the nightly cron scrapes both and stashes the
result in Upstash (`refreshFloorSchedule`, wired into `prewarm` as step 5, ~3 cheap
fetches); the page reads it with `getFloorSchedule` — one warm KV read. Cold/expired
cache scrapes live and writes through. **Graceful hide is structural:** both chambers
empty ⇒ section renders nothing; the KV entry's ~40h TTL is the "scrape failed for >N
hours" hide. A visible freshness stamp + "schedules change frequently" note keep
best-effort data honest. Added `cheerio` (first scrape dep, per stack). Verified live
end-to-end on `npm run dev`: real House bills rendered with Congress.gov links, the
Senate convene note, the freshness stamp, warm reload in 0.14s, no scrape errors.

Priorities next: **#8 (recess pivot)** is the natural follow-on — it refines exactly the
floor section's behavior (show "Congress not in session" instead of a stale past week)
and needs the in-session detection helper. Then **#23** (short-notice freshness, the #16
fast-follow — note its external-scheduler step needs a GitHub repo secret, a human gate),
and the strategy Issues **#25** (design pass) / **#26** (compliance). **#9** (a11y) is
DoD-blocking. **#12** geocode edge and **#17** rate-limiter are low-priority self-contained
cleanups. **#21**/**#27** are post-MVP feature adds.

## Derived facts (from CLAUDE.md commands)

| Fact | Command | Result |
|---|---|---|
| Test status | `npm test` | ✓ 98 tests passing, 15 files (Vitest 4.1.10) |
| Typecheck | `npx tsc --noEmit` | ✓ exit 0 |
| Routes/pages | `find app -name 'route.ts' -o -name 'page.tsx'` | `app/api/cron/prewarm/route.ts`, `app/api/health/route.ts`, `app/page.tsx` |
| Deploy | `curl` | ✓ **LIVE** https://reptracker2.vercel.app · HTTP 200 (~0.19s) |
| Git | `git log --oneline -1` | `67e8739 Close session 10-of-day: resolve #24 …` (pre end-session commit) |

## Active Milestone

**MVP** — https://github.com/lux-username/reptracker_2/milestone/1 (open MVP Issues:
#8, #9, #12, #13, #17, #18). Roadmap lives there; not restated here. #4 was an MVP Issue,
now closed. #21, #23, #25, #26, #27 are backlog (no milestone).

## Blockers / open questions

None blocking. Standing note (unchanged): the feedback Gmail
(`reptrackerfeedback@gmail.com`) exists but is unmonitored. Env var `CRON_SECRET` is set
in Vercel Production (Sensitive) + a copy in the macOS Keychain. New for #23: its
external-scheduler option needs the `CRON_SECRET` added as a GitHub Actions repo secret —
a human gate when that Issue is picked up.
