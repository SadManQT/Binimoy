# Status

- Product name: Binimoy (ADR-008)
- Completion level: D1. All eleven categories run on a synthetic provider and all five authorization paths exist, exercised by 99 database-level category cases (LP-021 handoff). D2 is not claimed: ten categories have no browser test, nothing has been independently reviewed, and the remaining gates are open.
- Active branch: `chunk-bilingual`.
- Active tasks: LP-007, LP-008, LP-009, LP-011, LP-012, LP-013, LP-014, LP-017, LP-018, LP-020, LP-021, LP-022 are IN_PROGRESS (see handoffs for what is not built). LP-001 to LP-006 and LP-010 are MERGED.
- Verified milestones: D1 vertical slice (one category, accepted release and no-delivery refund)
- Blockers: none for local work. A real model has never been called (no API key). Seller research runs on synthetic pages only: no live search provider is chosen or keyed, and nothing fetches real pages. The vault needs Docker running (`pnpm matrix:local`). Staging needs a reachable homeserver, an email and SMS sender and its own OAuth apps.
- Next task: the founder items in `docs/FOUNDER_TODO.html`, then the 'Not built' lists in the handoffs (uploads, device verification, accessibility pass, restore rehearsal)

## Overnight work log (2026-10-13)

Merged: redesign with generated artwork and bilingual public pages (PR #17); trust signal, review highlights, copy hint (PR #18). In progress: bilingual review-writing pages.

Next, in order: English for login, deal and staff pages (they are Bangla only); evidence uploads for reviews; a model-based summary of reviews once `MODEL_API_KEY` exists; live updates; per-screen design of the deal page, review desk and receipt; a real phone and Safari check.

## Scripts

Exist and were run: `pnpm run setup`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm db:migrate`, `pnpm db:local`.
Also exist: `pnpm test:e2e` (the vault test needs `pnpm matrix:local`), `pnpm matrix:local`, `pnpm staff grant|revoke|list`.
Fast local integration runs: start any Postgres 17 and set `TEST_DATABASE_URL` for the command (a container named `binimoy-test-pg` on port 54330 was used on 2026-10-12).
Also exist: `pnpm eval:ai`, `pnpm demo:seed`, `pnpm demo:reset` (both need `DB_SCHEMA=lp_lab`), `pnpm ops status|pause|resume`.

## Prototype

The pre-v7 prototype was deleted from the tree (history: `b8244ae`). Its earlier "verified" claims do not count as v7 evidence.
