> Generated 2026-07-08 by /end-session at commit 6a2208e.

# STATUS

## Where things stand

**Issue #5 — Plain-English summary pipeline (Haiku, grounded, cached) — is done**
(closed this session). Every bill in a rep's secondary-context list now carries a
neutral 1–2 sentence plain-English summary, and each rep section carries a neutral
TL;DR digest:

- **Grounded generation only** (`lib/summaries.ts`): the LLM rewrites official
  source — bill title + **CRS summary** (primary path) or bill title (fallback),
  never the model's own knowledge. A markup of a bill not yet in Congress.gov, or
  any failure, degrades to **structured-only** (official title + link).
- **Caching by `(bill_id, source_hash)`**: a revised CRS summary flips the hash
  and regenerates; everything else is reused. Per-rep TL;DR cached by
  `(bioguide, digest_hash)`, 6h TTL.
- **Version stamp + amendment warning**: "Based on bill as introduced, [date]",
  plus a "⚠ amended since" banner when Congress.gov has a newer text version than
  the summary's basis.
- **Output sanity guard**: when a title is too opaque to summarize, Haiku
  correctly *refuses* ("I cannot summarize from the title alone…"); `isUsableSummary`
  suppresses that meta-commentary → structured-only (caught in live browser QA).
- **Cost guardrail**: a **$5/day** hard spend cap enforced at the LLM-client layer
  (`lib/anthropic.ts`) — over-cap calls are refused and degrade to structured-only.

**Model re-verified live (spec mandate):** current Haiku is **`claude-haiku-4-5`**
($1/MTok in, $5/MTok out), confirmed against platform.claude.com on 2026-07-08 —
the spec's pin is still current. ~$0.001/bill-summary call, ~$0.02 per fully-cold
3-rep lookup, ~$0 on cache hits.

**Boundaries held** (own issues, not #5): the code-level hallucination
fact-validator is **#6** (an injectable `validate` hook defaults to pass-through);
the Upstash backend + per-minute rate limit + nightly pre-warm cron are **#7**
(#5 ships a `KVCache` interface with an in-memory default + the daily cap);
per-decision-item hearing/markup summaries are **#14** (deferred — the TL;DR
already digests upcoming decisions).

Verified end-to-end: 79 unit tests (5 new suites) incl. the full pipeline against
real captured API fixtures, plus a **live Haiku run** (HR 2715's real CRS summary →
output confirmed neutral and fully grounded) and a browser-driven run (KS address →
3 rep sections with bill summaries, "as introduced" stamps, an "amended since"
warning, and per-rep TL;DRs; refusal meta-text correctly suppressed).

> Note: the Anthropic account was out of credits mid-session (live calls 400'd,
> which the pipeline degraded past cleanly); credits were added and the live
> verification above then passed. `ANTHROPIC_API_KEY` is in `.env.local`
> (gitignored) for the dev server. API key org: `55f8ccd8-…-ccaae229444f`.

Next session: **Issue #7** (caching + cost guardrails + nightly cron) — makes the
daily cap Upstash-atomic, adds the rate limit, and warms the bill/decision/digest
caches so the common case is fast. **Issue #6** (hallucination validator) is the
other natural follow-on — it fills the `validate` hook #5 left in place.

## Derived facts (from CLAUDE.md commands)

| Fact | Command | Result |
|---|---|---|
| Test status | `npm test` | ✓ 10 files, 79 tests passing (Vitest 4.1.10) |
| Typecheck | `npx tsc --noEmit` | ✓ exit 0 (TypeScript 5.9.3) |
| Build | `npm run build` | ✓ Next.js 16.2.10; routes `/`, `/_not-found`, `/api/health` |
| Routes/pages | `find app -name 'route.ts' -o -name 'page.tsx'` | `app/api/health/route.ts`, `app/page.tsx` |
| Deploy | `vercel ls` | Vercel CLI unavailable; no deploy yet (Issue #11) |
| Git | `git log --oneline -1` | `6a2208e Close session 5: per-rep section layout (Issue #3)` (pre-commit) |
| Stack versions | `package.json` | next ^16.2.10 · react ^19.2.7 · tailwindcss ^4.3.2 · typescript ^5.9.3 · vitest ^4.1.10 · @anthropic-ai/sdk ^0.110.0 · node v24.15.0 |

Note: the summary pipeline lives in `lib/` (`anthropic`, `cache`, `summaries`) +
its wiring in `lib/rep-profile.ts` + `app/RepSection.tsx`; the `find` fact only
lists `route.ts`/`page.tsx`, so those files don't appear there by design.

## Active Milestone

**MVP** — https://github.com/lux-username/reptracker_2/milestone/1 (10 open Issues
after #5 closes: #4, #6–#14). Roadmap lives there; not restated here.

## Blockers / open questions

None blocking. New this session: **#14** (per-decision-item hearing summaries,
deferred from #5). The daily spend cap is in code; a **console-side monthly spend
limit** is recommended as an account-level backstop (owner action, not code).
Recommended entry point next session: **#7** (then #6).
