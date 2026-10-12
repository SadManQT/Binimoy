import { beat, createPool } from "@lp/db";
import { migrate } from "@lp/db/migrate";
import { testPool } from "@lp/db/testing";
import { afterAll, beforeAll, expect, test } from "vitest";
import { getHealth } from "./health";

const pool = await testPool();
beforeAll(async () => {
  await migrate(pool);
  await pool.query("delete from worker_heartbeat");
});
afterAll(() => pool.end());

test("database up, no worker yet: ready but worker not seen", async () => {
  expect(await getHealth(pool)).toEqual({
    ready: true,
    db: "ok",
    worker: "not_seen",
    workerHeartbeatAgeSeconds: null,
  });
});

test("fresh heartbeat reports the worker as ok", async () => {
  await beat(pool, "health-test");
  expect((await getHealth(pool)).worker).toBe("ok");
});

test("stale heartbeat reports the worker as not seen", async () => {
  await pool.query(
    "update worker_heartbeat set beat_at = now() - interval '5 minutes'",
  );
  const health = await getHealth(pool);
  expect(health.worker).toBe("not_seen");
  expect(health.workerHeartbeatAgeSeconds).toBeGreaterThan(200);
});

test("database unreachable: not ready, never a healthy answer", async () => {
  const dead = createPool("postgres://lp:lp@127.0.0.1:1/lp");
  expect(await getHealth(dead)).toEqual({
    ready: false,
    db: "unavailable",
    worker: "not_seen",
    workerHeartbeatAgeSeconds: null,
  });
  await dead.end();
});
