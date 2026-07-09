# Constituent Representative Tracker — MVP Specification

> **Handoff note.** This is a clean-room specification for a from-scratch build. It
> contains only the durable product, data, and guardrail decisions — no phasing,
> no build history, no session logs. A fresh implementation should treat this as
> the source of truth for *what* to build; *how* to sequence and track the work is
> the new session's own workflow to define.

## One-line goal

A web app that lets a US constituent enter their address and see — in time to act —
the specific upcoming decisions their federal representatives (a House member or
non-voting delegate, plus up to two senators) are about to make, along with the
structural context (committee role, contact info) needed to weigh in effectively.

## Why this framing

The goal is **not** to be a news app. It is to give a constituent enough advance
notice and structural context to make a *useful* phone call — one where their rep
actually has influence over the decision in question. Two consequences:

1. **Committee work is the spine, not floor votes.** Every member votes on the same
   floor bills — one rep among 435 or 100. But a rep on the committee marking up a
   bill is one of ~25 people deciding whether it ever reaches the floor. Leading with
   committees is about leading with the decisions where a call actually moves the needle.
2. **Upcoming matters more than recent.** The product's reason for being is the events
   that haven't happened yet — decisions a constituent can still influence. Past votes
   are explicitly not the point. The page is ordered by date of upcoming decision, not
   by data source.

The product is **deliberately position-neutral**. We do not generate "what to say"
talking points: we don't know whether the user supports or opposes any bill, and
presuming would misrepresent them. We show what the decision is, who decides, when,
and how to contact the deciders. The user supplies the opinion.

## MVP scope

### In scope

1. **Address → reps lookup, with disambiguation when needed.** User enters a US
   address (or ZIP+4). We resolve it via Geocodio to a congressional district +
   state, then to the user's House member(s) and Senators.
   - **Disambiguation flow:** when Geocodio returns multiple plausible matches that
     map to *different* districts (common for ZIP-only inputs and buildings split by
     a district line), surface a "Which address is yours?" choice screen listing each
     candidate address + its district. Copy must generalize to more than two candidates
     — a ZIP can straddle three or more districts. This is a correctness requirement:
     a wrong district = wrong reps = product failure.
   - **Non-standard representation is a first-class case.** Users in DC and the
     territories (PR, Guam, USVI, AS, NMI) have a non-voting delegate instead of a
     voting House member, and (except DC, which has no Senate representation at all)
     the territories have no senators. Handle inline in the normal UX — the user sees
     their delegate's section with all real committee activity (delegates vote in
     committee and chair subcommittees; ~95% of a voting member's influence on the
     committee work this product centers on), plus a small inline banner: "Delegate
     [Name] votes in committee but not on the House floor. [Territory] has no Senate
     representation." No dead-end "this isn't for you" redirect.

2. **Per-rep section layout.** Each rep gets a section, top-to-bottom:
   1. **Header block:** name, party, state/district, current committee assignments
      (with structural role: chair / ranking / member), and a single **contact block**
      with DC office phone, district office phone, office address, and web contact
      form link. Click-to-call on mobile. Rendered once at the top of the section, in
      natural document flow — **not pinned or sticky**. Scrolls away normally.
      - For DC / territory delegates, the delegate banner renders *inside* the header
        block, between the rep name and the committee list, so the "votes in committee
        but not on the floor" framing reads before committee context.
   2. **Upcoming decisions list**, ordered chronologically by decision date, not by
      data source. Each item shows:
      - **What:** plain-English description of the bill or hearing topic, with link
        to the official Congress.gov record.
      - **When:** date, time, location.
      - **The rep's role in it:** structural label only — *Chair*, *Ranking Member*,
        *Subcommittee Chair*, *Committee Member*, or for floor items *Floor vote (one
        of 435 / one of 100)*. No editorial leverage scoring. No contact info repeated
        here — that lives in the header block above.
      - Sources: upcoming committee meetings/markups (Congress.gov API), upcoming
        hearings (Congress.gov API), upcoming floor votes (scraped, best-effort).
   3. **Secondary context**, below the upcoming list:
      - **Sponsored & cosponsored bills:** filtered, sorted, capped at 7 — all rules
        factual / non-editorial. Each item carries a **sponsor / cosponsor badge**
        ("Primary sponsor" / "Cosponsor").
        - **Inclusion:** all bills the rep is a *primary sponsor* of from the last 60
          days, plus *cosponsored* bills with procedural activity in the last 30 days.
        - **"Procedural activity" defined narrowly:** any Congress.gov action whose
          type is a procedural milestone — referral to committee, committee report,
          markup, hearing, floor action, passage, conference. Cosponsor-count changes,
          text-edit revisions, and internal metadata flicker do *not* count.
        - **Sort order** (hierarchical, in priority):
          1. **Sponsor type** — primary sponsor before cosponsor.
          2. **Temporal urgency** — scheduled future activity in the next 14 days,
             then activity in the last 14 days, then activity in the last 15–30 days.
          3. **In the rep's committee** — bills in a committee the rep sits on first.
          4. **Timestamp** — soonest-upcoming or most-recent action first.
        - **Cap:** top 7 after sorting.
      - **TL;DR (neutral):** an LLM-generated 2–3 sentence factual digest of *what
        decisions this rep faces this week*, not what to think about them.

3. **"Floor this week" section** — a first-class section (not a tucked-away strip),
   showing the upcoming House and Senate floor schedule. Best-effort scraped, with a
   clearly visible freshness timestamp and an honest "schedules change frequently" note.

4. **No accounts. No data persistence about users.** Address is used server-side once
   for geocoding and immediately discarded.

5. **Feedback channel.** Two footer links — a `mailto:` ("Send feedback") and a GitHub
   issues link ("Report an issue"). Both zero-infra, zero-cost, serving different
   audiences (non-developer civic users vs. developers filing a structured bug).
   Framing rules apply: action-side labels, no position-laden phrasing, no PII
   collected server-side. Destination inbox should be a dedicated account (not the
   maintainer's main inbox), optionally fronted later by an email-routing alias once a
   project domain exists.
   - **Footer disclaimer.** The footer also carries a brief, plain-language disclaimer:
     this is an independent tool, **not affiliated with the U.S. Congress or any
     government body**, and schedules/contact data are sourced from public records and
     may be incomplete or out of date — with a pointer to Congress.gov as the
     authoritative source. Sets honest expectations for best-effort scraped data and
     avoids any implication of official endorsement.

### Out of scope

- User accounts, alerts, email/push notifications.
- LLM-generated talking points or "what to say" guidance — *deliberately omitted*.
- Editorial leverage labels (e.g. "very high influence"). Structural role only.
- Recent floor-vote history / voting records — *deliberately omitted*. The product is
  about upcoming decisions a constituent can still influence, not a rep's past votes.
- Voting record analysis, ideology scores, position trackers.
- State legislatures.
- Historical deep dives beyond ~30 days back.
- Summarizing amendment *content* (legalese/section-strike reasoning) — v1.1+.

## Data sources

| Need | Source | Quality |
| --- | --- | --- |
| Address → congressional district | **Geocodio** (free tier ≈ 2,500/day) | Solid; better district matching than Google Civic |
| Member metadata (name, party, state, district, bio, committees) | **Congress.gov API** `/member` | Clean, official |
| Member contact info (DC + district office phone, address, web form) | **Congress.gov API** `/member` (DC office) + scraped from house.gov / senate.gov member pages (district offices) | DC clean; district offices may need light scraping |
| Committee role per rep (chair / ranking / member) | **Congress.gov API** committee + member endpoints | Clean |
| Committee meetings (upcoming) | **Congress.gov API** `/committee-meeting` | Clean, structured — anchor of the product |
| Committee hearings (upcoming) | **Congress.gov API** `/hearing` | Clean |
| Bills sponsored / cosponsored | **Congress.gov API** `/member/{id}/sponsored-legislation`, `/cosponsored-legislation` | Clean |
| Plain-English bill descriptions | LLM summarization of bill title + CRS summary | Good |
| Upcoming floor schedule (House) | Scrape `docs.house.gov/floor` weekly schedule | Brittle, best-effort |
| Upcoming floor schedule (Senate) | Scrape `senate.gov` floor schedule | More brittle; often absent far in advance |

**API keys needed:** Geocodio, Congress.gov (free, register at api.congress.gov), Anthropic.

## Plain-English summary pipeline

Every upcoming item that references a bill needs a short, neutral, plain-English
summary, generated by **Haiku 4.5** (`claude-haiku-4-5-20251001`) from grounded source
material — never from the model's own knowledge of the bill.

**Primary path (preferred):**

1. Fetch the bill's official title (long + short) from Congress.gov
   `/bill/{congress}/{type}/{number}`.
2. Fetch the **CRS summary** from `/bill/{congress}/{type}/{number}/summaries`. CRS
   (Congressional Research Service) is the nonpartisan in-house research arm of
   Congress; the nonpartisanship of the source is what makes the LLM rewrite safe —
   the model compresses and de-jargons, it does not interpret.
3. LLM rewrites title + CRS summary into 1–2 plain-English sentences.

**Fallbacks:**

- **No CRS summary yet** (common for newly introduced bills): use bill title + sponsor
  info + first 1–2 sentences of bill text. Mark the item ("summary based on bill text").
- **Hearing with no bill attached:** source the "what" from hearing title +
  Congress.gov hearing description + witness list. LLM produces a 1–2 sentence summary
  of the topic and who is testifying.
- **Markup of a bill not yet in Congress.gov:** show bill identifier + committee name
  only, no summary, with a note that more info will be available shortly.

**Caching:** summaries cached by `(bill_id, source_hash)` where `source_hash` hashes
the inputs (title + CRS body or fallback inputs). If the CRS summary is revised, the
hash flips and we regenerate. Otherwise reused indefinitely.

**Prompt guardrails:** the system prompt requires neutral descriptive language ("the
bill would do X" / "the hearing will examine Y") and forbids evaluative or persuasive
framing. It also instructs the model not to introduce specific numbers, dates, bill
identifiers, member names, or committee names absent from the source material.

### Output validation (hallucination guard)

Prompt instructions are necessary but not sufficient. After every LLM call the output
is validated against the source at the code level. **Any unsourced fact-shaped entity
blocks publication** of the summary, and the renderer falls back to structured-only
display for that item.

Validation rules:

1. **Bill identifiers** in output (regex for `H\.?R\.? \d+`, `S\.? \d+`,
   `H\.?J\.?Res\.? \d+`, etc.) must appear, normalized, in the source's bill list.
2. **Member names** must be the rep being summarized or names present in the input. A
   canonical list of all current members + delegates detects member-shaped names; any
   not in the input is treated as unsourced.
3. **Committee names** are matched against a canonical committee list AND must appear
   (or fuzzy-match) in the input.
4. **Specific numbers** — dollar amounts, percentages, integers ≥10 — must appear
   verbatim in the source. (Small integers like "2–3 sentences" don't count.)
5. **Specific dates** must appear in the source.

**Failure mode:** if any rule fires, retry the LLM call **once** with the violation
noted in the re-prompt ("the term X did not appear in source — rewrite without it").
If the retry also fails, publish the structured-only fallback and log the failure.
Defense-in-depth alongside the prompt guardrails.

### Amendment / staleness labeling

Bills change after the CRS summary is written. Every rendered summary carries a
"**Based on bill as introduced, [date]**" stamp. At render time, check whether
Congress.gov has a newer bill text version (engrossed, reported, amended) than the
cached summary is based on. If so, append:

> ⚠ This bill has been amended since this summary was generated. See Congress.gov for
> current text.

The MVP does **not** summarize the amendments themselves — higher hallucination risk;
explicitly v1.1+ scope.

## Tech stack

- **Framework:** Next.js (App Router) on Vercel. Server components fetch data
  server-side so API keys never reach the browser. One page, one route.
- **LLM:** Anthropic SDK with a small, cheap, fast model for per-rep digests and
  plain-English bill descriptions (a Haiku-class model is plenty for 2–3 sentence
  summaries). `claude-haiku-4-5-20251001` was the default at the time of writing —
  **re-verify the current model ID and per-token pricing against Anthropic's docs at
  build time** rather than trusting the pinned value below. Use prompt caching on the
  stable system prompt. Prompts are written to be neutral and descriptive, not
  persuasive — a guardrail, not a styling choice.
- **Cache / KV:** Upstash Redis (free tier, Vercel-native). Used for geocoding results,
  Congress.gov responses, and LLM digests (see below).
- **Scraping:** plain `fetch` + a small HTML parser (e.g. `cheerio`) inside a route
  handler, run on a schedule via Vercel Cron, results stashed in Upstash. Avoids
  inline scraping latency per request. **Cadence is plan-limited:** the free (Hobby)
  tier only permits *daily* crons and a ~60s function duration, so sub-daily refresh
  and any long bulk sweep need chunking or an external scheduler / Pro — see the
  2026-07-09 free-tier decision in `decisions.md` and Issue #16.
- **Frontend:** plain Tailwind. No design system overhead for MVP.

## Caching strategy

LLM calls cost money and rep activity does not change minute-to-minute, so caching is
load-bearing:

1. **Geocoding cache** — normalize address (lowercase, trim, strip punctuation), 24h TTL.
2. **Two-tier Congress.gov cache** — the cadence must match the value prop ("advance
   notice *in time to act*"), so events and reference text are cached differently:
   - **Upcoming-events feed** (`/committee-meeting`, `/hearing`) — the schedule itself
     can change on short notice; a markup may be posted <24h out. Short TTL (~30–60 min)
     so a newly-announced meeting surfaces the same day, not on tomorrow's cron.
   - **Reference / summary-source data** (member metadata, committee roles, bill titles,
     CRS summaries, sponsored/cosponsored lists) — slow-moving; 4–6h TTL is fine.
3. **Per-rep digest cache** — key by `(bioguide_id, hash(meaningful_fields))`, 4–6h
   TTL. Reuse the LLM output if the hash is unchanged.
4. **Floor-schedule scrape cache** — refreshed by Vercel Cron (daily on Hobby; hourly
   needs Pro or an external scheduler — see the free-tier decision), served from KV.

Note the distinction: the *event's existence and timing* refresh fast; the *LLM summary
text* attached to a bill/hearing stays cached indefinitely (invalidated only on
source-hash change). A meeting can move to a new time — updating the cheap structured
feed — without regenerating the expensive summary.

### Per-rep digest content hash

The single biggest driver of LLM cost is how often per-rep digests regenerate. Define
the hash narrowly so digests only regenerate when something *the user would notice*
has changed.

**Included in the hash (changes trigger regen):**
- Upcoming committee meetings, hearings, and floor votes in the next 14 days — their
  existence, date, time, and bill/topic reference.
- Committee role changes (e.g. promoted to subcommittee chair).
- New bills sponsored or cosponsored within the last 30 days (existence, not metadata).

**Excluded from the hash (do NOT trigger regen):**
- Cosponsor counts on existing bills incrementing.
- Bio text, committee description text, other narrative metadata edits.
- Sort orders, internal IDs, opaque version numbers.
- Anything scheduled more than 14 days out — picked up when it enters the 14-day window.

Result: the digest regenerates roughly when there's *real* news for the rep, not on
every upstream metadata flicker.

## Cost picture (LLM)

The architecture is designed so **LLM cost scales with how much new content Congress
produces, not with user traffic** — every LLM output is cached per-artifact (per-bill,
per-meeting, per-hearing, per-rep), not per-user. Once the cache is warm, a million
Californians share the same cached summaries for their two senators; marginal LLM cost
per additional user approaches zero.

**Rough upstream volume per week** (the real cost ceiling):

| Content type | Volume | Notes |
| --- | --- | --- |
| Bill summaries | ~150–200 newly-active bills | Cached until CRS revises |
| Committee meeting agendas | ~50 meetings | Cached until meeting date passes |
| Hearings | ~100 hearings | Same |
| Per-rep digests | ~535 reps, regen only on meaningful hash change | ~1,000–1,500/week steady state |

At the Haiku-class pricing current when this was written (~$1/MTok in, $5/MTok out —
*verify before relying on it*), ~2k input / ~100 output tokens per call (~$0.003/call)
with prompt caching: **worst-case ~$15–25/month, traffic-independent.**

**Cost guardrails (build in, don't bolt on):**

1. **Daily spend cap.** A hard ceiling (e.g. $5/day) enforced at the LLM-client layer.
   Crossing it → client refuses new calls, renderer falls back to structured-only
   (official titles + raw CRS text truncated to ~250 chars). The site keeps working.
2. **Pre-warm via cron, not request.** A daily cron summarizes all new bills, agendas,
   and hearings overnight *and* regenerates the per-rep digest for every member whose
   content hash changed — so all 535 reps are warm before the first visitor of the day,
   not just previously-viewed ones. Users always hit warm cache.
3. **Per-minute rate limit on the LLM client.** Prevents a cache stampede or a scripted
   cache-busting attack from burning the budget.
4. **Aggressive cache TTLs + tight content hash.** Per-bill and per-hearing summaries
   effectively indefinite (invalidate on source-hash change); per-rep digests 4–6h TTL
   plus the narrow content hash above.

## Recess behavior

Congress is in scheduled recess for substantial portions of the year. During recess
committees do not formally meet, so "upcoming decisions" goes near-empty — but this is
**not** a reason to take the product offline: constituents' ability to reach reps
actually *increases* during recess (district offices active, town halls at home).

The page pivots emphasis during recess:

- **Headline shifts** from "What's coming up" to "Congress is in recess until [date].
  [Rep] is home in their district." with the contact block elevated.
- **Recent committee activity** becomes the primary content — what the rep was working
  on before recess.
- **Sponsored / cosponsored bills** with pending status are shown — what to call about now.
- **Floor schedule section** shows "Congress not in session" rather than a stale list.

Detection: a server-side helper checks whether the House and Senate are in session
today using the official congressional calendar (Congress.gov publishes session dates).

## Accessibility

Civic tools have a particular obligation to be usable by everyone. Bar for v1:

- **Semantic HTML** — real `<button>`, `<a>`, hierarchical headings. No div-soup.
- **Keyboard navigation** end-to-end — form, disambiguation, every link and
  click-to-call reachable and operable via keyboard only.
- **WCAG AA color contrast** for all text.
- **Form labels** properly associated (`<label for=>` or wrapping).
- **Skip-to-content link** at the top for screen reader users.
- **Alt text on all images** — rep headshots get `alt="[Name], [Party] [State]"`.
- **ARIA only where semantic HTML can't carry the meaning** — no over-engineering.
- **Tested with:** Lighthouse, axe DevTools, manual keyboard + VoiceOver pass.

Checked as part of the DoD, not deferred to post-launch polish.

## Privacy

- Addresses are sent to the server for one geocoding call and then dropped — never
  stored, never logged.
- No user accounts → no PII to leak.
- No analytics beyond Vercel's built-in request counts in v1.

## Editorial stance (load-bearing)

The product is position-neutral. Two things we deliberately do *not* ship in v1:

1. **No "what to say" talking points.** We don't know the user's position.
2. **No editorial "leverage" labels.** No "high influence" / "swing vote." We show
   structural role (chair / ranking / committee member / floor only). The user infers
   leverage from structure.

LLM-generated bill descriptions and per-rep digests are explicitly prompted to be
neutral and descriptive. This is checked in code review.

## Known risks

- **Floor-schedule scrape will break.** Mitigation: scheduled cron refresh (cadence
  plan-limited — daily on Hobby free tier, hourly only on Pro / via an external
  scheduler; see the 2026-07-09 free-tier decision), graceful degradation (the section
  hides if the scrape failed for >N hours), admin-visible health check.
- **District-office contact scrape will break — and it's contact data.** District-office
  phone/address is scraped from house.gov / senate.gov member pages, which change layout
  without notice. This is worse than a stale schedule: a wrong phone number defeats the
  product's entire purpose (making a useful call). Mitigation: always show the
  Congress.gov-sourced DC office phone as a guaranteed fallback so a rep is never left
  with zero callable number; treat scraped district-office data as best-effort enrichment
  on top of it, and validate scraped numbers look like phone numbers before rendering.
- **Geocodio free tier limits.** 2,500/day is plenty early; server-side rate-limit
  guard so a runaway client can't burn the quota.
- **LLM cost creep.** Addressed structurally: per-artifact caching + the four
  guardrails above.
- **Congress.gov API rate limits.** 5,000 req/hour per key — sufficient with caching.
- **Bill jargon.** Many agendas are markup-language Congress-speak; LLM cleanup is
  essential.
- **LLM hallucination.** Addressed by code-level output validation (retry-once →
  structured-only fallback → log).
- **Amendment drift.** Version-date labeling + "amended since" warning at render time.
- **District-boundary ambiguity.** Surfaced via the disambiguation flow, not a silent pick.
- **Mid-term vacancies.** The data layer must handle "vacant seat — special election
  scheduled for [date]" without 500-ing.

## Open design choices (non-blocking)

- **Address input default:** full address vs. ZIP+4 vs. "use my location." Full address
  gives the cleanest disambiguation; ZIP-only is friendlier but triggers disambiguation
  more often. Lean toward full address with ZIP as a soft, warned fallback.
- **Item density:** upcoming items expandable for detail, or fully inline? Expandable
  likely keeps the chronological list scannable.
- **Map?** A small district map would be nice but adds dependencies. Defer.

## Definition of done for MVP

- A visitor enters an address and sees a page with the right number of rep sections for
  their jurisdiction (3 for most addresses, 1 for territory residents, 1 for DC). Each
  section opens with a header block — name, party, committee roles, and a single contact
  block with one-tap-callable DC and district office phones — followed by a
  chronologically ordered list of upcoming committee meetings, hearings, and floor
  votes, each annotated with the rep's structural role.
  - **Warm cache (the common case): full page in ~3 seconds.** The nightly precompute
    cron warms **all 535 members + delegates** — not just previously-viewed reps — so
    the overwhelming majority of visits hit warm cache regardless of who's first to look
    up a given rep. Warm cache is the target the 3s number applies to.
  - **Cold cache (rare — new rep data mid-day, cron miss): degrade, don't stall.** Render
    the structural shell (header, contact block, known upcoming events) immediately from
    the fast structured feed, show skeletons for any slot awaiting a live LLM summary,
    and progressively fill as summaries resolve. The page is usable and callable before
    every summary lands; a missing summary falls back to structured-only, never a spinner
    that blocks the whole page.
- Ambiguous addresses trigger the disambiguation flow rather than a silent guess.
- DC and territory residents see a normal rep section for their delegate, plus a clear
  inline banner explaining what their delegate can and cannot do.
- During recess the page pivots: "Congress in recess until [date]" + elevated contact
  block + recent-activity-led content.
- The filtered/capped sponsored & cosponsored bills list is visible as secondary context.
- A 2–3 sentence neutral LLM TL;DR per rep is rendered, factual not persuasive. All LLM
  output has passed the hallucination validator or fallen back to structured display.
- Bill summaries are stamped with their version date; an "amended since" warning shows
  when the source bill has a newer text version.
- The House floor schedule is scraped and integrated into the chronological list
  (Senate best-effort, may be empty). Freshness timestamp visible.
- The accessibility bar is met: keyboard nav end-to-end, WCAG AA contrast, semantic
  HTML, skip-to-content, alt text. Verified with Lighthouse + axe + manual VoiceOver.
- No user data is persisted; no talking-point or position-laden content is rendered.
- Deployed to a public URL.
