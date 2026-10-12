import { heartbeatAgeSeconds, type Pool } from "@lp/db";
import { getOps } from "@lp/db/ops";

// D.13: what an operator or a monitor needs at a glance. Counts and ages
// only; nothing here identifies a user or a deal.
export type Health = {
  ready: boolean;
  db: "ok" | "unavailable";
  worker: "ok" | "not_seen";
  workerHeartbeatAgeSeconds: number | null;
  paused: string[];
  outboxPending: number | null;
  outboxOldestSeconds: number | null;
  outboxDead: number | null;
  operationsUnreconciled: number | null;
  settlementsWaiting: number | null;
};

const WORKER_STALE_SECONDS = 30;

export async function getHealth(pool: Pool): Promise<Health> {
  try {
    const age = await heartbeatAgeSeconds(pool);
    const ops = await getOps(pool);
    return {
      ready: true,
      db: "ok",
      worker: age !== null && age < WORKER_STALE_SECONDS ? "ok" : "not_seen",
      workerHeartbeatAgeSeconds: age,
      paused: Object.keys(ops.paused),
      outboxPending: ops.outboxPending,
      outboxOldestSeconds: ops.outboxOldestSeconds,
      outboxDead: ops.outboxDead,
      operationsUnreconciled: ops.operationsUnreconciled,
      settlementsWaiting: ops.settlementsWaiting,
    };
  } catch {
    return {
      ready: false,
      db: "unavailable",
      worker: "not_seen",
      workerHeartbeatAgeSeconds: null,
      paused: [],
      outboxPending: null,
      outboxOldestSeconds: null,
      outboxDead: null,
      operationsUnreconciled: null,
      settlementsWaiting: null,
    };
  }
}
