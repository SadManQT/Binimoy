# Status

- Product name: Binimoy (ADR-008)
- Completion level: D0. Nothing at D1 or above is verified.
- Active branch: `chunk-vault-browser`. `main` holds LP-001 to LP-005 and LP-007 part 1.
- Active task: LP-007 (IN_PROGRESS: encrypted delivery between two browsers works; device verification and key backup not built). LP-001 to LP-005 are MERGED.
- Verified milestones: none
- Blockers: none for local work. The vault needs Docker running (`pnpm matrix:local`). Staging needs a reachable homeserver, an email and SMS sender and its own OAuth apps.
- Next task: LP-008 (delivery packages, inspection, mock providers), then LP-009 (payout and refund)

## Scripts

Exist and were run: `pnpm run setup`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm db:migrate`, `pnpm db:local`.
Also exist: `pnpm test:e2e` (needs `pnpm matrix:local`), `pnpm matrix:local`.
Not implemented: `eval:ai`, `demo:seed`, `demo:reset`.

## Prototype

The pre-v7 prototype was deleted from the tree (history: `b8244ae`). Its earlier "verified" claims do not count as v7 evidence.
