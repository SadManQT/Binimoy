import { createHmac } from "node:crypto";
import { loadConfig } from "@lp/contracts";

// ponytail: the synthetic provider's signing secret is derived from
// AUTH_SECRET instead of being its own variable. A real provider would issue
// its own secret; none is registered in this release.
export const mockWebhookSecret = () =>
  createHmac("sha256", loadConfig(process.env).AUTH_SECRET)
    .update("mock-payment-webhook")
    .digest("hex");
