# Status

- Product name: Binimoy (ADR-008)
- Completion level: D1. All eleven categories run on a synthetic provider and all five authorization paths exist, exercised by 99 database-level category cases (LP-021 handoff). D2 is not claimed: ten categories have no browser test, nothing has been independently reviewed, and the remaining gates are open.
- Active branch: `chunk-white-and-live`.
- Active tasks: LP-007, LP-008, LP-009, LP-011, LP-012, LP-013, LP-014, LP-017, LP-018, LP-020, LP-021, LP-022 are IN_PROGRESS (see handoffs for what is not built). LP-001 to LP-006 and LP-010 are MERGED.
- Verified milestones: D1 vertical slice (one category, accepted release and no-delivery refund)
- Blockers: none for local work. A real model has never been called (no API key). Seller research runs on synthetic pages only: no live search provider is chosen or keyed, and nothing fetches real pages. The vault needs Docker running (`pnpm matrix:local`). Staging needs a reachable homeserver, an email and SMS sender and its own OAuth apps.
- Next task: the founder items in `docs/FOUNDER_TODO.html`, then the 'Not built' lists in the handoffs (uploads, device verification, accessibility pass, restore rehearsal)

## Work log (2026-10-13)

Merged: redesign with generated artwork and bilingual public pages (PR #17); trust signal, review highlights, copy hint (PR #18); bilingual review writing (PR #19); login in both languages (PR #20); 3D objects, alert ticker, shop comparison (PR #21); English for the deal list, new deal, notifications and account (PR #22).

In this branch: English for the single-deal page and its sections (funding, delivery, vault, conversation, AI summary, settling), the receipt, invite, web lookup, review desk and moderation; the gaps left on the review-writing pages. Bangla stays the default. Not translated: browser-tab titles of signed-in pages. The English has not been read by a person.

Also merged: English for the deal, receipt and staff pages (PR #23). In `chunk-live-deal`, on founder feedback that the safe-deal page needed reloads and was too hard for a beginner: the deal page updates itself, and was rebuilt around one stage panel (3D scene, five-step track, whose turn it is) with long explanations folded away.

Also merged: the self-updating, simpler deal page (PR #24). In `chunk-fresh-look`, on founder feedback that the design and colours were unfriendly and wordy: a new light design system for every page (ADR-010), a shorter front page, a simpler login page, shorter page introductions. Inner pages share the new look but their text was not all rewritten shorter.

Also merged: the new design system (PR #25). In `chunk-white-and-live`: the page colour changed to clean white (the founder rejected periwinkle and chose white); live updates on the deal list and notifications; evidence pictures on reviews, private to the author and the assigned moderator (schema file `0018_report_evidence.sql`, applied to the development database).

Next, in order: evidence shown publicly needs a virus scanner and redacted copies first (D.9), which is a provider decision; a model-based summary of reviews once `MODEL_API_KEY` exists; live updates on the remaining pages; per-screen design of the review desk and receipt; a real phone and Safari check.

## Scripts

Exist and were run: `pnpm run setup`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm db:migrate`, `pnpm db:local`.
Also exist: `pnpm test:e2e` (the vault test needs `pnpm matrix:local`), `pnpm matrix:local`, `pnpm staff grant|revoke|list`.
Fast local integration runs: start any Postgres 17 and set `TEST_DATABASE_URL` for the command (a container named `binimoy-test-pg` on port 54330 was used on 2026-10-12).
Also exist: `pnpm eval:ai`, `pnpm demo:seed`, `pnpm demo:reset` (both need `DB_SCHEMA=lp_lab`), `pnpm ops status|pause|resume`.

## Prototype

The pre-v7 prototype was deleted from the tree (history: `b8244ae`). Its earlier "verified" claims do not count as v7 evidence.
