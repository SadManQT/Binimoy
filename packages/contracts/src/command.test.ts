import { expect, test } from "vitest";
import { commandEnvelope, ERROR_CODES } from "./command";

const valid = {
  commandId: "7d1f3f7e-5a0c-4d5b-9a53-0a4b4a5b6c7d",
  idempotencyKey: "accept-agreement-0001",
  dealId: "0b9a3d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e",
  expectedAggregateVersion: 1,
  payload: { note: "ok" },
};

test("accepts a well-formed envelope", () => {
  expect(commandEnvelope.safeParse(valid).success).toBe(true);
});

test("drops a client-supplied role or actor: identity comes from the session", () => {
  const parsed = commandEnvelope.parse({
    ...valid,
    role: "reviewer",
    actor: "someone-else",
  });
  expect(parsed).not.toHaveProperty("role");
  expect(parsed).not.toHaveProperty("actor");
});

test.each([
  ["non-uuid commandId", { commandId: "abc" }],
  ["short idempotency key", { idempotencyKey: "x" }],
  ["negative version", { expectedAggregateVersion: -1 }],
  ["fractional version", { expectedAggregateVersion: 1.5 }],
  ["array payload", { payload: [1, 2] }],
  ["missing payload", { payload: undefined }],
])("rejects %s", (_name, patch) => {
  expect(commandEnvelope.safeParse({ ...valid, ...patch }).success).toBe(false);
});

test("the stable error codes named in spec A8 and D.4 all exist", () => {
  for (const code of [
    "VERSION_CONFLICT",
    "NOT_AUTHORIZED",
    "MISSING_CONSENT",
    "INCOMPLETE_DELIVERY",
    "VERIFICATION_UNKNOWN",
    "DISPUTE_OPEN",
    "INSUFFICIENT_HELD_FUNDS",
    "ADAPTER_PENDING",
    "TEST_MODE_REQUIRED",
    "IDEMPOTENCY_CONFLICT",
  ]) {
    expect(ERROR_CODES).toContain(code);
  }
});
