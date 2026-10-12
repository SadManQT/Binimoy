# Status

- Product name: Binimoy (ADR-008)
- Completion level: D1 for one category (software license). Authorization paths that exist: `ACCEPTED_RELEASE`, `MUTUAL_RESOLUTION`, `REVIEWED_RESOLUTION` and the no-delivery refund. `OBJECTIVE_RELEASE` does not exist. Nothing at D2 or above.
- Active branch: `chunk-research`.
- Active tasks: LP-007, LP-008, LP-009, LP-011, LP-012, LP-013 are IN_PROGRESS (see handoffs for what is not built). LP-001 to LP-006 and LP-010 are MERGED.
- Verified milestones: D1 vertical slice (one category, accepted release and no-delivery refund)
- Blockers: none for local work. A real model has never been called (no API key). Seller research runs on synthetic pages only: no live search provider is chosen or keyed, and nothing fetches real pages. The vault needs Docker running (`pnpm matrix:local`). Staging needs a reachable homeserver, an email and SMS sender and its own OAuth apps.
- Next task: LP-017 to LP-021 (remaining categories, mock providers, objective release), and the open gaps in LP-007 to LP-009

## Scripts

Exist and were run: `pnpm run setup`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm db:migrate`, `pnpm db:local`.
Also exist: `pnpm test:e2e` (the vault test needs `pnpm matrix:local`), `pnpm matrix:local`, `pnpm staff grant|revoke|list`.
Not implemented: `eval:ai`, `demo:seed`, `demo:reset`.

## Prototype

The pre-v7 prototype was deleted from the tree (history: `b8244ae`). Its earlier "verified" claims do not count as v7 evidence.
