> Generated 2026-07-08 by /end-session at commit cb3684d.

# STATUS

## Where things stand

**Issue #5 — plain-English bill descriptions — is done**, but the approach
**pivoted mid-session away from an LLM** (see decisions.md). The product renders
the **nonpartisan Congressional Research Service (CRS) summary verbatim** rather
than generating text with a model:

- **No LLM in the MVP.** We deliberately do not put a language model between the
  citizen and authoritative government text. Deleted `lib/anthropic.ts` +
  `lib/cache.ts`; removed the `@anthropic-ai/sdk` dependency.
- **Bills** (`lib/summaries.ts` → `extractBillSummary`, pure/deterministic): show
  the CRS summary **verbatim** (HTML-stripped, full text — nothing truncated),
  attributed to CRS, with a "bill as introduced, [date]" stamp and a "⚠ amended
  since" warning when Congress.gov has a newer text version.
- **No CRS summary ⇒ structured-only** (official title + Congress.gov link). We
  never infer what a bill does from its title or from raw legislative text —
  that's interpretation a small model can't do safely, and the honest end state
  is to link to the source. Coverage grows as CRS publishes summaries.
- **Per-rep TL;DR was cut** — it restated the structured lists, and the useful
  version needed the leverage synthesis the spec forbids.

Why the pivot: the two hard questions — "is the TL;DR worth it?" and "can a small
model accurately say what a bill does?" — both pointed the same way. CRS is
*already* plain-English expert prose, so the LLM was marginal polish at real
accuracy cost in a tool where wrong = product failure.

Verified end-to-end: 61 unit tests (deterministic CRS extraction against real
captured fixtures — full text preserved, e.g. "90 days") + tsc + build, plus a
browser run (KS address → only the two CRS-backed bills show a verbatim,
CRS-attributed summary; no TL;DR, no AI framing, no title/refusal text; no LLM
calls in the request path).

> `ANTHROPIC_API_KEY` remains in `.env.local` (dormant, gitignored) in case an
> LLM path is ever revived. API key org id: `55f8ccd8-…-ccaae229444f`.

Issues closed as obviated by the pivot: **#6** (nothing to validate), **#14** +
**#15** (no LLM summaries). **#7** rescoped: its LLM cost-guardrail portion is
gone; API-response caching (Upstash) + the nightly cron remain.

Next session: **#7** (cache Congress.gov + Geocodio responses; nightly cron to
warm them + the floor schedule) — the per-lookup fan-out is now all Congress.gov
calls, so caching is the main perf/rate-limit lever. **#4** ("Floor this week")
and **#8** (recess pivot) are the other MVP pieces.

## Derived facts (from CLAUDE.md commands)

| Fact | Command | Result |
|---|---|---|
| Test status | `npm test` | ✓ 9 files, 61 tests passing (Vitest 4.1.10) |
| Typecheck | `npx tsc --noEmit` | ✓ exit 0 (TypeScript 5.9.3) |
| Build | `npm run build` | ✓ Next.js 16.2.10; routes `/`, `/_not-found`, `/api/health` |
| Routes/pages | `find app -name 'route.ts' -o -name 'page.tsx'` | `app/api/health/route.ts`, `app/page.tsx` |
| Deploy | `vercel ls` | Vercel CLI unavailable; no deploy yet (Issue #11) |
| Git | `git log --oneline -1` | `558846c Fix (#5): never summarize from a bill title alone` (pre-commit) |
| Stack versions | `package.json` | next ^16.2.10 · react ^19.2.7 · tailwindcss ^4.3.2 · typescript ^5.9.3 · vitest ^4.1.10 · node v24.15.0 (no LLM SDK) |

Note: the summary logic lives in `lib/summaries.ts` + its wiring in
`lib/rep-profile.ts` + `app/RepSection.tsx`; the `find` fact only lists
`route.ts`/`page.tsx`, so those files don't appear there by design.

## Active Milestone

**MVP** — https://github.com/lux-username/reptracker_2/milestone/1 (8 open Issues:
#4, #7–#13). Roadmap lives there; not restated here.

## Blockers / open questions

None blocking. The LLM pivot narrowed the roadmap (#6/#14/#15 closed, #7
rescoped). Recommended entry point next session: **#7** (API-response caching +
cron), then **#4** / **#8**.
