// Spec D.3: one independent state machine per aggregate. A row says which
// command moves which states to which, and which roles may issue it. Guards
// beyond role and state (consent, funds, freshness) belong to the task that
// owns the command and run inside the same transaction.

export type Role =
  | "buyer"
  | "seller"
  | "reviewer"
  | "appeal_reviewer"
  | "approver"
  | "system";

type Row = {
  command: string;
  from: readonly string[];
  to: readonly string[];
  actors: readonly Role[];
};
type Machine = {
  initial: string;
  states: readonly string[];
  transitions: readonly Row[];
};

const PARTY = ["buyer", "seller"] as const;
const SYSTEM = ["system"] as const;

export const MACHINES = {
  agreement: {
    initial: "DRAFT",
    states: [
      "DRAFT",
      "AWAITING_ACCEPTANCE",
      "ACCEPTED",
      "SUPERSEDED",
      "CANCELLED",
      "EXPIRED",
    ],
    transitions: [
      {
        command: "ProposeAgreement",
        from: ["DRAFT"],
        to: ["AWAITING_ACCEPTANCE"],
        actors: PARTY,
      },
      {
        command: "ReviseAgreement",
        from: ["AWAITING_ACCEPTANCE"],
        to: ["DRAFT"],
        actors: PARTY,
      },
      // First acceptance stays AWAITING_ACCEPTANCE; the second makes it ACCEPTED.
      {
        command: "AcceptAgreement",
        from: ["AWAITING_ACCEPTANCE"],
        to: ["AWAITING_ACCEPTANCE", "ACCEPTED"],
        actors: PARTY,
      },
      // From ACCEPTED only while unfunded; the owning task enforces that guard.
      {
        command: "WithdrawAgreement",
        from: ["DRAFT", "AWAITING_ACCEPTANCE", "ACCEPTED"],
        to: ["CANCELLED"],
        actors: PARTY,
      },
      {
        command: "ExpireAgreement",
        from: ["DRAFT", "AWAITING_ACCEPTANCE"],
        to: ["EXPIRED"],
        actors: SYSTEM,
      },
      // A committed amendment replaces the snapshot; the old one is never edited.
      {
        command: "SupersedeAgreement",
        from: ["ACCEPTED"],
        to: ["SUPERSEDED"],
        actors: SYSTEM,
      },
    ],
  },
  funding_invoice: {
    initial: "CREATED",
    states: [
      "CREATED",
      "PENDING",
      "CONFIRMED",
      "EXPIRED",
      "CANCELLED",
      "RECONCILIATION_REQUIRED",
    ],
    transitions: [
      {
        command: "FundTestDeal",
        from: ["CREATED"],
        to: ["PENDING"],
        actors: ["buyer"],
      },
      // INV-02: only an authenticated adapter fact confirms funding.
      {
        command: "ConfirmFunding",
        from: ["PENDING"],
        to: ["CONFIRMED"],
        actors: SYSTEM,
      },
      {
        command: "FlagFundingMismatch",
        from: ["CREATED", "PENDING"],
        to: ["RECONCILIATION_REQUIRED"],
        actors: SYSTEM,
      },
      {
        command: "ExpireInvoice",
        from: ["CREATED", "PENDING"],
        to: ["EXPIRED"],
        actors: SYSTEM,
      },
      {
        command: "CancelInvoice",
        from: ["CREATED", "PENDING"],
        to: ["CANCELLED"],
        actors: SYSTEM,
      },
      {
        command: "ResolveFundingReconciliation",
        from: ["RECONCILIATION_REQUIRED"],
        to: ["CONFIRMED", "CANCELLED"],
        actors: SYSTEM,
      },
    ],
  },
  delivery: {
    initial: "DRAFT",
    states: ["DRAFT", "SUBMITTED", "SUPERSEDED"],
    transitions: [
      {
        command: "SubmitDelivery",
        from: ["DRAFT"],
        to: ["SUBMITTED"],
        actors: ["seller"],
      },
      // The replacement is a new package version; this one is only marked superseded.
      {
        command: "ReplaceDelivery",
        from: ["SUBMITTED"],
        to: ["SUPERSEDED"],
        actors: ["seller"],
      },
    ],
  },
  inspection_item: {
    initial: "NOT_STARTED",
    states: ["NOT_STARTED", "PENDING", "PASSED", "FAILED", "UNKNOWN", "STALE"],
    transitions: [
      {
        command: "StartInspection",
        from: ["NOT_STARTED", "FAILED", "UNKNOWN", "STALE"],
        to: ["PENDING"],
        actors: ["buyer", "system"],
      },
      {
        command: "RecordInspection",
        from: ["PENDING"],
        to: ["PASSED", "FAILED", "UNKNOWN"],
        actors: ["buyer", "system"],
      },
      // INV-07: a replacement or expired proof invalidates dependent results.
      {
        command: "InvalidateInspection",
        from: ["PENDING", "PASSED", "FAILED", "UNKNOWN"],
        to: ["STALE"],
        actors: SYSTEM,
      },
    ],
  },
  dispute: {
    initial: "OPEN",
    states: [
      "OPEN",
      "QUEUED",
      "ASSIGNED",
      "REVIEWING",
      "DECIDED_AWAITING_APPEAL",
      "APPEALED",
      "RESOLVED",
      "UNRESOLVED_CLOSED",
    ],
    transitions: [
      {
        command: "RequestReview",
        from: ["OPEN"],
        to: ["QUEUED"],
        actors: ["buyer", "seller", "system"],
      },
      {
        command: "ClaimReview",
        from: ["QUEUED"],
        to: ["ASSIGNED"],
        actors: ["reviewer"],
      },
      {
        command: "StartReview",
        from: ["ASSIGNED"],
        to: ["REVIEWING"],
        actors: ["reviewer"],
      },
      {
        command: "ReleaseAssignment",
        from: ["ASSIGNED", "REVIEWING"],
        to: ["QUEUED"],
        actors: ["reviewer", "system"],
      },
      {
        command: "ProposeResolution",
        from: ["REVIEWING"],
        to: ["DECIDED_AWAITING_APPEAL"],
        actors: ["reviewer"],
      },
      {
        command: "AppealDecision",
        from: ["DECIDED_AWAITING_APPEAL"],
        to: ["APPEALED"],
        actors: PARTY,
      },
      // A revised decision returns to DECIDED_AWAITING_APPEAL and restarts its window.
      {
        command: "DecideAppeal",
        from: ["APPEALED"],
        to: ["DECIDED_AWAITING_APPEAL", "RESOLVED", "UNRESOLVED_CLOSED"],
        actors: ["appeal_reviewer"],
      },
      // Appeal window elapsed, or both parties waived it.
      {
        command: "FinalizeDecision",
        from: ["DECIDED_AWAITING_APPEAL"],
        to: ["RESOLVED"],
        actors: SYSTEM,
      },
      // Mutual resolution: stays put on the first consent, resolves on the second.
      {
        command: "AcceptResolution",
        from: ["OPEN", "QUEUED", "ASSIGNED", "REVIEWING"],
        to: ["OPEN", "QUEUED", "ASSIGNED", "REVIEWING", "RESOLVED"],
        actors: PARTY,
      },
      {
        command: "CloseUnresolved",
        from: ["OPEN", "QUEUED", "REVIEWING"],
        to: ["UNRESOLVED_CLOSED"],
        actors: ["reviewer", "system"],
      },
      // New material evidence may reopen an unresolved case.
      {
        command: "ReopenDispute",
        from: ["UNRESOLVED_CLOSED"],
        to: ["OPEN"],
        actors: PARTY,
      },
    ],
  },
  authorization: {
    initial: "CREATED",
    states: [
      "CREATED",
      "RESERVED",
      "INVALIDATED",
      "EXPIRED",
      "DISPATCH_COMMITTED",
      "CONSUMED",
    ],
    transitions: [
      {
        command: "ReserveFunds",
        from: ["CREATED"],
        to: ["RESERVED"],
        actors: SYSTEM,
      },
      {
        command: "InvalidateAuthorization",
        from: ["CREATED", "RESERVED"],
        to: ["INVALIDATED"],
        actors: SYSTEM,
      },
      {
        command: "ExpireAuthorization",
        from: ["CREATED", "RESERVED"],
        to: ["EXPIRED"],
        actors: SYSTEM,
      },
      // D.5 linearization point shared with disputes and amendments.
      {
        command: "DispatchSettlement",
        from: ["RESERVED"],
        to: ["DISPATCH_COMMITTED"],
        actors: SYSTEM,
      },
      {
        command: "ConsumeAuthorization",
        from: ["DISPATCH_COMMITTED"],
        to: ["CONSUMED"],
        actors: SYSTEM,
      },
    ],
  },
  adapter_operation: {
    initial: "NOT_SENT",
    states: [
      "NOT_SENT",
      "DISPATCH_COMMITTED",
      "PENDING",
      "SUCCEEDED",
      "FAILED_FINAL",
      "UNKNOWN",
      "CANCELLED_CONFIRMED",
    ],
    transitions: [
      {
        command: "CommitDispatch",
        from: ["NOT_SENT"],
        to: ["DISPATCH_COMMITTED"],
        actors: SYSTEM,
      },
      {
        command: "RecordAdapterResult",
        from: ["DISPATCH_COMMITTED", "PENDING", "UNKNOWN"],
        to: [
          "PENDING",
          "SUCCEEDED",
          "FAILED_FINAL",
          "UNKNOWN",
          "CANCELLED_CONFIRMED",
        ],
        actors: SYSTEM,
      },
    ],
  },
  notice: {
    initial: "QUEUED",
    states: ["QUEUED", "SENT", "DELIVERED", "FAILED", "ACKNOWLEDGED"],
    transitions: [
      {
        command: "SendNotice",
        from: ["QUEUED"],
        to: ["SENT", "FAILED"],
        actors: SYSTEM,
      },
      {
        command: "RecordNoticeDelivery",
        from: ["SENT"],
        to: ["DELIVERED", "FAILED"],
        actors: SYSTEM,
      },
      {
        command: "RetryNotice",
        from: ["FAILED"],
        to: ["QUEUED"],
        actors: SYSTEM,
      },
      // Delivery or acknowledgment is not agreement acceptance.
      {
        command: "AcknowledgeNotice",
        from: ["SENT", "DELIVERED"],
        to: ["ACKNOWLEDGED"],
        actors: PARTY,
      },
    ],
  },
} as const satisfies Record<string, Machine>;

export type AggregateType = keyof typeof MACHINES;

export type TransitionResult =
  | { ok: true; to: string }
  | { ok: false; error: "ILLEGAL_TRANSITION" | "NOT_AUTHORIZED" };

export function checkTransition(
  type: AggregateType,
  state: string,
  command: string,
  roles: readonly Role[],
  to?: string,
): TransitionResult {
  const machine: Machine = MACHINES[type];
  const rows = machine.transitions.filter(
    (row) => row.command === command && row.from.includes(state),
  );
  if (rows.length === 0) return { ok: false, error: "ILLEGAL_TRANSITION" };
  const allowed = rows.filter((row) =>
    row.actors.some((a) => roles.includes(a)),
  );
  if (allowed.length === 0) return { ok: false, error: "NOT_AUTHORIZED" };
  const targets = [...new Set(allowed.flatMap((row) => row.to))];
  const target = to ?? (targets.length === 1 ? targets[0] : undefined);
  if (target === undefined || !targets.includes(target)) {
    return { ok: false, error: "ILLEGAL_TRANSITION" };
  }
  return { ok: true, to: target };
}
