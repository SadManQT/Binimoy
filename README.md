# Binimoy (বিনিময়)

Source of truth: `docs/MASTER_SPEC.md`. Current state: `STATUS.md`.

## Local start

Requires Node (see `.nvmrc`), pnpm (version in `package.json` `packageManager`), and a PostgreSQL database.

    pnpm install
    cp .env.example .env      # then set DATABASE_URL
    pnpm run setup            # applies the database schema
    pnpm dev

Web: http://localhost:3000 · Health: http://localhost:3000/api/health

### Database

Set `DATABASE_URL` in `.env`.

- **Supabase:** use the direct connection or the session pooler (port 5432), not the transaction pooler (6543).
- **Local Docker (optional):** `pnpm db:local`, then use `postgres://lp:lp_local_only@localhost:54329/lp`.

`pnpm setup` is a pnpm built-in; the project script is `pnpm run setup`.

## Checks

    pnpm lint
    pnpm typecheck
    pnpm test:unit
    pnpm test:integration     # needs DATABASE_URL; runs in its own lp_test schema
    pnpm build

All payments are mock. Research and AI run on labeled fixtures.
