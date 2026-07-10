> Regenerated 2026-07-09 by /weekly-reconciliation. Refreshed by /weekly-reconciliation.

# Repo map

The **tree is derived** (generated from `git ls-files`, overwritten wholesale — never
hand-edit it). The **annotations are curated** — update a row when a path's purpose
changes; /weekly-reconciliation prunes rows for dead paths and flags new unannotated ones.

Two homogeneous leaf dirs are collapsed with a count to keep the tree readable
(`lib/__fixtures__/`, `journal/`); each `lib/<name>.ts` also has a co-located
`<name>.test.ts` (9 test files), not listed twice.

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
├── app/
│   ├── api/
│   │   └── health/
│   │       └── route.ts
│   ├── AddressLookup.tsx
│   ├── Footer.tsx
│   ├── RepSection.tsx
│   ├── actions.ts
│   ├── globals.css
│   ├── icon.svg
│   ├── layout.tsx
│   ├── page.test.tsx
│   └── page.tsx
├── lib/
│   ├── __fixtures__/          (21 JSON fixtures — recorded API/geocode responses)
│   ├── cache.ts
│   ├── committee-actions.ts
│   ├── committees.ts
│   ├── congress.ts
│   ├── geocodio.ts
│   ├── jurisdictions.ts
│   ├── legislation.ts
│   ├── rep-profile.ts
│   ├── resolve-reps.ts
│   ├── summaries.ts
│   └── types.ts
├── journal/                   (10 committed session summaries)
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
| `app/page.tsx` | The single page — header shell; mounts the `AddressLookup` client component |
| `app/actions.ts` | Server actions (`lookupAction`, `resolveCandidateAction`) — the server-side boundary where keys stay |
| `app/AddressLookup.tsx` | Client address-entry form + disambiguation UI; renders `RepSection`s |
| `app/RepSection.tsx` | Per-rep section render: header, contacts, upcoming committee action, bills |
| `app/Footer.tsx` | Site-wide footer: disclaimer, privacy, feedback + report-issue links |
| `app/layout.tsx` | Root layout; mounts the footer and global styles |
| `app/api/health/route.ts` | Liveness probe (`/api/health` → 200) |
| `app/icon.svg` / `app/globals.css` | Favicon; Tailwind entry stylesheet |
| `lib/geocodio.ts` | Geocodio client: address → district (+ disambiguation candidates) |
| `lib/resolve-reps.ts` | Geocode result → the user's House member(s) + senators |
| `lib/jurisdictions.ts` | Non-voting delegate / territory classification (OCD-id based) |
| `lib/congress.ts` | Congress.gov API client (members, meetings, hearings, bills) |
| `lib/committees.ts` | Committee assignments + structural role (chair/ranking/member) |
| `lib/committee-actions.ts` | Upcoming-committee-action assembly (meeting/hearing sweep, chronological) |
| `lib/legislation.ts` | Sponsored/cosponsored bill filter, sort, cap-at-7 |
| `lib/summaries.ts` | Verbatim CRS bill summaries + "as introduced"/"amended since" stamps — no LLM |
| `lib/rep-profile.ts` | Assembles the full per-rep profile from the above |
| `lib/cache.ts` | `cached(key, ttl, loader)` Upstash primitive; graceful degradation |
| `lib/types.ts` | Shared domain types |
| `lib/__fixtures__/` | Recorded API/geocode JSON responses backing the unit tests |
| `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` | Next.js, TypeScript, PostCSS/Tailwind config |
| `vitest.config.ts` / `vitest.setup.ts` | Test runner config + setup |
| `package.json` / `package-lock.json` | Dependencies (note: no `@anthropic-ai/*` — LLM retired session 6) |
