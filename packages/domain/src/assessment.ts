import { z } from "zod";

// Spec B4 and D.11: what the model is allowed to say about a case, and the
// deterministic checks its output must pass before anyone sees it. The model
// proposes; it has no tools and decides nothing.

const text = z.string().trim().min(1).max(1200);
const evidence = z.array(z.string().max(200)).max(20);

export const NEXT_STEPS = [
  "CORRECT_AND_RETEST",
  "BUYER_RETEST",
  "PROVIDER_CHECK",
  "REQUEST_HUMAN_REVIEW",
  "MUTUAL_RESOLUTION",
  "NONE",
] as const;

// Strict: any field outside this shape (an "authorize", a tool call, an
// instruction) makes the whole output invalid.
export const assessmentSchema = z.strictObject({
  establishedFacts: z.array(z.strictObject({ text, evidence })).max(30),
  partyClaims: z
    .array(
      z.strictObject({ party: z.enum(["buyer", "seller"]), text, evidence }),
    )
    .max(40),
  contradictions: z.array(z.strictObject({ text, evidence })).max(20),
  missingEvidence: z.array(z.strictObject({ text })).max(20),
  proposedNextStep: z.enum(NEXT_STEPS),
  nextStepReason: text,
  coverageGaps: z.array(text).max(10),
});
export type Assessment = z.infer<typeof assessmentSchema>;

export type AssessmentProblem = { code: string; detail: string };

// B4: no verdict on a person, and nothing inferred from how someone writes,
// sounds or looks. Checked on the model's own statements, not on what it
// reports a party as having said.
const VERDICT =
  /\b(scam(?:mer|s)?|fraud(?:ster|ulent)?|dishonest|liar|lying|cheat(?:er|ing|ed)?|thief)\b|প্রতারক|ঠগ|চোর|মিথ্যাবাদী/iu;
const TONE =
  /\b(tone|spelling|grammar|emotion(?:al)?|voice|face|camera|wording)\b[^.]{0,80}\b(suggest|indicat|show|prov|mean|impl)/iu;

export function validateAssessment(
  output: unknown,
  manifest: readonly string[],
):
  | { ok: true; assessment: Assessment }
  | { ok: false; problems: AssessmentProblem[] } {
  const parsed = assessmentSchema.safeParse(output);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        code: "INVALID_SHAPE",
        detail: `${issue.path.join(".")}: ${issue.message}`,
      })),
    };
  }
  const assessment = parsed.data;
  const problems: AssessmentProblem[] = [];
  const known = new Set(manifest);

  const cited = [
    ...assessment.establishedFacts.map((s) => ({ ...s, kind: "fact" })),
    ...assessment.partyClaims.map((s) => ({ ...s, kind: "claim" })),
    ...assessment.contradictions.map((s) => ({ ...s, kind: "contradiction" })),
  ];
  for (const statement of cited) {
    // Evidence identifiers must come from the input. The model cannot invent
    // a reference to support what it says.
    for (const ref of statement.evidence) {
      if (!known.has(ref))
        problems.push({ code: "UNKNOWN_EVIDENCE", detail: ref });
    }
    if (statement.evidence.length === 0) {
      problems.push({ code: "UNSUPPORTED_STATEMENT", detail: statement.text });
    }
    // A message shows that a party said something. It does not establish it.
    if (
      statement.kind === "fact" &&
      statement.evidence.length > 0 &&
      statement.evidence.every((ref) => ref.startsWith("msg:"))
    ) {
      problems.push({ code: "CLAIM_AS_FACT", detail: statement.text });
    }
  }

  const ownVoice = [
    ...assessment.establishedFacts.map((s) => s.text),
    ...assessment.contradictions.map((s) => s.text),
    ...assessment.missingEvidence.map((s) => s.text),
    assessment.nextStepReason,
  ];
  for (const sentence of ownVoice) {
    if (VERDICT.test(sentence) || TONE.test(sentence)) {
      problems.push({ code: "VERDICT_OR_TONE", detail: sentence });
    }
  }
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, assessment };
}
