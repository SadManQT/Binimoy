# ADR-001: Runtime and deployment shape

- Status: ACCEPTED
- Date: 2026-10-12
- Affects: all tasks

## Problem

The inherited prototype (FastAPI, MongoDB, Create React App) could not meet spec A2, D.3, D.4 or D.5: wrong stack, no transactional guarantees, no worker, no outbox.

## Options

1. Port the prototype in place.
2. Rebuild as the A3 monorepo and keep the prototype as reference in `legacy/`.
3. Rebuild as the A3 monorepo and delete the prototype from the tree.

## Decision

Option 3, on founder instruction ("start from nothing remove all"). The prototype remains in git history at commit `b8244ae`.

- One pnpm TypeScript workspace.
- `apps/web` is a Next.js server app built with `output: "standalone"` for container deployment.
- `apps/worker` is a separate long-running Node process.
- Both reach PostgreSQL through `packages/db` using one `DATABASE_URL`.
- SQL migrations are plain files in `packages/db/migrations`, applied by one runner under a PostgreSQL session advisory lock.
- **Database host: Supabase (managed PostgreSQL), by founder choice.** The code uses only standard PostgreSQL, so any host works. A Docker compose file is kept as an optional local fallback (`pnpm db:local`).
- Integration tests run inside a dedicated `lp_test` schema of the configured database, so they cannot touch application tables.

## Pinned versions

| Tool | Version |
|---|---|
| Node.js | 24.11.1 |
| pnpm | 12.11.2 |
| TypeScript | 7.0.2 |
| Next.js | 16.4.0 |
| React / React DOM | 19.3.0 |
| pg | 8.23.1 |
| zod | 4.6.5 |
| Vitest | 5.0.3 |
| tsx | 4.23.15 |
| Biome | 2.5.15 |
| @types/node | 24.19.2 |
| PostgreSQL (local fallback image) | `postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` |

## Consequences

- The repository no longer runs on the Emergent FastAPI/React/MongoDB preview image.
- Supabase must be reached through its direct connection or session pooler. The transaction pooler does not hold the session lock the migration runner relies on.
- **Supabase connectivity is not yet verified.** Everything in LP-001 was exercised against the local PostgreSQL 17 container only. TLS settings for the Supabase connection string are untested.
- The Supabase PostgreSQL major version must be recorded once connected; it may differ from 17.
- Object storage, the Matrix homeserver and the notification adapter are not provisioned. They are added by the tasks that first use them (LP-006, LP-007, LP-018).
