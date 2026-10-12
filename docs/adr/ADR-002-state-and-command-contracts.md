# ADR-002: State machines and the command kernel

- Status: ACCEPTED
- Date: 2026-10-12
- Affects: LP-003 to LP-011, LP-017 to LP-019

## Problem

Spec D.3 requires independent state machines, version checks, idempotency and atomic event and outbox writes, shared by every later task. Without one shared mechanism each task would reimplement them differently.

## Decision

1. **One generic `aggregate` table** holds `type`, `deal_id`, `state` and `version` for every state machine instance. Tasks that own an aggregate add their own detail tables keyed by the aggregate ID.
2. **Transition tables are data** in `packages/domain/src/machines.ts`. A row names the command, source states, allowed target states and allowed roles. State lists are copied from D.3 and pinned by a test.
3. **One executor**, `executeCommand`, runs every state change under a row lock on the aggregate, in a single transaction that also writes the event, the outbox row and the idempotency record.
4. **Idempotency scope** is environment, principal, command, aggregate and key (D.4). The payload hash ignores key order.
5. **Deny by default.** An actor with no resolvable role for the deal gets `NOT_AUTHORIZED`, as does an unknown aggregate ID.
6. **Events are append-only**, enforced by a database trigger.

## Not decided here

- The double-entry journal, reservations and the conservation equation (D.4): LP-005 and LP-018.
- Outbox dispatch, leases and fencing (D.5): LP-005.
- Reviewer, appeal reviewer and approver role resolution (D.6): LP-010.
- Command-specific guards and payload schemas: the task that owns each command.
- How a command chooses among several target states using data read in the transaction. Today the caller passes `to`. LP-004 is the first task that needs more and will extend the executor.

## Design judgments to review

The transition rows are this project's reading of D.3, B9 and D.6. These are the ones most worth a second opinion:

- `AcceptAgreement` and `AcceptResolution` keep the state on the first party's consent and move it on the second.
- `WithdrawAgreement` is allowed from `ACCEPTED`; the "only while unfunded" guard is left to LP-004.
- `ReopenDispute` is allowed only from `UNRESOLVED_CLOSED`. New evidence after `RESOLVED` opens a new dispute.
- Final adapter results (`SUCCEEDED`, `FAILED_FINAL`, `CANCELLED_CONFIRMED`) have no outgoing transitions.

## Test implications

Every later task tests its commands through `executeCommand` against a real database. A new table must enable row level security or the schema test fails.
