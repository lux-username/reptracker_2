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
