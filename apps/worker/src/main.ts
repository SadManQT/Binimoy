import { hostname } from "node:os";
import {
  claudeAssessmentModel,
  fixtureAssessmentModel,
  runAssessmentJobs,
} from "@lp/adapters";
import { loadConfig } from "@lp/contracts";
import { beat, createPool } from "@lp/db";
import { expireInvoices, sweepPaymentEvents } from "@lp/db/ledger";
import { deliverOutbox } from "@lp/db/notices";
import { closeUnresolvedAiOnly, finalizeDecisions } from "@lp/db/review";
import {
  dispatchSettlements,
  mockTransferAdapter,
  reconcileOperations,
  refundOverdueDeliveries,
} from "@lp/db/settlement";
import { sweepVerifications } from "@lp/db/verification";

const config = loadConfig(process.env);
const pool = createPool(config.DATABASE_URL);
const workerId = `${hostname()}:${process.pid}`;
// PAYMENT_MODE can only be "mock", so this is the only adapter that exists.
const transfers = mockTransferAdapter(pool);
// A12: live mode without a key already failed at startup in loadConfig, so
// there is no silent fallback to the fixture here.
const assessmentModel =
  config.AI_MODE === "live" && config.MODEL_API_KEY
    ? claudeAssessmentModel(config.MODEL_API_KEY)
    : fixtureAssessmentModel();
const log = (level: string, msg: string, extra = {}) =>
  console.log(JSON.stringify({ level, msg, workerId, ...extra }));

// One failing job must not stop the others or the heartbeat.
async function step(name: string, job: () => Promise<number>) {
  try {
    const count = await job();
    if (count > 0) log("info", name, { count });
  } catch (error) {
    log("error", `${name}_failed`, { error: String(error) });
  }
}

let running = false;
async function tick() {
  // A slow tick must not overlap the next one.
  if (running) return;
  running = true;
  try {
    await step("heartbeat", async () => {
      await beat(pool, workerId);
      return 0;
    });
    await step("invoices_expired", () => expireInvoices(pool, config.APP_ENV));
    await step("payment_events_swept", () =>
      sweepPaymentEvents(pool, config.APP_ENV),
    );
    await step("no_delivery_refunds", () => refundOverdueDeliveries(pool));
    await step("decisions_finalized", () => finalizeDecisions(pool));
    await step("ai_only_closed_unresolved", () => closeUnresolvedAiOnly(pool));
    // Provider answers and objective-release windows, before anything is sent.
    await step("verifications_swept", () => sweepVerifications(pool));
    // Reconcile before dispatching: unfinished transfers come first.
    await step("operations_reconciled", () =>
      reconcileOperations(pool, transfers),
    );
    await step("settlements_dispatched", () =>
      dispatchSettlements(pool, transfers),
    );
    await step("assessments_run", () =>
      runAssessmentJobs(pool, assessmentModel),
    );
    // Recorded events become in-app notices.
    await step("outbox_dispatched", () => deliverOutbox(pool, workerId));
  } finally {
    running = false;
  }
}

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
