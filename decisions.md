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
