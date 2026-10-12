import { heartbeatAgeSeconds, type Pool } from "@lp/db";

export type Health = {
  ready: boolean;
  db: "ok" | "unavailable";
  worker: "ok" | "not_seen";
  workerHeartbeatAgeSeconds: number | null;
};

const WORKER_STALE_SECONDS = 30;

export async function getHealth(pool: Pool): Promise<Health> {
  try {
    const age = await heartbeatAgeSeconds(pool);
    return {
      ready: true,
      db: "ok",
      worker: age !== null && age < WORKER_STALE_SECONDS ? "ok" : "not_seen",
      workerHeartbeatAgeSeconds: age,
    };
  } catch {
    return {
      ready: false,
      db: "unavailable",
      worker: "not_seen",
      workerHeartbeatAgeSeconds: null,
    };
  }
}
