# CLAUDE.md — how to work here

Read at the start of every session. This is "how we work here," not what the project is (that's spec.md).

## Project

Constituent Representative Tracker — a web app that lets a US constituent enter their address and see, in time to act, the upcoming decisions their federal representatives are about to make, plus the structural context (committee role, contact info) needed to weigh in.

## Stack

- **Framework:** Next.js (App Router) on Vercel. Server components fetch data server-side so API keys never reach the browser. One page, one route.
- **LLM:** Anthropic SDK, Haiku-class model for per-rep digests and plain-English bill summaries. Prompt caching on the stable system prompt. **Re-verify the current model ID + pricing against Anthropic's docs at build time** — do not trust a pinned value.
- **Cache / KV:** Upstash Redis (Vercel-native).
- **Scraping:** `fetch` + `cheerio` in a route handler, run on a schedule via Vercel Cron, results stashed in Upstash.
- **Frontend:** plain Tailwind.
- **External APIs:** Geocodio (address → district), Congress.gov (member/committee/bill/meeting data).

## Key commands

| Action | Command |
|---|---|
| Build | `npm run build` |
| Test | `npm test` |
| Run | `npm run dev` |

## Derived Facts — read by /end-session and /weekly-reconciliation

Every fact below is obtained by **running the command, never by recall**. If you catch yourself typing one of these from memory into any doc, stop and run the command instead. Add a row whenever a new kind of fact starts appearing in docs — an unrepresented fact here is a future drift.

| Fact | Command |
|---|---|
| Test status | `npm test` |
| Typecheck clean | `npx tsc --noEmit` |
| Implemented routes/pages | `find app -name 'route.ts' -o -name 'page.tsx' 2>/dev/null | sort` |
| Deploy URL / last deploy status | `vercel ls 2>/dev/null | head` (or check the Vercel dashboard) |

## Rules

- **Every fact has exactly one home.** Reference or derive; never copy into a second place.
- Current state → `STATUS.md` (overwritten). History → `journal/` (append). Rationale → `decisions.md` (append). Open tasks → GitHub Issues. Roadmap → Milestones. Design → `spec.md`. Repo layout → `MAP.md` (tree derived by command; annotations curated; refreshed by /weekly-reconciliation).
- **Plans never live only in the journal.** If it's open work, it's an Issue.
- Session start: read `STATUS.md` (check its stamp date), then `gh issue list --state open`.
- Session end: run **/end-session**. Always — a skipped run is how STATUS.md starts lying.
