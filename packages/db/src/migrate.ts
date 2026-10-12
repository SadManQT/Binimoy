import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool } from "./index";

const DIR = fileURLToPath(new URL("../migrations/", import.meta.url));
const LOCK_KEY = 4771001;

export async function migrate(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    // Session lock: a second migrator waits here, then finds nothing left to apply.
    // Needs a session-mode or direct connection; a transaction-mode pooler drops it.
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    await client.query(
      "alter table schema_migrations enable row level security",
    );
    const done = new Set(
      (await client.query("select name from schema_migrations")).rows.map(
        (r) => r.name as string,
      ),
    );
    const applied: string[] = [];
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(DIR + file, "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [
          file,
        ]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      applied.push(file);
    }
    return applied;
  } finally {
    await client
      .query("select pg_advisory_unlock($1)", [LOCK_KEY])
      .catch(() => {});
    client.release();
  }
}
