# Status

- Product name: Binimoy (ADR-008)
- Completion level: D0. Nothing at D1 or above is verified.
- Active branch: `lp-003-auth` (stacked on `lp-002-contracts` PR #2 and `lp-001-bootstrap` PR #1; none merged)
- Active tasks: LP-001, LP-002, LP-003 (all IN_REVIEW). Handoffs in `docs/handoffs/`
- Verified milestones: none
- Blockers: none for local work. Staging needs an email and SMS sender and OAuth credentials (see `docs/handoffs/LP-003.md`). GitHub Actions has not produced a run yet.
- Next task: LP-004

## Scripts

Exist and were run: `pnpm run setup`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm db:migrate`, `pnpm db:local`.
Not implemented: `test:e2e`, `eval:ai`, `demo:seed`, `demo:reset`.

## Prototype

The pre-v7 prototype was deleted from the tree (history: `b8244ae`). Its earlier "verified" claims do not count as v7 evidence.
