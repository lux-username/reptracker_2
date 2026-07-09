# Decisions — append-only

"Chose X over Y because Z." Dated, newest at the bottom. Rationale lives here so it stops hiding in changelog bullets and commit messages.

<!-- Format:

## YYYY-MM-DD — Chose X over Y

Because Z. (Link the journal entry or issue if the context helps.)

-->

## 2026-07-08 — Chose the existing MVP spec as `spec.md` over a fresh skeleton

The clean-room `civic-rep-tracker-mvp-spec.md` already covered goal, requirements, architecture, data model, out-of-scope, and future direction. Promoting it to `spec.md` (rather than generating an empty template beside it) honors the "every fact has exactly one home" rule instead of splitting the design of record across two files.

## 2026-07-08 — Chose npm + Vitest for the toolchain

This build is as much correctness-critical pure logic (hallucination validator, bill sort order, per-rep content hash, recess detection) as it is UI. Vitest is the lightest way to lock that logic down; npm avoids introducing a package-manager dependency before anything is scaffolded. Playwright/e2e can be added later if the UI surface warrants it.

## 2026-07-08 — Chose a public GitHub repo over private

The spec's feedback channel includes a GitHub "Report an issue" link for developers, which needs a public repo eventually. Going public from day one avoids a later migration and matches the project's civic, open-tool character. No secrets live in the tree (`.gitignore` covers `.env*`).

## 2026-07-08 — Pinned `typescript@5` over the default TypeScript 7

`npm install -D typescript` now pulls **TypeScript 7** (the new native/Go compiler). Next.js 16 doesn't recognize it as a valid TS install: during `next build` the "Running TypeScript" step decides TS is missing, launches its auto-installer, and crashes with the cryptic `The "id" argument must be of type string. Received undefined`. Pinning `typescript@5` (5.9.3) makes the build's TS check and `tsc --noEmit` both pass. Revisit once Next.js ships TS 7 support; until then a bare `typescript` bump will break the build. (Session 2, Issue #1.)

## 2026-07-08 — Scaffolded manually over `create-next-app`

The repo already held the workflow structure (STATUS/journal/decisions/spec/skills). `create-next-app` wants an empty or new directory and would have fought that layout, so the Next.js app was assembled by hand — full control over versions and config, no risk of clobbering existing files. (Session 2, Issue #1.)

## 2026-07-08 — Chose Congress.gov as the authoritative rep resolver over Geocodio's embedded legislators

Geocodio's `cd` field returns `current_legislators` (with `bioguide_id`) inline, so the whole address→reps lookup *could* be done with one API. We use Geocodio only for geocoding + disambiguation and resolve the actual reps from Congress.gov by `(congress, state, district)` instead. Congress.gov is the spec's named source of truth for member data; its `current_legislators` is a convenience field that can lag reality (e.g. after a special election), and this feature is correctness-critical ("wrong district = product failure"). Resolving from Congress.gov decouples rep *identity* from Geocodio's data freshness and builds the member client that Issues #3+ need anyway. Geocodio's embedded legislator surname is still used, but only as a cheap disambiguation-screen preview, never as the resolved answer. (Session 4, Issue #2.)

## 2026-07-08 — Mapped Geocodio at-large district `98` to Congress.gov `0`; keyed non-voting status off OCD id

Geocodio encodes at-large delegate districts (DC + territories) as district `98` and voting at-large states (e.g. WY) as `0`; Congress.gov uses `0` for both. So the resolver normalizes `98→0` and everything else passes through. Non-voting status (delegate/resident commissioner, no senators) is detected from the OCD division id (`district:` / `territory:` vs `state:`) backed by a hardcoded set {DC, PR, GU, VI, AS, MP} — a stable constitutional fact, not drifting data. WY (`state:wy`, district `0`) is correctly classified as a *voting* at-large member with senators, distinct from DC/PR at-large delegates. Verified against live API responses for KS, WY, DC, PR, and a straddling ZIP. (Session 4, Issue #2.)

## 2026-07-08 — Chose `unitedstates/congress-legislators` as the committee-assignment source over the Congress.gov API

The whole product centers on committee work, so per-rep committee assignments *with structural role* (chair / ranking / member) are load-bearing. But the Congress.gov API does not expose them: `/member/{id}` returns no committee data and `/member/{id}/committee` 404s (verified live). The canonical machine-readable source is the `unitedstates/congress-legislators` project's static JSON — `committee-membership-current.json` (committee code → members with `title`/`rank`) + `committees-current.json` (display names + subcommittees). Meeting `systemCode` (e.g. `hsag00`) maps to a committee-membership code by uppercasing and stripping a trailing `00` (`HSAG`); subcommittees keep their suffix (`HSAG16`). Trade-off: a second data source with its own freshness, but it's the only clean path to role data and is widely used/maintained. (Session 5, Issue #3.)

## 2026-07-08 — Scoped Issue #3 to structured data; deferred LLM text, caching, and district-office scrape to their own issues

Issue #3 ("per-rep section layout") borders #4/#5/#7. Boundaries held: (1) the neutral TL;DR and plain-English bill/hearing summaries are Issue #5 — #3 renders official titles + Congress.gov links (the spec's structured fallback) and leaves `RepProfile.tldr` null; (2) caching + the nightly pre-warm cron are Issue #7 — the upcoming-decisions meeting sweep is built working but bounded (`SWEEP_LIMIT=60` recent-by-updateDate details per chamber) and *logs* when it truncates (spec: no silent caps), which is why a rep whose committee has no meeting in that window (e.g. Davids at build time) honestly shows "none scheduled" until #7 warms all events; (3) district-office phone is scraped best-effort per spec risks and is deferred — `districtOfficePhone` is null and the Congress.gov DC-office phone is the guaranteed callable fallback. Address formatting handles the heterogeneous member-detail payload (House = building + city/zip fields; Senate embeds the full address in `officeAddress`, with a bogus generic `zipCode`). (Session 5, Issue #3.)

## 2026-07-08 — Confirmed Claude Haiku 4.5 as the summary model against live docs

CLAUDE.md + spec mandate re-verifying the model ID + pricing at build time rather than trusting the pin. Verified against platform.claude.com/docs models overview on 2026-07-08: current Haiku is **`claude-haiku-4-5`** (pinned `claude-haiku-4-5-20251001`), **$1/MTok in, $5/MTok out**, 200K context, 64K max output — the spec's pinned value is still current, and no newer Haiku exists (current family: Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5). Consequence for the client: Haiku 4.5 does **not** support adaptive thinking or the `effort` param (both are 4.6+-only / error on Haiku), so the summarizer makes a plain, un-thinking call. Structured outputs *are* supported but aren't needed for free-text 1–2 sentence summaries. The stable system prompt (~224 tokens) is below Haiku's 4096-token prompt-cache minimum, so prompt caching silently no-ops — immaterial, since the per-artifact KV cache (by `source_hash`) is the real cost lever. Measured cost: ~$0.001 per bill-summary call, ~$0.02 per fully-cold 3-rep lookup, ~$0 on cache hits. (Session 6, Issue #5.)

## 2026-07-08 — Scoped Issue #5 to bill summaries + per-rep TL;DR; refusal guard belongs to #5, fact-validation to #6, cost/cache infra to #7

Issue #5 borders #6 and #7. Boundaries: (1) the **code-level hallucination fact-validator** (unsourced fact-shaped entities block publication) is **#6** — `summarizeBill` calls an injectable `validate` hook defaulting to pass-through, so #6 drops in without touching the pipeline; (2) **Upstash backend + per-minute rate limit + nightly pre-warm cron** are **#7** — #5 ships a `KVCache` interface with an in-memory default and the daily-spend cap enforced at the LLM-client layer (see next entry); (3) **per-decision-item hearing/markup summaries** are deferred to **#14** (the per-rep TL;DR already digests upcoming decisions; meeting titles render plain). Distinct from #6's fact-check, #5 adds an **output-sanity `isUsableSummary` guard**: for opaque bill titles with no CRS summary yet, Haiku correctly *refuses* to summarize ("I cannot summarize from the title alone…") — that meta-commentary is not a summary and must fall back to structured-only, not render as text. Caught in live browser verification and fixed. Summaries are cached by `(bill_id, source_hash)` so a revised CRS summary regenerates and everything else is reused; the "Based on bill as introduced, [date]" stamp + "amended since" warning come from comparing the introduced text-version date to the latest text-version date. (Session 6, Issue #5.)

## 2026-07-08 — Corrected #5: never summarize from a bill title alone; no descriptive source ⇒ structured-only

The first #5 cut had a title-only fallback: when a bill had no CRS summary, the LLM was asked to summarize from the **title alone**. That's a grounding violation — a title is a name, not a description, so the model must *infer* what the bill does, which is exactly the ungrounded guessing the whole pipeline exists to prevent (and the `isUsableSummary` refusal guard only caught the cases where Haiku *declined*; descriptive-looking titles still produced inferred summaries). Corrected the same session it was caught: `buildGroundedSource` now returns `basis: "none"` whenever there is no CRS summary, so those bills render **structured-only** (official title + Congress.gov link, no generated text). A summary is produced ONLY from real descriptive source. Coverage trade-off (fewer bills summarized until CRS lands) is accepted over any risk of ungrounded output; the spec's *proper* grounded fallback — first sentences of the actual **bill text**, not the title — is filed as #15. Verified in-browser: only the two CRS-backed bills (S.4628, S.4487) show a summary; the other 19 are structured-only; no title-derived or refusal text on the page. (Session 6, corrects Issue #5.)

## 2026-07-08 — Retired the LLM entirely: render CRS summaries verbatim, cut the per-rep TL;DR (supersedes the #5 LLM design)

After #5 shipped, review surfaced two problems that together dissolved the case for an LLM in the MVP. **(1) The per-rep TL;DR carried no useful nonobvious signal** — it restated the structured lists directly above it, and the version that *would* be nonobvious (connecting sponsorship + committee role + schedule into leverage) is exactly the editorial/leverage synthesis the spec forbids. So the neutral digest is redundant and the useful digest is off-limits → **cut it.** **(2) A small model can't safely turn source into a description across the board.** The key distinction: rewriting a **CRS summary** is *compression of expert prose* (safe); interpreting **raw bill text** is *legal interpretation* requiring the U.S. Code it amends and context the model isn't given (unsafe, and beyond Haiku). And CRS summaries are **already plain-English, nonpartisan, expert-written** — so the LLM was only lightly compressing already-plain text, marginal polish at a real accuracy cost in a tool where "wrong = product failure."

Decision: **do not put a language model between the citizen and authoritative government text.** Bills render the **CRS summary verbatim** (full text, HTML-stripped — no truncation, so no meaning lost), attributed to the Congressional Research Service, with the "bill as introduced, [date]" stamp + "amended since" warning (both structural, not LLM). No CRS summary ⇒ **structured-only** (official title + Congress.gov link); we never infer from the title or raw text. Consequences: deleted `lib/anthropic.ts` + `lib/cache.ts`, removed the `@anthropic-ai/sdk` dependency, cut `summarizeRepDigest`/`RepProfile.tldr`; `summarizeBill` → deterministic `extractBillSummary`. Closed #6 (nothing to validate), #14 + #15 (no LLM summaries) as obviated; #7 rescoped to API-response caching + cron (LLM spend controls dropped). This supersedes the four #5 LLM decisions below (model verification, spend cap, refusal guard, title-only removal), which are retained as history. `ANTHROPIC_API_KEY` stays in `.env.local` (dormant, gitignored). Verified in-browser: only CRS-backed bills show a (verbatim, CRS-attributed) summary; no TL;DR, no AI framing, no title/refusal text. (Session 6.)

## 2026-07-08 — Daily spend cap ($5/day) as the LLM cost-guardrail window, over per-session/per-run

Needed a spend guardrail once real Haiku calls were live. Chose a **$5/day** hard cap enforced at the LLM-client layer (`assertUnderDailyCap`/`recordSpend`, cost from `response.usage`). A *day* is the right window: this app has no server-side user sessions (spec = no accounts) and no "run" concept, and cost tracks **new congressional content** (a daily cadence, warmed by the #7 cron) rather than user traffic — so per-request/per-session windows don't map. Matches the spec's stated guardrail ("hard ceiling e.g. $5/day … client refuses new calls, renderer falls back to structured-only, site keeps working"). Current counter lives in the `KVCache` (per-process in-memory now); #7 makes it Upstash-atomic and adds the per-minute rate limit. A console-side monthly spend limit is the recommended account-level backstop (set by the account owner, not in code). (Session 6, Issue #5.)

## 2026-07-09 — Scoped Issue #7 to the caching layer; split the cron + events-index (#16) and rate limiter (#17) out; graceful degradation is load-bearing

#7 as filed bundled three things of very different size/risk: Upstash response caching, a nightly pre-warm cron, and LLM cost guardrails. The session-6 no-LLM pivot already obviated the guardrails. Of the rest, the **caching layer** is self-contained, testable without a deploy, and the foundation the cron later warms — so it was built this session and #7 closed on it. The **cron + full upcoming-events index** (the real fix for `decisions.ts`'s bounded `SWEEP_LIMIT=60` sweep, which silently misses a rep whose meeting falls outside the recent-60 window) became **#16**, deferred because a Vercel Cron can't run until deploy (#11) *and* it's a correctness behavior change worth its own focused pass. A Congress.gov client-side rate limiter — only stressed once the cron does bulk warming — became **#17**. Design: a single `cached(key, ttl, loader)` primitive with three spec TTL tiers (geocode 24h / reference 5h / events 45min) and versioned keys, wired into all 7 fetch sites by extracting each body into a `*Live` inner. **Graceful degradation is a hard requirement, not a nicety:** no Upstash creds ⇒ pass-through; a Redis error or miss ⇒ fall through to the live fetch; a `loader` throw ⇒ propagate *uncached* (so a Geocodio 422 / HTTP error is never stored). This keeps dev, tests, and cold starts behaving exactly as an uncached request. (Session 7, Issue #7 → #16/#17.)

## 2026-07-09 — Upstash creds live in `.env.local`, not the Keychain

The global preference is macOS Keychain for secrets, but this project already keeps `GEOCODIO_API_KEY` + `CONGRESS_GOV_API_KEY` in `.env.local` (gitignored), and `next dev` reads `.env.local` automatically whereas it does **not** read the Keychain (would require a `loadsecrets` step before every run). The Upstash token is also low-sensitivity — it grants read/write only to a cache of *public* government data (no PII, trivially repopulated), so a leak's blast radius is a wiped-and-refilled cache. Consistency + zero-friction won over marginally-better at-rest encryption; splitting the project's three keys across two homes would be its own small hazard. Standardizing the whole project on Keychain later remains a reasonable separate cleanup. (Session 7, Issue #7.)

## 2026-07-09 — Deployed #11 before the rest of MVP; excluded the retired `ANTHROPIC_API_KEY` from the Vercel env

With the caching layer (#7) done, the question was what to build next. Chose to **deploy first (#11)** over the other unblocked MVP pieces (#4 floor scrape, #8 recess, #10 footer) for two structural reasons: (1) it is the hard prerequisite for the Cron-dependent work — #16 (nightly pre-warm + full events index, the fix for the `SWEEP_LIMIT=60` coverage miss) and #4 (hourly floor scrape) literally cannot run or be verified without a deployed Vercel Cron environment; and (2) it was the only way to close the loose end the caching work left open — a warm-cache hit *through the app UI* (confirmed: 180 Upstash keys written, 188 ms repeat lookup). The env vars had to move to Vercel regardless, so nothing was wasted. When pushing env, **deliberately did not set `ANTHROPIC_API_KEY`**: the session-6 pivot retired the LLM, `anthropic` is not a dependency, and no code reads it — a dead key in Production is just a latent confusion. (It stays dormant in `.env.local` per the session-6 decision.) Cron config itself was deferred (no cron routes exist yet; wire when #4/#16 land). The first deploy also surprised us by going straight to Production — Vercel promotes a project's first-ever deploy, so a plain `vercel deploy` (intended as a preview) became the public URL; acceptable here since #11's DoD *is* a public URL, and push-to-deploy was wired immediately after so future changes preview first. (Session 8, Issue #11.)

## 2026-07-09 — Feedback channel is a free dedicated Gmail, not a paid domain alias or the maintainer's inbox

Spec §5 wants the "Send feedback" `mailto:` to reach a **dedicated account, not the maintainer's main inbox**. The user's instinct was that a dedicated address implies a paid `feedback@<domain>` alias (cost they wanted to avoid), which would have pushed toward either using their personal Gmail (violates §5) or dropping the mailto entirely (loses the non-developer civic audience, who won't file a GitHub issue). Resolved the false tradeoff: a **brand-new free Gmail** (`reptrackerfeedback@gmail.com`) satisfies §5 at zero cost and serves exactly that audience. Wired through a single `FEEDBACK_EMAIL` constant so it was a one-line swap once the account existed, and kept a placeholder off `main` (build-on-branch) so nothing fake ever reached Production. The GitHub "Report an issue" link stays as the second, developer-facing channel. Inbox is currently unmonitored; optionally forward it to a real inbox later. (Session 8, Issue #10.)

## 2026-07-09 — Free-tier operating limits constrain the #16 pre-warm cron: incremental/chunked, daily-only, not the spec's "hourly"

Before building the #16 nightly pre-warm cron + full upcoming-events index, checked what it actually costs now that the LLM is retired (session 6). Verified current free-tier limits against live docs on 2026-07-09. Retiring the LLM removed the only *variable dollar* cost; everything left is a **quota/plan limit, not per-call billing** — and three of them bind the design:

1. **Vercel Hobby cron is daily-only.** Sub-daily schedules (`0 * * * *`, `*/30…`) fail deployment (`Hobby accounts are limited to daily cron jobs`), and Vercel fires the daily job anywhere within its hour. This **contradicts spec.md's "Vercel Cron hourly"** (§Stack, §Caching strategy #4, §Known risks floor-scrape mitigation) — those were written pre-deploy assuming an hourly cron the chosen plan can't run. Spec corrected to say hourly needs Pro / an external scheduler; on Hobby the cadence is daily. The floor-schedule "hourly cron" mitigation (#4) is therefore unattainable as written on free tier — resolution (accept daily freshness, use an external HTTP scheduler, or upgrade) is deferred to when #4/#16 are built, not decided here.
2. **Vercel Hobby function max duration (~60s) is the real blocker — not money.** One invocation warming 535 members + delegates across several endpoints each *plus* paging all upcoming committee meetings is thousands of sequential Congress.gov calls; it will not finish in 60s. So the pre-warm **must be incremental/chunked** (converge the events index over several nights, or split by chamber/state across routes), never one monolithic pass. This is the load-bearing constraint on #16's shape.
3. **Congress.gov 5,000 req/hr** (free, per key) and **Upstash free 500K commands/month (~16.6K/day), 256MB** are both comfortable *given* chunking — but the warm write-count must stay lean (skip re-writing already-fresh keys) because every user request spends from the same monthly Redis pool. Geocodio is per-address, can't be pre-warmed, and the cron never calls it (zero spend).

Net: #16's cost model is fixed, not variable; the design must be incremental + daily, and the spec's hourly-cron language was drift corrected the same day. Full implementation-facing note on the issue. (Session 9, Issue #16.)

## 2026-07-09 — #16 events index: convergent cursor + always-swept head + single blob (Session 12)

Implementing #16's full upcoming-events index, the ~60s Vercel Hobby function ceiling (the load-bearing constraint from the 2026-07-09 free-tier decision) ruled out one monolithic pass: house+senate are ~2,500 committee-meeting details, and Congress.gov's LIST returns only event ids with no date/member filter, so knowing which are *upcoming* means fetching each DETAIL. Considered three shapes: (a) chunk by chamber/state across multiple daily routes, (b) an external scheduler holding a longer request, (c) a bounded self-limiting loop that converges over several nights. Chose **(c), refined**: each nightly run re-sweeps the *update-ordered LIST head* (offset 0) for promptness — newly (re)scheduled meetings cluster there and surface next run — **plus** advances a per-chamber cursor deeper into the list for guaranteed full coverage as the cursor laps the list over ~7–10 nights. This removes #16's `SWEEP_LIMIT=60` permanent miss (now at worst a temporary convergence lag on a meeting scheduled long ago and never re-touched — rare, low-stakes). Stored as a **single index blob** keyed `rt:v1:events-index` (not per-committee keys): one Redis GET per user request, one SET per cron, and the blob holds only upcoming/live meetings so it stays small (Upstash budget is shared with user traffic — keep writes lean). Rejected (a) as more routes + coordination for no coverage gain under the same aggregate budget, and (b) as leaving the free tier / adding an external dependency this session. Budgets are env-tunable; the ~9s prod run at defaults leaves headroom to raise them. (Session 12, Issue #16.)

## 2026-07-09 — #16 warm path reads the index only, no per-request live head-check (Session 12)

`decisions.ts` warm path serves purely from the cron-built index and does **not** do a per-request live sweep of the LIST head. Chose zero-network simplicity + predictable latency over immediate freshness of brand-new meetings. Consequence, accepted knowingly: a short-notice meeting announced between cron runs is invisible until the next daily run (≤~24h stale). This is the single real dent in "advance notice in time to act," concentrated on short-notice markups/hearings while Congress is in session. Kept the bounded live sweep only as the cold-cache fallback (index absent). The alternative — a bounded live head-check on the read path for the events feed (the spec's short-TTL events tier was designed for exactly this) — was deferred rather than dropped: whether it's worth the per-request latency + shared-rate cost depends on Congress.gov's own publish latency, which is unmeasured. The whole tradeoff is filed as #23 (measure upstream latency first, then a free external hourly scheduler + optional read-path head-check). Note the 5k/hr Congress.gov rate limit is *not* the constraint here (~500 calls/run ≈ 10% of budget); it's a scale ceiling shared with user traffic, not a cadence one. (Session 12, Issues #16, #23.)

## 2026-07-09 — #20 event link: derive the URL from Congress.gov's own API, and read `congress` per-meeting (Session 8-of-day)

Fixing #20 (upcoming-decision link landed on a committee landing page, not the event — a trust bug: the linked page showed nothing scheduled). Two sub-decisions. **(1) URL form.** The Issue guessed `https://www.congress.gov/committee-meeting/{congress}/{chamber}/{eventId}` but flagged it must be verified. Rather than trust the guess or try to scrape the (Cloudflare-protected, un-scriptable) public site, derived the canonical form from **Congress.gov's own API**: each meeting DETAIL carries a `videos[].url` of shape `https://www.congress.gov/event/{congress}th-Congress/{chamber}-event/{eventId}`. Confirmed consistent across many meetings and both chambers; the helper's output is byte-identical to what the API returns for the same event; the user then confirmed 4 real links render the right meeting. Chose this over the guessed form (wrong) and over linking to the committee's scheduled-meetings view (a fallback, not the specific event). We don't bypass the Cloudflare bot-check, so rendering the destination in an automated browser wasn't possible — the API returning its own URL is the verification. **(2) Where `congress` comes from.** Read it from the meeting detail (`RawMeetingDetail.congress`) rather than threading the caller's `congress` param into `buildUpcomingDecisions`. This keeps the URL correct for that meeting regardless of caller, needs no signature change, and — because the stored events-index blob round-trips the raw detail JSON — fixes the warm index path and the cold live-sweep path with one change. Falls back to the old committee-page URL only when eventId/congress are absent. (Session 8-of-day, Issue #20.)

## 2026-07-09 — #22 no-summary note: quote + attribute Congress.gov's wording, don't show it bare (Session 9-of-day)

Filling the silent `: null` branch for structured-only bills (`RepSection.tsx:245`). Congress.gov's own Summary tab shows the literal string "A summary is in progress." on a bill with no CRS summary — **verified live** against H.R.9425 (API confirms 0 summaries) by loading the real page past Cloudflare, not recalled. Considered showing that string verbatim as the note. Rejected: shown bare it reads as *our* app promising a forthcoming summary, which contradicts the session-6 no-LLM decision (we do not generate or infer summaries; this note only *labels* an honest absence). Chose to **quote and attribute** it — *No plain-English summary yet — Congress.gov notes "A summary is in progress."* — factual, non-editorial, and unambiguous that the status is the source's, not ours. Also exported the internal `Bills` component so a component test could render the real branch (lighter than scaffolding a full `RepProfile`); the added surface is worth the honest coverage. (Session 9-of-day, Issue #22.)

## 2026-07-09 — #24 utility gap resolved: our moat is routing/timing, not content; UI framing kept implicit (strategy session)

Resolved #24 ("why not just use Congress.gov directly"). Pressure-tested the spec's four claimed differentiators against the *actually rendered* page (`AddressLookup` → `buildProfilesAction` → `RepSection`): all four are delivered — address→your decisions, committee work as the spine, upcoming ordered by act-date, structural context bundled — but **none are named anywhere a first-time visitor sees them**.

The sharp reframing that resolves the issue: **every atom we render already exists on Congress.gov** (we show CRS text *verbatim* and link back to the source for every item). We do not — cannot — out-content the source. Our moat is entirely the **selection + ordering layer**: given your address, surface the specific ~25-person committee decisions your specific reps are about to make, soonest-first, with the number to call. That is a *routing/timing* claim, never a "we have better data" claim. One-sentence answer of record: **"Congress.gov has every fact; it can't tell you which of them is about to matter to *you*. We turn its archive into your personal, time-ordered call sheet."**

This also dissolves a latent tension: spec §footer disclaimer *points users to Congress.gov as the authoritative source*, so we can't position *against* it. The routing framing is compatible — we differentiate on **function** (address→reps→upcoming decisions→contact) while crediting it on **authority** (source of truth we link into at the right moment). They reinforce rather than conflict.

Two decisions (both the product owner's call):
1. **UI framing kept implicit** — no landing "what this is" block, no results-heading rewrite, no anti-Congress.gov copy. The design already embodies the bet; over-framing reads as salesy for a civic tool and risks stepping on the "not affiliated with Congress" disclaimer. The differentiator lives in *what we choose to render and how we order it*, recorded here as the editorial position rather than surfaced as marketing. Revisit if user feedback shows first-time visitors don't grasp the point.
2. **The one real "worse Congress.gov" risk is the empty upcoming-decisions state** — when a rep has nothing scheduled (recess or otherwise), `Decisions` renders one muted line (`RepSection.tsx:175`) and the secondary sponsored/cosponsored bill list (`Bills`, capped 7) becomes the de-facto headline: an undifferentiated bill dump the source presents better. The spec's §"Recess behavior" pivot already prescribes the fix (elevate contact block + recent activity, demote/action-frame bills) but the code doesn't implement it. Filed as **#27** (overlaps #8 recess detection) rather than built in this strategy session, to keep #24 a crisp resolution. Closing #24. (Strategy session, Issue #24 → #27.)

## 2026-07-09 — House floor via the structured weekly XML feed, not HTML scraping (#4)

Building the "Floor this week" section (#4), the obvious read of "scrape docs.house.gov/floor"
is to parse the rendered HTML. Rejected in favor of the House's **structured weekly XML feed**
(`docs.house.gov/billsthisweek/YYYYMMDD/YYYYMMDD.xml`): it's a stable, machine-readable schema
(`floorschedule` → `category[@type]` → `floor-item` → `legis-num` / `floor-text`) that won't
break on a CSS/layout change the way HTML scraping would — the #1 "Known risk" in the spec.

We still touch the HTML `/floor` index, but only to **discover the current week's XML path**
(regex for the `billsthisweek/DATE/DATE.xml` Download link). That sidesteps having to compute
"which Monday is this week's schedule filed under," which is genuinely ambiguous around
week/recess boundaries and when the House posts next week's schedule early. If no XML link is
present (deep recess, nothing posted) we return null and the House block hides — correct.

Senate stays HTML-scraped and best-effort (spec: "more brittle; often absent"): senate.gov's
floor page exposes only the next convene date/time in clean semantic HTML (`#proceedings_schedule`
→ `h3` + `.floor-schedule`). We surface that; Senate bill-level plans (Executive/Senate Calendar
PDFs) are out of scope.

Graceful hide is the **KV TTL expiry** (reusing the events-index `TTL.prewarm` ~40h tier), not a
bespoke staleness check: if the cron's scrape fails for longer than the TTL the entry drops, the
cold path's live scrape also fails, `getFloorSchedule` returns null, and the section renders
nothing — the spec's "hides if the scrape failed for >N hours," achieved structurally. A visible
"as of" freshness stamp keeps a merely-stale-but-present schedule honest. Closing #4.

## 2026-07-09 — Geocode low-confidence guard scoped to street-address-without-street-match (#12)

Geocodio lenient-matches garbage to real places: "999 fake nowhere street lanett" →
several AL towns (all `accuracy_type: place`) in different districts, which our flow turned
into a bogus "which district is yours?" screen. Considered filtering on `accuracy`/
`accuracy_type` generally — rejected: a valid **ZIP-only** or **city** lookup is *also*
place-level and is explicitly supported, so a blanket place-level filter would break
legitimate input.

Chosen discriminator: only when the input **looks like a specific street address** (a house
number followed by a street word) yet **nothing matched at street granularity** did the
geocoder fall back to a city centroid we can't trust → return `not_found` with a helpful
"check the number/street or use your ZIP" message. ZIP-only ("66044") and city/state
("Lawrence, KS") are deliberately *not* street-like, so their place-level matches are never
touched — verified live (garbage → not_found; real address → 1 district; ZIP → resolves).

Explicitly **out of scope**: the pure place-name-garbage case ("nowhere land", no house
number) still reaches disambiguation. That's accepted per the issue — Geocodio returns a
real town (accuracy 1.0), there's no reliable signal it's "wrong," and the screen shows the
matched address text, so it is never a *silent* wrong pick (which the spec forbids). Closing #12.

## 2026-07-09 — Congress.gov rate limit as a per-instance token bucket, not a distributed cap (#17)

Added a shared token bucket (`lib/rate-limit.ts`) in front of every Congress.gov `fetch`
via `congressFetch()`. Burst capacity (default 1000) lets a legitimate cron run or user
lookup pass without ever waiting; the sustained refill (default 60/min) keeps the worst-case
hour (BURST + 60*60 = 4600) under the 5,000/hr key quota. A cold-cache flood drains the
bucket then queues at the refill rate — the back-pressure the guardrail exists for.

Deliberately **per-process**: on Vercel each function instance keeps its own bucket, so this
is a best-effort self-pacing guardrail, not a global distributed cap. Rejected a
Redis-backed distributed limiter as over-engineering for a low-traffic civic MVP — it would
add a hot-path KV round-trip to every Congress.gov call for a quota that caching already
keeps us comfortably under. The real bulk consumer (the nightly cron, #16) runs on a single
instance where the in-memory bucket does its job. Env-tunable if traffic ever warrants
raising/lowering it. Closing #17.

## 2026-07-09 — District offices from a structured dataset, not member-site scraping (#13)

The spec's data-sources table says district-office phone/address is "scraped from house.gov /
senate.gov member pages," and Known Risks calls it the **worst** scrape: every member site is
laid out differently, and a wrong phone number defeats the product's purpose (making a useful
call). Rather than accept that fragility, #13 consumes a **structured, community-maintained
dataset** — `unitedstates/congress-legislators` `legislators-district-offices` (JSON mirror at
`unitedstates.github.io`), keyed by the same bioguide id we already resolve. Same open-data
project already trusted elsewhere in the civic-tech ecosystem; refreshed regularly; no
per-site HTML parsing. This removes the layout-fragility entirely; the remaining hygiene the
spec asks for — validating a string looks like a phone before rendering it callable — is kept
(`isPhoneLike`), and the Congress.gov DC office stays the guaranteed fallback (this only
*fills* the district slot). We pick the first office carrying a valid phone as the primary.

**No cache-namespace bump for the ContactBlock shape change.** Adding `districtOfficeAddress`
is a value-shape change, which `cache.ts` says a NS bump can invalidate — but a bump
(`rt:v1`→`v2`) invalidates the *entire* namespace, including the cron-built **events index**
and **floor schedule**, which only rebuild on the daily cron. That would blank the product's
core upcoming-decisions feed for up to a day on deploy. The change is additive and
backward-compatible on read (old entries lack the field → it reads falsy → the row simply
doesn't render), and stale contacts self-heal within the 5h reference TTL or on the next cron.
So the additive change ships without a bump. Closing #13.

## 2026-07-09 — Sub-daily freshness via an external GitHub Actions scheduler at hourly/:20 (#23)

Vercel Hobby crons are daily-only, so the nightly `vercel.json` cron (08:00 UTC) leaves
worst-case cache staleness at ~24h — which degrades the product precisely on short-notice,
high-stakes committee decisions (the #16 gap). Fix: an **external** GitHub Actions workflow
(`.github/workflows/prewarm.yml`) that curls the same `/api/cron/prewarm` route on a timer
with the shared `CRON_SECRET` (Bearer auth). Free, no Vercel plan change.

**Secret path:** the value lives in Vercel Production (route validates against it) with a
copy in the macOS Keychain; the GitHub Actions repo secret was set *from the Keychain* over a
pipe (never printed / never in argv) and confirmed by a live authorized 200 against prod — so
all three copies match.

**Cadence: hourly, at :20 past the hour.** Hourly collapses worst-case staleness from ~24h to
~1h; a full run is ~500 Congress.gov calls vs the 5,000/hr key ceiling (~10%), self-paced by
the #17 limiter. The **:20 offset** keeps the GitHub run from ever colliding with the 08:00
Vercel daily cron on the same instance — a collision drains the #17 per-instance token bucket
and can push the second run past the 60s function ceiling (observed as a 504 during testing
when two runs fired ~3 min apart). The Vercel daily cron is **kept** as a reliability baseline
(in case Actions is ever disabled). The workflow treats a transient 502/503/504 as a warning
(the incremental warm resumes next run) rather than failing, but hard-fails on auth/URL errors.

**Not yet done (remaining on #23):** measure Congress.gov's own publish latency to confirm
hourly isn't over-polling and to tune from data (the acceptance criterion), investigate a
fresher upstream source (docs.house.gov feeds), and the optional read-path head-check. Hourly
is a safe conservative default until then; #23 stays open for that measurement/tuning.
