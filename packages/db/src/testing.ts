import { createPool, type Pool } from "./index";

const SCHEMA = "lp_test";

// Tests drop tables, so every test connection is confined to its own schema.
// Unqualified names can then never resolve to the application's tables.
export async function testPool(): Promise<Pool> {
  // `||`, not `??`: an empty `TEST_DATABASE_URL=` line in .env means unset.
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set DATABASE_URL (or TEST_DATABASE_URL) in .env to run integration tests.",
    );
  }
  const pool = createPool(url);
  pool.on("connect", (client) => {
    client.query(`set search_path to ${SCHEMA}`);
  });
  await pool.query(`create schema if not exists ${SCHEMA}`);
  return pool;
}
