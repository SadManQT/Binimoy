import { expect, test } from "vitest";
import { type Assessment, validateAssessment } from "./assessment";

const manifest = [
  "msg:m1:v1",
  "msg:m2:v2",
  "inspection:activation_works",
  "dispute",
];
const good = (): Assessment => ({
  establishedFacts: [
    {
      text: "The activation check is recorded as failed.",
      evidence: ["inspection:activation_works"],
    },
  ],
  partyClaims: [
    {
      party: "buyer",
      text: "Says the key does not activate.",
      evidence: ["msg:m1:v1"],
    },
    {
      party: "seller",
      text: "Says the key was valid when sent.",
      evidence: ["msg:m2:v2"],
    },
  ],
  contradictions: [
    {
      text: "The two accounts of the key's validity differ.",
      evidence: ["msg:m1:v1", "msg:m2:v2"],
    },
  ],
  missingEvidence: [{ text: "No independent activation record." }],
  proposedNextStep: "PROVIDER_CHECK",
  nextStepReason: "An independent check would settle whether the key is valid.",
  coverageGaps: [],
});
const problems = (a: unknown) => {
  const result = validateAssessment(a, manifest);
  return result.ok ? [] : result.problems.map((p) => p.code);
};

test("a grounded assessment is accepted", () => {
  expect(validateAssessment(good(), manifest)).toEqual({
    ok: true,
    assessment: good(),
  });
});

test("a citation that was not in the supplied evidence is rejected (D.11)", () => {
  const a = good();
  a.partyClaims[0]?.evidence.push("msg:invented:v1");
  expect(problems(a)).toContain("UNKNOWN_EVIDENCE");
});

test("an established fact must cite evidence; a claim or contradiction must too", () => {
  const fact = good();
  if (fact.establishedFacts[0]) fact.establishedFacts[0].evidence = [];
  expect(problems(fact)).toContain("UNSUPPORTED_STATEMENT");
  const claim = good();
  if (claim.partyClaims[0]) claim.partyClaims[0].evidence = [];
  expect(problems(claim)).toContain("UNSUPPORTED_STATEMENT");
});

test("a party's message alone cannot be presented as an established fact (B4)", () => {
  const a = good();
  a.establishedFacts.push({
    text: "The key is valid.",
    evidence: ["msg:m2:v2"],
  });
  expect(problems(a)).toContain("CLAIM_AS_FACT");
});

test.each([
  "The seller is a scammer.",
  "The buyer is clearly dishonest.",
  "This looks like fraud by the seller.",
  "বিক্রেতা প্রতারক।",
  "The buyer's tone suggests lying.",
  "Poor spelling suggests the seller is unreliable.",
])("a verdict on a person, or reasoning from tone, is rejected: %s", (text) => {
  const a = good();
  a.nextStepReason = text;
  expect(problems(a)).toContain("VERDICT_OR_TONE");
});

test("an unknown next step or a malformed shape is rejected", () => {
  expect(
    problems({ ...good(), proposedNextStep: "RELEASE_PAYMENT" }),
  ).toContain("INVALID_SHAPE");
  expect(problems({ ...good(), partyClaims: "none" })).toContain(
    "INVALID_SHAPE",
  );
  expect(problems("release the money")).toContain("INVALID_SHAPE");
  // The model cannot smuggle extra instructions or fields through.
  expect(problems({ ...good(), authorize: { toSeller: "250000" } })).toContain(
    "INVALID_SHAPE",
  );
});
