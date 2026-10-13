import { expect, test } from "vitest";
import { type DealSnapshot, nextStep } from "./next-step";

const base: DealSnapshot = {
  myRole: "buyer",
  parties: 2,
  agreementState: "ACCEPTED",
  acceptedByMe: true,
  funded: true,
  package: null,
  settlement: null,
  disputeOpen: false,
};
const pkg = (states: string[], accepted = false) => ({
  accepted,
  mandatory: states,
});
const done = (snapshot: DealSnapshot) =>
  nextStep(snapshot)
    .steps.filter((s) => s.state === "done")
    .map((s) => s.key);

test("each side is told its own next action, never the other side's", () => {
  expect(
    nextStep({ ...base, parties: 1, agreementState: "DRAFT" }).text,
  ).toMatch(/ইনভাইট/);
  const waiting = {
    ...base,
    agreementState: "AWAITING_ACCEPTANCE",
    funded: false,
  };
  expect(nextStep({ ...waiting, acceptedByMe: false }).text).toMatch(
    /সম্মতি দিন/,
  );
  expect(nextStep({ ...waiting, acceptedByMe: true }).text).toMatch(
    /অন্য পক্ষের/,
  );
  const unfunded = { ...base, funded: false };
  expect(nextStep(unfunded).text).toMatch(/টাকা জমা দিন/);
  expect(nextStep({ ...unfunded, myRole: "seller" }).text).toMatch(/অপেক্ষা/);
  expect(nextStep({ ...base, myRole: "seller" }).text).toMatch(
    /ডেলিভারি জমা দিন/,
  );
  expect(nextStep(base).text).toMatch(/অপেক্ষা/);
  const checking = { ...base, package: pkg(["PASSED", "PENDING"]) };
  expect(nextStep(checking).text).toMatch(/চেক করুন/);
  expect(nextStep({ ...checking, myRole: "seller" }).text).toMatch(/অপেক্ষা/);
  expect(
    nextStep({ ...base, package: pkg(["PASSED", "PASSED"]) }).text,
  ).toMatch(/গ্রহণ/);
});

test("C36.3: a transfer that is not final is never described as complete", () => {
  const accepted = { ...base, package: pkg(["PASSED"], true) };
  for (const state of [
    "NOT_SENT",
    "DISPATCH_COMMITTED",
    "PENDING",
    "UNKNOWN",
  ]) {
    const step = nextStep({ ...accepted, settlement: { operations: [state] } });
    expect(step.text, state).toMatch(/চূড়ান্ত নয়/);
    const english = nextStep(
      { ...accepted, settlement: { operations: [state] } },
      "en",
    );
    expect(english.text, state).toMatch(/not final/);
    expect(english.text, state).not.toMatch(/complete/i);
    expect(
      done(accepted && { ...accepted, settlement: { operations: [state] } }),
    ).not.toContain("settled");
  }
  const paid = nextStep({
    ...accepted,
    settlement: { operations: ["SUCCEEDED"] },
  });
  expect(paid.text).toMatch(/সম্পন্ন/);
  expect(paid.steps.every((s) => s.state === "done")).toBe(true);
  // A final failure is not a success either.
  expect(
    nextStep({ ...accepted, settlement: { operations: ["FAILED_FINAL"] } })
      .text,
  ).toMatch(/ব্যর্থ/);
});

test("an open dispute comes before everything else, and a failed or unknown check is not progress", () => {
  expect(
    nextStep({ ...base, package: pkg(["PASSED"]), disputeOpen: true }).text,
  ).toMatch(/ডিসপিউট/);
  expect(done({ ...base, package: pkg(["PASSED", "UNKNOWN"]) })).toEqual([
    "agreed",
    "funded",
    "delivered",
  ]);
  expect(done({ ...base, package: pkg(["PASSED", "FAILED"]) })).not.toContain(
    "inspected",
  );
  expect(
    nextStep({ ...base, agreementState: "WITHDRAWN", funded: false }).text,
  ).toMatch(/চালু নেই/);
});
