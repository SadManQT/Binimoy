# Status

- Product name: Binimoy (ADR-008)
- Completion level: D0. Nothing at D1 or above is verified.
- Active branch: `lp-001-bootstrap` · base `b8244aeecdc10efc263b89e5c4e7dcd82c6b7c47`
- Active task: LP-001 (IN_REVIEW). Handoff: `docs/handoffs/LP-001.md`
- Verified milestones: none
- Blockers: none. Supabase project `binimoy` (ref `mhhhpnkkzpjefngcpinh`, ap-southeast-1, PostgreSQL 17) is connected through the session pooler.
- Next task: LP-002

## Scripts

Exist and were run: `pnpm run setup`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm db:migrate`, `pnpm db:local`.
Not implemented: `test:e2e`, `eval:ai`, `demo:seed`, `demo:reset`.

## Prototype

The pre-v7 prototype was deleted from the tree (history: `b8244ae`). Its earlier "verified" claims do not count as v7 evidence.
