import pg from "pg";

export type Pool = pg.Pool;

export const createPool = (connectionString: string): Pool =>
  new pg.Pool({ connectionString });

// ponytail: one row per worker process, never pruned. LP-005 replaces this with leased jobs.
export async function beat(pool: Pool, workerId: string): Promise<void> {
  await pool.query(
    `insert into worker_heartbeat (worker_id, beat_at) values ($1, now())
     on conflict (worker_id) do update set beat_at = now()`,
    [workerId],
  );
}

export async function heartbeatAgeSeconds(pool: Pool): Promise<number | null> {
  const { rows } = await pool.query(
    "select extract(epoch from now() - max(beat_at))::float8 as age from worker_heartbeat",
  );
  return rows[0]?.age ?? null;
}
