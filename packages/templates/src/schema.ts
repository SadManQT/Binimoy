import { z } from "zod";
import { type Capabilities, PREDICATES } from "./registry";

const text = z.object({ bn: z.string().min(1), en: z.string().min(1) });
const slug = z.string().regex(/^[a-z][a-z0-9_]*$/);
const hours = z
  .number()
  .int()
  .positive()
  .max(24 * 365);

export const SERVICE_MODES = [
  "ai_first",
  "human_from_start",
  "ai_only",
] as const;
export type ServiceMode = (typeof SERVICE_MODES)[number];

const itemSchema = z.strictObject({
  itemId: slug,
  title: text,
  mandatory: z.boolean(),
  dependsOn: z.array(slug),
  // vault_secret values exist only as client-encrypted vault payloads.
  dataClass: z.enum(["public_status", "party_private", "vault_secret"]),
  submissionRoles: z.array(z.enum(["seller", "buyer", "system"])).min(1),
  predicate: z.string().min(1),
  proofTypes: z
    .array(
      z.enum(["seller_statement", "buyer_observation", "independent_fact"]),
    )
    .min(1),
  freshnessHours: hours.nullable(),
  // A subjective criterion can never be proven independently.
  subjective: z.boolean(),
});

const fieldSchema = z.strictObject({
  key: slug,
  label: text,
  required: z.boolean(),
});

export const templateSchema = z.strictObject({
  templateId: slug,
  version: z.number().int().positive(),
  schemaVersion: z.literal(1),
  categoryId: z.string().regex(/^CAT-(0[1-9]|1[01])$/),
  name: text,
  owner: z.string().min(1),
  capabilityVersion: z.string().min(1),
  policyVersion: z.string().min(1),
  supportedModes: z.array(z.enum(SERVICE_MODES)).min(1),
  currency: z.literal("BDT"),
  fields: z.array(fieldSchema).min(1),
  items: z.array(itemSchema).min(1),
  timing: z.strictObject({
    deliveryHours: hours,
    inspectionHours: hours,
    correctionAttempts: z.number().int().min(0).max(10),
    objectiveChallengeHours: hours.nullable(),
    appealHours: hours,
  }),
  refundRule: z.enum(["no_delivery_full_refund_else_review"]),
  objectiveRelease: z.boolean(),
  // C14.12: the price is split into milestones, each delivered, accepted and
  // paid separately.
  milestones: z.boolean(),
  // Stated to both parties before funding (B6, B7, C14).
  residualRisks: z.array(text).min(1),
});

export type Template = z.infer<typeof templateSchema>;
export type TemplateItem = Template["items"][number];

export type TemplateError = { code: string; detail: string };

function containsPlaceholder(value: unknown): boolean {
  if (value === "template_defined") return true;
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(containsPlaceholder);
  }
  return false;
}

function findCycle(items: TemplateItem[]): string | null {
  const edges = new Map(items.map((i) => [i.itemId, i.dependsOn]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): string | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return id;
    state.set(id, "visiting");
    for (const next of edges.get(id) ?? []) {
      const hit = visit(next);
      if (hit) return hit;
    }
    state.set(id, "done");
    return null;
  };
  for (const item of items) {
    const hit = visit(item.itemId);
    if (hit) return hit;
  }
  return null;
}

// Returns every problem found; an empty list means the template may be
// activated. Run at activation and again before funding.
export function validateTemplate(
  input: unknown,
  capabilities: Capabilities,
): TemplateError[] {
  const errors: TemplateError[] = [];
  const add = (code: string, detail: string) => errors.push({ code, detail });

  if (containsPlaceholder(input)) {
    add("PLACEHOLDER", "template_defined is not an executable value");
  }
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      add("INVALID_SHAPE", `${issue.path.join(".")}: ${issue.message}`);
    }
    return errors;
  }
  const template = parsed.data;
  const ids = template.items.map((i) => i.itemId);

  for (const id of new Set(ids.filter((id, n) => ids.indexOf(id) !== n))) {
    add("DUPLICATE_ITEM", id);
  }
  for (const item of template.items) {
    for (const dependency of item.dependsOn) {
      if (!ids.includes(dependency)) {
        add("DANGLING_DEPENDENCY", `${item.itemId} -> ${dependency}`);
      }
    }
  }
  const cycle = findCycle(template.items);
  if (cycle) add("DEPENDENCY_CYCLE", cycle);
  if (!template.items.some((i) => i.mandatory)) {
    add("NO_MANDATORY_ITEM", template.templateId);
  }

  for (const item of template.items) {
    const predicate = PREDICATES[item.predicate];
    if (!predicate) {
      add("UNKNOWN_PREDICATE", `${item.itemId}: ${item.predicate}`);
      continue;
    }
    if (!item.proofTypes.includes(predicate.proof)) {
      add(
        "PROOF_TYPE_MISMATCH",
        `${item.itemId}: ${item.predicate} yields ${predicate.proof}`,
      );
    }
    // B3: the buyer's own new passwords and codes never enter the shared vault.
    if (
      item.dataClass === "vault_secret" &&
      item.submissionRoles.some((role) => role !== "seller")
    ) {
      add("BUYER_SECRET_IN_VAULT", item.itemId);
    }
    if (!template.objectiveRelease || !item.mandatory) continue;
    // INV-08: every mandatory criterion needs independent proof.
    if (item.subjective || predicate.proof !== "independent_fact") {
      add("OBJECTIVE_NEEDS_INDEPENDENT_PROOF", item.itemId);
      continue;
    }
    const status = predicate.capability && capabilities[predicate.capability];
    if (status !== "MOCK_TESTED" && status !== "LIVE_TESTED") {
      add(
        "CAPABILITY_UNAVAILABLE",
        `${item.itemId}: ${predicate.capability} is ${status ?? "unregistered"}`,
      );
    }
  }
  if (
    template.objectiveRelease &&
    template.timing.objectiveChallengeHours === null
  ) {
    add(
      "INVALID_SHAPE",
      "timing.objectiveChallengeHours: required when objective release is enabled",
    );
  }
  return errors;
}
