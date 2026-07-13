> Regenerated 2026-07-12 by /weekly-reconciliation. Refreshed by /weekly-reconciliation.

# Repo map

The **tree is derived** (generated from `git ls-files`, overwritten wholesale — never
hand-edit it). The **annotations are curated** — update a row when a path's purpose
changes; /weekly-reconciliation prunes rows for dead paths and flags new unannotated ones.

Two homogeneous leaf dirs are collapsed with a count to keep the tree readable
(`lib/__fixtures__/`, `journal/`); each `lib/<name>.ts` also has a co-located
`<name>.test.ts` (15 test files), not listed twice.

## Tree (derived)

```
.
├── .claude/
│   └── skills/
│       ├── end-session/
│       │   ├── scripts/
│       │   │   └── render_transcript.py
│       │   └── SKILL.md
│       └── weekly-reconciliation/
│           └── SKILL.md
├── .github/
│   └── workflows/
│       └── prewarm.yml
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   └── prewarm/
│   │   │       └── route.ts
│   │   └── health/
│   │       └── route.ts
│   ├── AddressLookup.tsx
│   ├── ExternalLink.tsx
│   ├── FloorThisWeek.tsx
│   ├── FloorThisWeek.test.tsx
│   ├── Footer.tsx
│   ├── RepSection.tsx
│   ├── RepSection.test.tsx
│   ├── actions.ts
│   ├── globals.css
│   ├── icon.svg
│   ├── layout.tsx
│   ├── page.test.tsx
│   └── page.tsx
├── lib/
│   ├── __fixtures__/          (26 JSON fixtures — recorded API/geocode responses)
│   ├── cache.ts
│   ├── committee-actions.ts
│   ├── committees.ts
│   ├── congress.ts
│   ├── district-offices.ts
│   ├── events-index.ts
│   ├── floor-schedule.ts
│   ├── geocodio.ts
│   ├── jurisdictions.ts
│   ├── legislation.ts
│   ├── prewarm.ts
│   ├── rate-limit.ts
│   ├── rep-profile.ts
│   ├── resolve-reps.ts
│   ├── session-status.ts
│   ├── summaries.ts
│   └── types.ts
├── journal/                   (30 committed session summaries)
├── .gitignore
├── CLAUDE.md
├── MAP.md
├── README.md
├── STATUS.md
├── decisions.md
├── spec.md
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── tsconfig.json
├── vercel.json
├── vitest.config.ts
└── vitest.setup.ts
```

## What each path holds (curated)

| Path | What it holds |
|---|---|
| `README.md` | Orientation + resume read-order |
| `CLAUDE.md` | How we work here; Derived Facts table |
| `spec.md` | Design of record (the MVP spec) + future direction |
| `STATUS.md` | Current state (overwritten each session) |
| `decisions.md` | Append-only "chose X over Y because Z" |
| `MAP.md` | This file |
| `journal/` | One committed summary per session |
| `sessions/` | Raw transcripts (gitignored, locally greppable) |
| `.claude/skills/end-session/` | Per-repo /end-session skill (tune to this project) |
| `.claude/skills/weekly-reconciliation/` | Per-repo /weekly-reconciliation skill |
| `.github/workflows/prewarm.yml` | External hourly/:15,:45 scheduler curling `/api/cron/prewarm` (sub-daily freshness, #23) |
| `app/page.tsx` | The single page — header shell; mounts the `AddressLookup` client component |
| `app/actions.ts` | Server actions (`lookupAction`, `resolveCandidateAction`, `buildProfilesAction`) — the server-side boundary where keys stay |
| `app/AddressLookup.tsx` | Client address-entry form + disambiguation UI; renders `RepSection`s + `FloorThisWeek` |
| `app/RepSection.tsx` | Per-rep section render: header, contacts, upcoming committee action, bills |
| `app/FloorThisWeek.tsx` | "Floor this week" section: House/Senate floor schedule + freshness stamp (#4) |
| `app/ExternalLink.tsx` | Shared `target="_blank"` link with `rel` + visually-hidden "(opens in new tab)" SR cue (#9) |
| `app/Footer.tsx` | Site-wide footer: disclaimer, privacy, feedback + report-issue links |
| `app/layout.tsx` | Root layout; mounts the footer and global styles |
| `app/api/health/route.ts` | Liveness probe (`/api/health` → 200) |
| `app/api/cron/prewarm/route.ts` | Pre-warm cron endpoint (`CRON_SECRET` Bearer auth); drives the events-index/floor warm (#16, #23) |
| `app/icon.svg` / `app/globals.css` | Favicon; Tailwind entry stylesheet |
| `lib/geocodio.ts` | Geocodio client: address → district (+ disambiguation candidates); SHA-256 cache key (#31) |
| `lib/resolve-reps.ts` | Geocode result → the user's House member(s) + senators |
| `lib/jurisdictions.ts` | Non-voting delegate / territory classification (OCD-id based) |
| `lib/congress.ts` | Congress.gov API client (members, meetings, hearings, bills) |
| `lib/committees.ts` | Committee assignments + structural role (chair/ranking/member) |
| `lib/committee-actions.ts` | Upcoming-committee-action assembly (meeting/hearing sweep, chronological) |
| `lib/legislation.ts` | Sponsored/cosponsored bill filter, sort, cap-at-7 |
| `lib/summaries.ts` | Verbatim CRS bill summaries + "as introduced"/"amended since" stamps — no LLM |
| `lib/district-offices.ts` | District-office phone/address from `unitedstates/congress-legislators` dataset (#13) |
| `lib/session-status.ts` | Per-chamber recess/in-session detection (Senate schedule XML + House weekly floor XML) (#8, #27) |
| `lib/floor-schedule.ts` | House weekly-XML + Senate floor scrape → floor schedule (#4) |
| `lib/events-index.ts` | Cron-built single-blob upcoming-events index (convergent cursor + swept head) (#16) |
| `lib/prewarm.ts` | Pre-warm sweep logic invoked by the cron route (#16) |
| `lib/rate-limit.ts` | Per-instance token bucket in front of every Congress.gov fetch (#17) |
| `lib/rep-profile.ts` | Assembles the full per-rep profile from the above |
| `lib/cache.ts` | `cached(key, ttl, loader)` Upstash primitive; graceful degradation |
| `lib/types.ts` | Shared domain types |
| `lib/__fixtures__/` | Recorded API/geocode JSON responses backing the unit tests |
| `vercel.json` | Vercel config: daily pre-warm cron baseline (08:00 UTC) + cron route maxDuration |
| `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` | Next.js, TypeScript, PostCSS/Tailwind config |
| `vitest.config.ts` / `vitest.setup.ts` | Test runner config + setup |
| `package.json` / `package-lock.json` | Dependencies (note: no `@anthropic-ai/*` — LLM retired session 6) |
