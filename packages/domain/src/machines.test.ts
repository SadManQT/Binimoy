import { expect, test } from "vitest";
import { type AggregateType, checkTransition, MACHINES } from "./machines";

// The state lists of spec D.3, copied here so a silent edit to a machine fails.
const SPEC_STATES: Record<AggregateType, string[]> = {
  agreement: [
    "DRAFT",
    "AWAITING_ACCEPTANCE",
    "ACCEPTED",
    "SUPERSEDED",
    "CANCELLED",
    "EXPIRED",
  ],
  funding_invoice: [
    "CREATED",
    "PENDING",
    "CONFIRMED",
    "EXPIRED",
    "CANCELLED",
    "RECONCILIATION_REQUIRED",
  ],
  delivery: ["DRAFT", "SUBMITTED", "SUPERSEDED"],
  inspection_item: [
    "NOT_STARTED",
    "PENDING",
    "PASSED",
    "FAILED",
    "UNKNOWN",
    "STALE",
  ],
  dispute: [
    "OPEN",
    "QUEUED",
    "ASSIGNED",
    "REVIEWING",
    "DECIDED_AWAITING_APPEAL",
    "APPEALED",
    "RESOLVED",
    "UNRESOLVED_CLOSED",
  ],
  authorization: [
    "CREATED",
    "RESERVED",
    "INVALIDATED",
    "EXPIRED",
    "DISPATCH_COMMITTED",
    "CONSUMED",
  ],
  adapter_operation: [
    "NOT_SENT",
    "DISPATCH_COMMITTED",
    "PENDING",
    "SUCCEEDED",
    "FAILED_FINAL",
    "UNKNOWN",
    "CANCELLED_CONFIRMED",
  ],
  notice: ["QUEUED", "SENT", "DELIVERED", "FAILED", "ACKNOWLEDGED"],
};

const types = Object.keys(SPEC_STATES) as AggregateType[];

test.each(types)("%s has exactly the D.3 states", (type) => {
  expect([...MACHINES[type].states].sort()).toEqual(
    [...SPEC_STATES[type]].sort(),
  );
});

test.each(types)("%s transitions only use declared states", (type) => {
  const machine = MACHINES[type];
  const states: readonly string[] = machine.states;
  expect(states).toContain(machine.initial);
  for (const row of machine.transitions) {
    for (const state of [...row.from, ...row.to]) {
      expect(states, `${row.command} uses ${state}`).toContain(state);
    }
    expect(row.actors.length, row.command).toBeGreaterThan(0);
  }
});

test.each(types)(
  "every %s state is reachable from the initial state",
  (type) => {
    const machine = MACHINES[type];
    const seen = new Set<string>([machine.initial]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const row of machine.transitions) {
        if (!row.from.some((s) => seen.has(s))) continue;
        for (const to of row.to) {
          if (!seen.has(to)) {
            seen.add(to);
            grew = true;
          }
        }
      }
    }
    expect([...seen].sort()).toEqual([...machine.states].sort());
  },
);

const outgoing = (type: AggregateType, state: string) =>
  MACHINES[type].transitions.filter((row) =>
    (row.from as readonly string[]).includes(state),
  );

test("final adapter results never regress (V7-07)", () => {
  for (const state of ["SUCCEEDED", "FAILED_FINAL", "CANCELLED_CONFIRMED"]) {
    expect(outgoing("adapter_operation", state)).toEqual([]);
  }
});

test("an accepted agreement cannot be edited back into a draft (INV-01)", () => {
  const targets = outgoing("agreement", "ACCEPTED").flatMap((r) => r.to);
  expect(targets).not.toContain("DRAFT");
  expect(targets).not.toContain("AWAITING_ACCEPTANCE");
});

test("a dead authorization can never be dispatched", () => {
  for (const state of ["INVALIDATED", "EXPIRED", "CONSUMED"]) {
    expect(outgoing("authorization", state)).toEqual([]);
  }
});

test("a legal transition by an allowed role succeeds", () => {
  expect(
    checkTransition("delivery", "DRAFT", "SubmitDelivery", ["seller"]),
  ).toEqual({
    ok: true,
    to: "SUBMITTED",
  });
});

test("a command that does not apply in the current state is illegal", () => {
  expect(
    checkTransition("delivery", "SUBMITTED", "SubmitDelivery", ["seller"]),
  ).toEqual({ ok: false, error: "ILLEGAL_TRANSITION" });
  expect(
    checkTransition(
      "inspection_item",
      "NOT_STARTED",
      "RecordInspection",
      ["buyer"],
      "PASSED",
    ),
  ).toEqual({ ok: false, error: "ILLEGAL_TRANSITION" });
});

test("an unknown command is illegal, not a crash", () => {
  expect(
    checkTransition("delivery", "DRAFT", "ReleaseAllMoney", ["seller"]),
  ).toEqual({
    ok: false,
    error: "ILLEGAL_TRANSITION",
  });
});

test("the wrong role is refused even when the transition exists", () => {
  expect(
    checkTransition("delivery", "DRAFT", "SubmitDelivery", ["buyer"]),
  ).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
  expect(
    checkTransition("dispute", "QUEUED", "ClaimReview", ["buyer", "seller"]),
  ).toEqual({
    ok: false,
    error: "NOT_AUTHORIZED",
  });
});

test("no party can issue a system-only financial transition", () => {
  for (const row of [
    ...MACHINES.authorization.transitions,
    ...MACHINES.adapter_operation.transitions,
  ]) {
    expect(row.actors, row.command).toEqual(["system"]);
  }
  expect(
    checkTransition("funding_invoice", "PENDING", "ConfirmFunding", ["buyer"]),
  ).toEqual({ ok: false, error: "NOT_AUTHORIZED" });
});

test("a multi-outcome command needs an explicit, allowed target", () => {
  expect(
    checkTransition("inspection_item", "PENDING", "RecordInspection", [
      "buyer",
    ]),
  ).toEqual({ ok: false, error: "ILLEGAL_TRANSITION" });
  expect(
    checkTransition(
      "inspection_item",
      "PENDING",
      "RecordInspection",
      ["buyer"],
      "UNKNOWN",
    ),
  ).toEqual({ ok: true, to: "UNKNOWN" });
  expect(
    checkTransition(
      "inspection_item",
      "PENDING",
      "RecordInspection",
      ["buyer"],
      "STALE",
    ),
  ).toEqual({ ok: false, error: "ILLEGAL_TRANSITION" });
});
