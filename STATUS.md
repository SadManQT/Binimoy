# Status

- Product name: Binimoy (ADR-008)
- Completion level: D1 for one category (software license), verified by `tests/e2e/vault.spec.ts` and `packages/db/src/settlement.int.test.ts`. Authorization paths that exist: `ACCEPTED_RELEASE` and the no-delivery refund. Nothing at D2 or above.
- Active branch: `chunk-settlement`.
- Active tasks: LP-007, LP-008, LP-009 (all IN_PROGRESS, see handoffs for what is not built). LP-001 to LP-005 are MERGED.
- Verified milestones: D1 vertical slice (one category, accepted release and no-delivery refund)
- Blockers: none for local work. The vault needs Docker running (`pnpm matrix:local`). Staging needs a reachable homeserver, an email and SMS sender and its own OAuth apps.
- Next task: LP-010 (dispute review, reviewers, appeals, mutual and reviewed resolution), then LP-006 and LP-011

## Scripts

Exist and were run: `pnpm run setup`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm db:migrate`, `pnpm db:local`.
Also exist: `pnpm test:e2e` (needs `pnpm matrix:local`), `pnpm matrix:local`.
Not implemented: `eval:ai`, `demo:seed`, `demo:reset`.

## Prototype

The pre-v7 prototype was deleted from the tree (history: `b8244ae`). Its earlier "verified" claims do not count as v7 evidence.
