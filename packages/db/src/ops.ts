import type { PoolClient } from "pg";
import type { Pool } from "./index";

// Spec D.13: an operator can pause new funding, undispatched settlement,
// research or AI processing, each on its own. A pause never hides state:
// reading, status and dispute intake keep working.

export const PAUSE_KINDS = ["funding", "settlement", "research", "ai"] as const;
export type PauseKind = (typeof PAUSE_KINDS)[number];

export async function isPaused(
  client: Pool | PoolClient,
  kind: PauseKind,
): Promise<boolean> {
  const { rowCount } = await client.query(
    "select 1 from ops_pause where kind = $1",
    [kind],
  );
  return rowCount === 1;
}

// Called by the operator tool, never by a request handler. Every call is
// recorded with who and why, including a resume of something not paused.
export async function setPause(
  pool: Pool,
  input: { kind: PauseKind; paused: boolean; actor: string; reason: string },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (input.paused) {
      await client.query(
        `insert into ops_pause (kind, paused_by, reason) values ($1, $2, $3)
         on conflict (kind) do nothing`,
        [input.kind, input.actor, input.reason],
      );
    } else {
      await client.query("delete from ops_pause where kind = $1", [input.kind]);
    }
    await client.query(
      "insert into ops_audit (kind, action, actor, reason) values ($1, $2, $3, $4)",
      [
        input.kind,
        input.paused ? "pause" : "resume",
        input.actor,
        input.reason,
      ],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// What an operator needs to see before resuming anything (D.13).
export async function getOps(pool: Pool) {
  const pauses = await pool.query(
    "select kind, paused_by, reason, paused_at from ops_pause",
  );
  const audit = await pool.query(
    "select kind, action, actor, reason, occurred_at from ops_audit order by id desc limit 50",
  );
  const { rows } = await pool.query(
    `select
       (select count(*)::int from outbox where dispatched_at is null and dead_at is null) as outbox_pending,
       (select extract(epoch from now() - min(created_at))::float8 from outbox
        where dispatched_at is null and dead_at is null) as outbox_oldest_seconds,
       (select count(*)::int from outbox where dead_at is not null) as outbox_dead,
       (select count(*)::int from adapter_operation o join aggregate a on a.id = o.operation_id
        where a.state in ('DISPATCH_COMMITTED', 'PENDING', 'UNKNOWN')) as operations_unreconciled,
       (select count(*)::int from settlement_authorization s join aggregate a on a.id = s.authorization_id
        where a.state = 'RESERVED') as settlements_waiting,
       (select count(*)::int from ai_job where status in ('QUEUED', 'RUNNING')) as ai_jobs_open`,
  );
  const paused: Partial<
    Record<PauseKind, { by: string; reason: string; at: string }>
  > = {};
  for (const row of pauses.rows) {
    paused[row.kind as PauseKind] = {
      by: row.paused_by,
      reason: row.reason,
      at: (row.paused_at as Date).toISOString(),
    };
  }
  return {
    paused,
    outboxPending: rows[0].outbox_pending as number,
    outboxOldestSeconds: rows[0].outbox_oldest_seconds as number | null,
    outboxDead: rows[0].outbox_dead as number,
    operationsUnreconciled: rows[0].operations_unreconciled as number,
    settlementsWaiting: rows[0].settlements_waiting as number,
    aiJobsOpen: rows[0].ai_jobs_open as number,
    audit: audit.rows.map((a) => ({
      kind: a.kind as string,
      action: a.action as "pause" | "resume",
      actor: a.actor as string,
      reason: a.reason as string,
      at: (a.occurred_at as Date).toISOString(),
    })),
  };
}
