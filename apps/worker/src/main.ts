import { hostname } from "node:os";
import { loadConfig } from "@lp/contracts";
import { beat, createPool } from "@lp/db";

const config = loadConfig(process.env);
const pool = createPool(config.DATABASE_URL);
const workerId = `${hostname()}:${process.pid}`;
const log = (level: string, msg: string, extra = {}) =>
  console.log(JSON.stringify({ level, msg, workerId, ...extra }));

const tick = () =>
  beat(pool, workerId).catch((e) =>
    log("error", "heartbeat_failed", { error: String(e) }),
  );

await tick();
log("info", "worker_started", {
  appEnv: config.APP_ENV,
  paymentMode: config.PAYMENT_MODE,
});
const timer = setInterval(tick, 5000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    clearInterval(timer);
    await pool.end();
    process.exit(0);
  });
}
