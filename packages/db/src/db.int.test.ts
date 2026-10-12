import { afterAll, beforeAll, expect, test } from "vitest";
import { beat, heartbeatAgeSeconds } from "./index";
import { migrate } from "./migrate";
import { testPool } from "./testing";

const pool = await testPool();

beforeAll(async () => {
  await pool.query("drop table if exists worker_heartbeat, schema_migrations");
});
afterAll(() => pool.end());

test("test connections are confined to the test schema", async () => {
  const { rows } = await pool.query("select current_schema() as schema");
  expect(rows[0].schema).toBe("lp_test");
});

test("two concurrent migrators apply each migration exactly once", async () => {
  const [a, b] = await Promise.all([migrate(pool), migrate(pool)]);
  expect([...a, ...b]).toEqual(["0001_worker_heartbeat.sql"]);
  expect(await migrate(pool)).toEqual([]);
});

test("heartbeat age is null before any beat and small after one", async () => {
  expect(await heartbeatAgeSeconds(pool)).toBeNull();
  await beat(pool, "test-worker");
  await beat(pool, "test-worker");
  const age = await heartbeatAgeSeconds(pool);
  expect(age).not.toBeNull();
  expect(age as number).toBeLessThan(5);
  const { rows } = await pool.query(
    "select count(*)::int as n from worker_heartbeat",
  );
  expect(rows[0].n).toBe(1);
});
