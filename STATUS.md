> Generated 2026-07-08 by /end-session at commit 8fd47a2.

# STATUS

## Where things stand

**Issue #2 — Address → reps lookup with disambiguation — is done** (closed by this
session's commit). The app now resolves a free-form US address (or ZIP) to the
user's federal representatives:

- **Geocodio** handles geocoding + district disambiguation only. **Congress.gov is
  the authoritative rep resolver** by `(congress, state, district)` — Geocodio's
  embedded legislators are used only as a cheap disambiguation-screen preview, never
  as the resolved answer (see decisions.md).
- **Disambiguation** fires whenever an address maps to >1 distinct district — both
  across Geocodio results (ZIP → many buildings) and within one result (a ZIP
  centroid straddling a line). Copy generalizes to 3+. Never a silent pick.
- **Non-standard representation is first-class:** DC + territories resolve to their
  delegate / resident commissioner with an inline banner ("votes in committee but not
  on the House floor … no Senate representation") and zero senators. Geocodio's
  at-large code `98` is normalized to Congress.gov's `0`; voting at-large states (WY)
  are correctly kept distinct (district 0, *with* senators).

Layer split: `lib/` holds pure, fixture-tested logic (`geocodio`, `congress`,
`jurisdictions`, `resolve-reps`, `types`) separated from I/O; `app/` holds the form,
disambiguation screen, and identity-level results wired through server actions so API
keys stay server-side. Rich per-rep sections (committees, contact, upcoming decisions)
are **Issue #3**, deliberately not built here.

Verified end-to-end this session: 26 unit tests against **real captured API fixtures**,
plus live-API and browser-driven runs (KS full address → resolved; ZIP 90210 →
disambiguation → CA-32 reps; DC → delegate + banner; garbage → not_found).

Next session: **Issue #3 — Per-rep section layout**, which consumes the resolved
`Rep` / `ResolvedReps` identities produced here. Standing spec reminder: re-verify the
Haiku model ID + pricing against Anthropic's docs (relevant at Issue #5).

## Derived facts (from CLAUDE.md commands)

| Fact | Command | Result |
|---|---|---|
| Test status | `npm test` | ✓ 4 files, 26 tests passing (Vitest 4.1.10) |
| Typecheck | `npx tsc --noEmit` | ✓ exit 0 (TypeScript 5.9.3) |
| Build | `npm run build` | ✓ Next.js 16.2.10; routes `/`, `/_not-found`, `/api/health` |
| Routes/pages | `find app -name 'route.ts' -o -name 'page.tsx'` | `app/api/health/route.ts`, `app/page.tsx` |
| Deploy | `vercel ls` | Vercel CLI unavailable; no deploy yet (Issue #11) |
| Git | `git log --oneline -1` | `8fd47a2 Close session 3: confirmed TS pin resolved, no code changes` (pre-commit) |
| Stack versions | `package.json` | next ^16.2.10 · react ^19.2.7 · tailwindcss ^4.3.2 · typescript ^5.9.3 · vitest ^4.1.10 · node v24.15.0 |

Note: the lookup lives in `lib/` + `app/AddressLookup.tsx` + `app/actions.ts` (server
actions); the `find` fact only lists `route.ts`/`page.tsx`, so those files don't appear
there by design.

## Active Milestone

**MVP** — https://github.com/lux-username/reptracker_2/milestone/1 (9 open Issues after
#2 closes: #3–#12). Roadmap lives there; not restated here.

## Blockers / open questions

None blocking. New this session: **Issue #12** — Geocodio fuzzy-matches garbage input
to a real town and shows a misleading disambiguation instead of `not_found`; not a
silent wrong pick (matched address is displayed), non-blocking, refinement of #2.
Recommended entry point next session: Issue #3 (per-rep section layout).
