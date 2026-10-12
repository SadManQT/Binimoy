# Handoff: LP-007 part 1, secret vault server side

- Base: `main` after LP-005
- Branch: `chunk-vault`
- Date: 2026-10-12
- **LP-007 is not complete.** This part covers the homeserver and the application server. The browser side, where encryption actually happens, is not built.

## Implemented

- Local Matrix homeserver (Synapse 1.162.0, pinned by digest) behind `pnpm matrix:local`, which generates its config, writes local-only secrets and fills the `MATRIX_*` values into `.env`.
- `@lp/adapters` vault module: Matrix user IDs derived from application user IDs, one-minute login tokens, and a metadata-only admin client with `verifyRoom` and `verifyEvent`.
- `registerVaultRoom` and `getVaultRoom`: one verified room per deal.
- Config: the four `MATRIX_*` values are all set or all empty; `config.vault` is null when empty.
- API: `GET /api/vault/session`, `POST /api/vault/rooms`, with an explicit same-origin check for state-changing JSON routes.
- ADR-004 with the threat boundary and its open gaps.

## Contract and migration changes

- Migration `0008_vault_room.sql`, applied to Supabase.
- New error codes: `VAULT_INVALID`, `VAULT_UNAVAILABLE`.

## Commands run and results

Against Supabase and the local homeserver.

| Check | Result |
|---|---|
| `packages/adapters/src/vault.int.test.ts` | 6 of 6 passed |
| `packages/adapters/src/vault-rooms.int.test.ts` | 6 of 6 passed |
| HTTP smoke test on a production-mode instance | no session 401; session token logs into Matrix as the same user and yields a device; foreign-origin room registration refused; outsider gets 403 |

What those tests establish: a token works only for the user it was minted for; a forged or long-expired token is refused; a room with a third member, the wrong parties, no encryption or public joining is refused; the application's own account is not a member; an event counts only if encrypted, in this room and from the expected sender; a registered room cannot be swapped or shared between deals; no vault before the agreement is accepted.

## Problems found and fixed

- The registration secret Synapse generated contained `#`, which `.env` treats as a comment, silently truncating it. The setup script now writes a hex secret.
- Token expiry has two minutes of server leeway; the test and ADR now say so.

## Not run

- Everything in the browser. See ADR-004 "Not run".
- Vault tests in CI: skipped there, because CI has no homeserver.

## Next

LP-007 part 2: the browser vault with matrix-js-sdk (device creation, room creation, sending and reading delivery payloads), tested with two real browser sessions. Then LP-008 (delivery packages, inspection, mock providers) and LP-009 (payout and refund).
