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
        - **Bill description:** each bill with a CRS summary renders that summary
          **verbatim** (HTML-stripped, attributed to the Congressional Research
          Service), stamped "bill as introduced, [date]" with an "amended since"
          warning when a newer text version exists. Bills without a CRS summary show
          structured-only (official title + Congress.gov link). No LLM — see the
          plain-English pipeline section below.

  > **Retired:** an earlier design added an LLM-generated per-rep "TL;DR" digest here.
  > It was cut in session 6 — the neutral version merely restated the structured lists
  > above it, and the version that *would* be nonobvious is the editorial/leverage
  > synthesis this product forbids. See the 2026-07-08 "Retired the LLM entirely"
  > decision in `decisions.md`.

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
| Plain-English bill descriptions | **CRS summary** (`/bill/{congress}/{type}/{number}/summaries`), rendered verbatim — no LLM | Good; already plain-English, nonpartisan, expert-written |
| Upcoming floor schedule (House) | Scrape `docs.house.gov/floor` weekly schedule | Brittle, best-effort |
| Upcoming floor schedule (Senate) | Scrape `senate.gov` floor schedule | More brittle; often absent far in advance |

**API keys needed:** Geocodio, Congress.gov (free, register at api.congress.gov). *(No
Anthropic key — the LLM was retired in session 6; see the 2026-07-08 decision in
`decisions.md`.)*

## Plain-English bill descriptions (no LLM)

> **Design of record (session 6).** An earlier version of this spec put a Haiku-class
> LLM between the citizen and the source text, rewriting titles + CRS summaries into
> 1–2 sentences behind a hallucination validator. That whole apparatus was **retired
> in session 6.** Two findings dissolved the case for it: (1) CRS summaries are
> *already* plain-English, nonpartisan, expert-written prose, so the model was only
> lightly compressing already-plain text — marginal polish at a real accuracy cost in
> a tool where "wrong = product failure"; and (2) the one transform that *would* add
> value (interpreting raw bill text) is legal interpretation a small model can't do
> safely. Full rationale: the 2026-07-08 "Retired the LLM entirely" entry in
> `decisions.md`. This section documents the shipped, deterministic design.

Every upcoming item that references a bill shows its description from **authoritative
government text, rendered verbatim** — we do not put a language model between the
citizen and the source.

**Primary path:**

1. Fetch the **CRS summary** from Congress.gov
   `/bill/{congress}/{type}/{number}/summaries`. CRS (the Congressional Research
   Service) is the nonpartisan in-house research arm of Congress; its summaries are
   plain-English descriptions written by human experts.
2. Render that summary **verbatim** — HTML-stripped, no truncation (so no meaning is
   lost), attributed to the Congressional Research Service.

**No CRS summary yet** (common for newly introduced bills) ⇒ **structured-only**: the
official title + a Congress.gov link, and nothing more. We never infer what a bill does
from its title or from raw legislative text. A markup of a bill not yet in Congress.gov
likewise shows identifier + committee name only.

**Caching:** the CRS summary is cached as part of the Congress.gov reference tier (see
Caching strategy). CRS summaries are slow-moving; when CRS revises one, the refreshed
fetch picks it up on the reference-tier TTL.

### Amendment / staleness labeling

Bills change after the CRS summary is written. Every rendered summary carries a
"**bill as introduced, [date]**" stamp (the date of the "Introduced in …" text
version). At render time, compare that against the latest Congress.gov text version
(engrossed, reported, amended); if a newer one exists, append:

> ⚠ This bill has been amended since this summary was written. See Congress.gov for
> current text.

Both the stamp and the warning are **structural** (a date comparison over text-version
metadata), not generated text. The MVP does **not** describe the amendments themselves
— that requires interpreting raw legislative text, which is explicitly out of scope
(v1.1+).

## Tech stack

- **Framework:** Next.js (App Router) on Vercel. Server components fetch data
  server-side so API keys never reach the browser. One page, one route.
- **No LLM.** Bill descriptions render CRS summaries verbatim; there is no model in the
  request or build path (retired session 6 — see `decisions.md`). This removed the only
  variable per-call cost and the entire Anthropic dependency.
- **Cache / KV:** Upstash Redis (free tier, Vercel-native). Used for geocoding results
  and Congress.gov API responses (see Caching strategy).
- **Scraping:** plain `fetch` + a small HTML parser (e.g. `cheerio`) inside a route
  handler, run on a schedule via Vercel Cron, results stashed in Upstash. Avoids
  inline scraping latency per request. **Cadence is plan-limited:** the free (Hobby)
  tier only permits *daily* crons and a ~60s function duration, so sub-daily refresh
  and any long bulk sweep need chunking or an external scheduler / Pro — see the
  2026-07-09 free-tier decision in `decisions.md` and Issue #16.
- **Frontend:** plain Tailwind. No design system overhead for MVP.

## Caching strategy

Rep activity does not change minute-to-minute and the Congress.gov / Geocodio free
tiers have quotas, so caching is load-bearing. Implemented as a single
`cached(key, ttl, loader)` primitive over Upstash with three TTL tiers; graceful
degradation is a hard requirement (no creds ⇒ pass-through, a Redis error or a loader
throw ⇒ live fetch, never a cached error). See the 2026-07-09 caching decision in
`decisions.md`.

1. **Geocoding cache** — normalize address (lowercase, trim, strip punctuation), 24h TTL.
2. **Two-tier Congress.gov cache** — the cadence must match the value prop ("advance
   notice *in time to act*"), so events and reference text are cached differently:
   - **Upcoming-events feed** (`/committee-meeting`, `/hearing`) — the schedule itself
     can change on short notice; a markup may be posted <24h out. Short TTL (~45 min)
     so a newly-announced meeting surfaces the same day, not on tomorrow's cron.
   - **Reference data** (member metadata, committee roles, bill titles, CRS summaries,
     sponsored/cosponsored lists) — slow-moving; ~5h TTL is fine. The verbatim CRS
     summary text rides this tier.
3. **Floor-schedule scrape cache** — refreshed by Vercel Cron (daily on Hobby; hourly
   needs Pro or an external scheduler — see the free-tier decision), served from KV.

Note the distinction: the *event's existence and timing* refresh fast (short TTL); the
slow-moving *reference text* (member metadata, CRS summaries) refreshes on the longer
tier. A meeting can move to a new time — updating the cheap events feed — without
re-fetching the reference data around it.

## Cost picture

**There is no variable per-call cost.** Retiring the LLM (session 6) removed the only
per-use dollar spend; everything left is a **quota / plan limit, not per-call billing**:

- **Congress.gov** — 5,000 req/hr per key (free). Comfortable given caching.
- **Geocodio** — free tier ≈ 2,500/day; per-address, can't be pre-warmed.
- **Upstash** — free tier 500K commands/month, 256MB. Comfortable if warm writes stay
  lean (skip re-writing already-fresh keys), since every user request spends from the
  same monthly pool.
- **Vercel Hobby** — daily-only cron and a ~60s function duration. These *shape* the
  #16 pre-warm cron (it must be incremental/chunked, daily) rather than costing money.
  See the 2026-07-09 free-tier decision in `decisions.md`.

Because every fetched artifact is cached per-artifact (per-bill, per-meeting,
per-hearing), not per-user, a million Californians share the same cached data for their
two senators once the cache is warm; marginal cost per additional user approaches zero.

## Recess behavior

Congress is in scheduled recess for substantial portions of the year. During recess
committees do not formally meet, so "upcoming decisions" goes near-empty — but this is
**not** a reason to take the product offline: constituents' ability to reach reps
actually *increases* during recess (district offices active, town halls at home).

The page pivots emphasis during recess. Copy is **minimal and factual** — the
pivot is carried by layout and prominence, not persuasive wording (owner steer,
decisions.md 2026-07-09). We never claim a member's physical location ("is home
in their district" is unverifiable and wrong for senators, who represent a state).

Detection is **per chamber** — the House and Senate recess on different schedules,
so a constituent's Representative can be out while their Senators are in session
(and vice versa). The pivot is applied to each rep's card by their own chamber:

- **A factual status line leads the card** — "The Senate is in recess until [date]."
  when a return date is known, degrading to "The House is not currently in session."
  when it isn't. The **contact block** (already above the decisions in document flow)
  becomes the natural point of action.
- **Upcoming-decisions** goes empty; its empty state ties itself to the recess
  ("No committee meetings while the House is in recess.") rather than reading as a
  data gap — distinct from the *in-session-but-nothing-scheduled* copy.
- **Sponsored / cosponsored bills** keep their neutral heading, repositioned so the
  bill list is never the card's visual center of gravity. The intended *primary*
  recess content — the bills waiting in the rep's committees (#21) — becomes the
  lead once that feature ships; committee assignments are stable across a recess.
- **Floor schedule section** shows "not currently in session" per chamber (the
  posted floor XML is stale during recess) rather than a stale list.

Detection sources (authoritative first, corroborate, never let a bare data-gap
heuristic decide):
- **Senate** — the official annual tentative-schedule XML
  (`senate.gov/legislative/<year>_schedule.xml`) gives ISO date ranges for the
  year's "State Work Period" recesses; the Senate floor page's next-convene date
  refines the precise return date. Authoritative + precise.
- **House** — no machine-readable calendar exists (published only as a PDF), so we
  use the docs.house.gov weekly floor XML already scraped for the floor section: a
  `weekOf` earlier than the current week means the House is not in session. No
  reliable return date without the PDF, so the House "until [date]" is omitted.
- Failure degrades toward the normal UI, never a false recess.

Implemented in `lib/session-status.ts` (Issues #8, #27).

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

Neutrality is now structural rather than prompted: bill descriptions are the
nonpartisan CRS summary rendered verbatim (not model-generated), and rep roles are
structural labels (chair / ranking / committee member / floor only). There is no
generated prose to police for tone — the guardrail is *what we choose to render*, not
how a model is instructed. Checked in code review.

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
- **Congress.gov API rate limits.** 5,000 req/hour per key — sufficient with caching.
- **Sparse descriptions.** A bill with no CRS summary yet renders structured-only
  (title + link). Accepted trade-off: fewer bills carry a description until CRS lands,
  in exchange for never inferring from a title or raw text. (No LLM to lean on — see
  the session-6 retirement.)
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
    the structural shell (header, contact block, known upcoming events) from the
    structured feed; a bill whose CRS summary hasn't been fetched yet falls back to
    structured-only (title + Congress.gov link), never a spinner that blocks the whole
    page. The page is usable and callable regardless of which descriptions are present.
- Ambiguous addresses trigger the disambiguation flow rather than a silent guess.
- DC and territory residents see a normal rep section for their delegate, plus a clear
  inline banner explaining what their delegate can and cannot do.
- During recess each rep's card pivots per its own chamber: a factual "[chamber] is
  in recess until [date]" (or "not currently in session") status line + the contact
  block as the point of action + bills kept secondary (committee-waiting bills (#21)
  become the lead once built). See §"Recess behavior".
- The filtered/capped sponsored & cosponsored bills list is visible as secondary context.
- Each bill with a CRS summary renders that summary verbatim, attributed to the
  Congressional Research Service; bills without one show structured-only (title + link).
  No generated prose. (The per-rep LLM TL;DR was cut in session 6.)
- Bill summaries are stamped with their version date; an "amended since" warning shows
  when the source bill has a newer text version.
- The House floor schedule is scraped and integrated into the chronological list
  (Senate best-effort, may be empty). Freshness timestamp visible.
- The accessibility bar is met: keyboard nav end-to-end, WCAG AA contrast, semantic
  HTML, skip-to-content, alt text. Verified with Lighthouse + axe + manual VoiceOver.
- No user data is persisted; no talking-point or position-laden content is rendered.
- Deployed to a public URL.
