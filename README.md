# Lenden Prohori

Working name. Source of truth: `docs/MASTER_SPEC.md`. Current state: `STATUS.md`.

## Local start
Requires Node (see `.nvmrc`), corepack, and Docker.

    corepack enable
    pnpm install
    cp .env.example .env
    pnpm run setup
    pnpm dev

Web: http://localhost:3000 · Health: http://localhost:3000/api/health

All payments are mock. Research and AI run on labeled fixtures.
