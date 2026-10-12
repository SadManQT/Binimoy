import { z } from "zod";

// Spec A8. The actor is deliberately absent: identity and role come from the
// authenticated server session, so unknown keys such as `role` are stripped.
export const commandEnvelope = z.object({
  commandId: z.uuid(),
  idempotencyKey: z.string().min(8).max(200),
  dealId: z.uuid().optional(),
  expectedAggregateVersion: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown()),
});
export type CommandEnvelope = z.infer<typeof commandEnvelope>;

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "NOT_AUTHORIZED",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "ILLEGAL_TRANSITION",
  "COUNTERPARTY_MISSING",
  "INVITE_INVALID",
  "MISSING_CONSENT",
  "INCOMPLETE_DELIVERY",
  "VERIFICATION_UNKNOWN",
  "DISPUTE_OPEN",
  "INSUFFICIENT_HELD_FUNDS",
  "ADAPTER_PENDING",
  "TEST_MODE_REQUIRED",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// Spec A8 common event. `payload` never carries delivery plaintext.
export type DomainEvent = {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateVersion: number;
  actorRef: string;
  causationId: string;
  correlationId: string;
  occurredAt: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
};
