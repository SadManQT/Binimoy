import { afterAll, beforeAll, expect, test } from "vitest";
import { beat, heartbeatAgeSeconds } from "./index";
import { migrate } from "./migrate";
import { testPool } from "./testing";

const pool = await testPool();

beforeAll(async () => {
  await pool.query("drop schema lp_test cascade");
  await pool.query("create schema lp_test");
});
afterAll(() => pool.end());

test("test connections are confined to the test schema", async () => {
  const { rows } = await pool.query("select current_schema() as schema");
  expect(rows[0].schema).toBe("lp_test");
});

test("a pool survives the server killing its idle connection", async () => {
  const victim = await testPool();
  const { rows } = await victim.query("select pg_backend_pid() as pid");
  await pool.query("select pg_terminate_backend($1)", [rows[0].pid]);
  // Give the dropped socket time to surface as a pool 'error' event.
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect((await victim.query("select 1 as ok")).rows[0].ok).toBe(1);
  await victim.end();
});

test("two concurrent migrators apply each migration exactly once", async () => {
  const [a, b] = await Promise.all([migrate(pool), migrate(pool)]);
  expect([...a, ...b]).toEqual([
    "0001_worker_heartbeat.sql",
    "0002_enable_rls.sql",
    "0003_command_kernel.sql",
    "0004_auth_and_consent.sql",
    "0005_agreements.sql",
    "0006_ledger.sql",
    "0007_idle_transaction_timeout.sql",
    "0008_vault_room.sql",
    "0009_delivery_settlement.sql",
  ]);
  expect(await migrate(pool)).toEqual([]);
});

// Read from the catalog, not from this session: pooled sessions opened before
// the migration keep their old value until they are recycled.
test("a transaction abandoned by a dead process is ended by the server", async () => {
  const { rows } = await pool.query(
    "select rolconfig from pg_roles where rolname = current_user",
  );
  expect(rows[0].rolconfig).toContain(
    "idle_in_transaction_session_timeout=30s",
  );
});

// On Supabase, a table without RLS is readable and writable through the Data
// API with the public anon key. The app connects as the table owner, which
// bypasses RLS, so RLS with no policies closes that door without affecting it.
test("every table has row level security enabled", async () => {
  const { rows } = await pool.query(
    `select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = current_schema() and c.relkind = 'r' and not c.relrowsecurity`,
  );
  expect(rows.map((r) => r.relname)).toEqual([]);
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
