import type { Pool } from "./index";

// D.5 step 6. A worker holds an entry only while its lease lasts. Each claim
// raises the generation, and every write names the generation it holds, so a
// worker whose lease has expired cannot overwrite the worker that replaced it.

export const MAX_OUTBOX_ATTEMPTS = 5;

export type OutboxClaim = {
  eventId: string;
  eventType: string;
  owner: string;
  generation: number;
};

export async function claimOutbox(
  pool: Pool,
  owner: string,
  limit: number,
  leaseSeconds: number,
): Promise<OutboxClaim[]> {
  const { rows } = await pool.query(
    `update outbox o
     set lease_owner = $1,
         lease_generation = o.lease_generation + 1,
         lease_until = now() + make_interval(secs => $3),
         attempts = o.attempts + 1
     from (
       select event_id from outbox
       where dispatched_at is null and dead_at is null
         and (lease_until is null or lease_until < now())
       order by created_at
       limit $2
       for update skip locked
     ) c
     where o.event_id = c.event_id
     returning o.event_id, o.lease_generation,
       (select event_type from event e where e.event_id = o.event_id) as event_type`,
    [owner, limit, leaseSeconds],
  );
  return rows.map((r) => ({
    eventId: r.event_id,
    eventType: r.event_type,
    owner,
    generation: Number(r.lease_generation),
  }));
}

// False means the lease was lost: the caller's work must not be recorded.
export async function completeOutbox(
  pool: Pool,
  claim: OutboxClaim,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update outbox set dispatched_at = now(), lease_until = null
     where event_id = $1 and lease_owner = $2 and lease_generation = $3
       and dispatched_at is null and dead_at is null`,
    [claim.eventId, claim.owner, claim.generation],
  );
  return rowCount === 1;
}

// Leaves the entry for a later retry, or dead-letters it once the attempt
// budget is spent. A dead entry stays in the table; it is never deleted.
export async function failOutbox(
  pool: Pool,
  claim: OutboxClaim,
  error: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update outbox
     set last_error = $4,
         dead_at = case when attempts >= $5 then now() end
     where event_id = $1 and lease_owner = $2 and lease_generation = $3
       and dispatched_at is null and dead_at is null`,
    [claim.eventId, claim.owner, claim.generation, error, MAX_OUTBOX_ATTEMPTS],
  );
  return rowCount === 1;
}
