import { userInfo } from "node:os";
import { createPool } from "./index";
import { getOps, PAUSE_KINDS, type PauseKind, setPause } from "./ops";

// Operator tool (D.13): emergency pauses are set here, never through the app.
//   pnpm ops status
//   pnpm ops pause <funding|settlement|research|ai> "<reason>"
//   pnpm ops resume <funding|settlement|research|ai> "<reason>"
const [action, kind, reason] = process.argv.slice(2);
const usage = () => {
  console.error(
    `Usage: pnpm ops status | pause <${PAUSE_KINDS.join("|")}> "<reason>" | resume <kind> "<reason>"`,
  );
  process.exit(1);
};
if (!action || !process.env.DATABASE_URL) usage();

const pool = createPool(process.env.DATABASE_URL as string);
try {
  if (action === "pause" || action === "resume") {
    if (!PAUSE_KINDS.includes(kind as PauseKind) || !reason) usage();
    await setPause(pool, {
      kind: kind as PauseKind,
      paused: action === "pause",
      actor: `operator:${userInfo().username}`,
      reason: reason as string,
    });
  } else if (action !== "status") {
    usage();
  }
  const ops = await getOps(pool);
  // Before resuming settlement, look at operationsUnreconciled: the worker
  // reconciles those first; nothing is re-sent under a new key.
  console.log(
    JSON.stringify({ ...ops, audit: ops.audit.slice(0, 5) }, null, 2),
  );
} finally {
  await pool.end();
}
