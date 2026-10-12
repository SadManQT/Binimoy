# Status

- Product name: Binimoy (ADR-008)
- Completion level: D0. Nothing at D1 or above is verified.
- Active branch: `chunk-money`. `main` holds LP-001 to LP-004 (merged through PR #4).
- Active task: LP-005 (IN_REVIEW). LP-001 to LP-004 are MERGED. Handoffs in `docs/handoffs/`
- Verified milestones: none
- Blockers: LP-007 (secret vault) needs a Matrix homeserver to run against; where it runs is a founder decision. Staging needs an email and SMS sender and its own OAuth apps.
- Next task: LP-006, then LP-007 once a homeserver is available

## Scripts

Exist and were run: `pnpm run setup`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm db:migrate`, `pnpm db:local`.
Not implemented: `test:e2e`, `eval:ai`, `demo:seed`, `demo:reset`.

## Prototype

The pre-v7 prototype was deleted from the tree (history: `b8244ae`). Its earlier "verified" claims do not count as v7 evidence.
