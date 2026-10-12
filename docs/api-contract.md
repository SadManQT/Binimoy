# Command and event contract

Status: LP-002 baseline. Source of truth is the code named in each section; this page explains it.

## Command envelope

Defined in `packages/contracts/src/command.ts` (`commandEnvelope`).

| Field | Type | Rule |
|---|---|---|
| `commandId` | UUID | Chosen by the client; becomes the event's causation and correlation ID |
| `idempotencyKey` | string, 8 to 200 chars | One logical action; reuse it on retry |
| `dealId` | UUID, optional | If present it must match the aggregate's deal |
| `expectedAggregateVersion` | integer ≥ 0 | The version the client last saw |
| `payload` | JSON object | Command-specific data |

The envelope carries no actor and no role. Identity comes from the authenticated server session; unknown keys such as `role` are stripped.

## Execution

`executeCommand` in `packages/db/src/commands.ts` runs every state-changing command in one database transaction:

1. Validate the envelope and IDs.
2. Lock the aggregate row. All commands on one aggregate are serialized, across web and worker processes.
3. Resolve the actor's roles for that deal. No role means `NOT_AUTHORIZED`. An unknown aggregate ID also returns `NOT_AUTHORIZED`, so an ID never works as a permission or a probe.
4. Idempotency lookup. Same key and same payload returns the original result. Same key and different payload returns `IDEMPOTENCY_CONFLICT`.
5. Compare `expectedAggregateVersion` with the stored version. A mismatch is `VERSION_CONFLICT`.
6. Check the transition table for the aggregate type.
7. Update state and version, insert the event, the outbox row and the idempotency record, then commit.

A rejected command writes nothing and is not remembered under its idempotency key, so a retry is evaluated again.

## Error codes

Defined in `packages/contracts/src/command.ts` (`ERROR_CODES`).

| Code | Meaning | Raised by LP-002 |
|---|---|---|
| `VALIDATION_FAILED` | Malformed envelope or ID | yes |
| `NOT_AUTHORIZED` | Actor has no role allowing this command on this aggregate | yes |
| `VERSION_CONFLICT` | Aggregate changed since the client read it; refresh, do not replay | yes |
| `IDEMPOTENCY_CONFLICT` | Key reused with a different payload | yes |
| `ILLEGAL_TRANSITION` | Command does not apply in the current state | yes |
| `MISSING_CONSENT`, `INCOMPLETE_DELIVERY`, `VERIFICATION_UNKNOWN`, `DISPUTE_OPEN`, `INSUFFICIENT_HELD_FUNDS`, `ADAPTER_PENDING`, `TEST_MODE_REQUIRED` | Guards owned by later tasks | reserved |

## State machines and role matrix

Defined in `packages/domain/src/machines.ts` (`MACHINES`). Each row lists a command, the states it applies from, the states it may lead to, and the roles allowed to issue it. That table is the role matrix for state-changing commands.

Aggregates: `agreement`, `funding_invoice`, `delivery`, `inspection_item`, `dispute`, `authorization`, `adapter_operation`, `notice`. Their state lists are exactly those of spec D.3, and a test fails if they drift.

Roles: `buyer`, `seller`, `reviewer`, `appeal_reviewer`, `approver`, `system`.

- `buyer` and `seller` are resolved per deal from `deal_party`.
- `system` is the worker or an authenticated adapter. Every `authorization` and `adapter_operation` transition, and funding confirmation, is `system` only.
- `reviewer`, `appeal_reviewer` and `approver` are not resolvable yet. They come from scoped assignments in LP-010. Until then every command that needs one is denied.

Guards beyond role and state (consent, held funds, proof freshness, deadlines) are not in this table. The task that owns a command adds them inside the same transaction.

## Command-specific logic

A command may pass an `apply` hook to `executeCommand`. The hook runs inside the transaction, under the aggregate lock, only after the role, idempotency and version checks have passed. It can refuse with an error code, choose the target state, write its own rows, and replace the payload stored in the event. Agreement commands (`packages/db/src/agreements.ts`) are the first users.

Additional codes raised by LP-004: `COUNTERPARTY_MISSING`, `INVITE_INVALID`.

## Locking

Every command locks the deal row first and the aggregate row second. Hooks may therefore read and change the same deal's other aggregates without racing. `systemTransition` applies a consequential transition to another aggregate inside the calling command's transaction.

## Ledger and funding

Code: `packages/db/src/ledger.ts`.

- The journal is the only source of balances. An entry is one economic fact with a unique `ref`; posting the same `ref` twice does nothing.
- Accounts: `mock_clearing` (what the provider says it received) and the liabilities `held`, `reserved`, `seller_paid`, `buyer_refunded`, `fee_collected`, `unapplied`.
- Only an authenticated provider event can move an invoice to `CONFIRMED`. The event must match the invoice's amount and currency exactly; anything else is recorded as unapplied and the invoice goes to `RECONCILIATION_REQUIRED`.
- Provider callback: `POST /api/webhooks/mock-payment` with header `x-mock-signature` (HMAC-SHA256 of the raw body). 401 for a bad signature, 400 for a malformed body, otherwise `{ "outcome": ... }`.

## Delivery and settlement

Code: `packages/db/src/delivery.ts`, `packages/db/src/settlement.ts`.

- Submitting, inspecting, accepting, authorizing, dispatching and settling are separate recorded events. None implies the next.
- A delivery package is an immutable version. A new version supersedes the old one, makes its inspections `STALE` and invalidates any unsent authorization that depended on it.
- An authorization reserves the money (held to reserved) when it is created. The reservation is settled only by an adapter success, and returned to held only by an adapter final failure or by invalidation before dispatch.
- The dispatch commit is the linearization point shared with disputes. A dispute committed before it invalidates the authorization; one committed after it is recorded with `after_dispatch = true` and does not stop or undo the transfer.
- The adapter key `binimoy:<authorizationId>:<kind>` never changes, so a retry cannot become a second transfer.

Additional codes raised: `INCOMPLETE_DELIVERY`, `VAULT_INVALID`, `DISPUTE_OPEN`, `INSUFFICIENT_HELD_FUNDS`.

## Events

Type `DomainEvent` in `packages/contracts/src/command.ts`; table `event`.

- One event per aggregate version, enforced by a unique constraint.
- `event_type` is `<aggregate type>.<command>`.
- `payload` is `{ from, to, data }` where `data` is the command payload. Command payloads must never contain delivery plaintext or secrets.
- The table is append-only: a trigger rejects `UPDATE` and `DELETE`.
- An `outbox` row is written in the same transaction. The dispatcher, leases, retries and dead-letter handling arrive in LP-005.

## Money

`parseMoney` and `formatMoney` in `packages/contracts/src/money.ts`.

Money is a non-negative integer count of minor units. It crosses JSON as a decimal integer string (`"100000"`), is a `bigint` in code, and fits a PostgreSQL `bigint`. Negative values, decimals, exponents, signs, leading zeros, non-ASCII digits and JavaScript numbers are rejected.

## Changing this contract

Additive changes keep existing clients working. A breaking change needs a new `schema_version` and coordinated consumers (spec A8). Changes to states or roles are recorded in an ADR.
