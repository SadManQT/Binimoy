# Status

- Product name: Binimoy (ADR-008)
- Completion level: D0. Nothing at D1 or above is verified.
- Active branch: `lp-004-agreements` (stacked on PRs #1 to #3; none merged)
- Active tasks: LP-001 to LP-004 (all IN_REVIEW). Handoffs in `docs/handoffs/`
- Verified milestones: none
- Blockers: none for local work. Staging needs an email and SMS sender and its own OAuth apps (see `docs/handoffs/LP-003.md`).
- Next task: LP-005 (LP-006, LP-007 and LP-012 can run alongside it)

## Scripts

Exist and were run: `pnpm run setup`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm db:migrate`, `pnpm db:local`.
Not implemented: `test:e2e`, `eval:ai`, `demo:seed`, `demo:reset`.

## Prototype

The pre-v7 prototype was deleted from the tree (history: `b8244ae`). Its earlier "verified" claims do not count as v7 evidence.
