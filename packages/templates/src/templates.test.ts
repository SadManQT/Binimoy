import { expect, test } from "vitest";
import {
  CAPABILITIES,
  type Capabilities,
  getTemplate,
  PREDICATES,
  TEMPLATES,
  type Template,
  validateTemplate,
} from "./index";

const codes = (template: unknown, capabilities: Capabilities = CAPABILITIES) =>
  validateTemplate(template, capabilities).map((e) => e.code);

const base = (): Template =>
  structuredClone(getTemplate("software_license", 1));

test("the three first-increment templates are registered and valid", () => {
  expect(TEMPLATES.map((t) => t.categoryId).sort()).toEqual([
    "CAT-01",
    "CAT-04",
    "CAT-07",
  ]);
  for (const template of TEMPLATES) {
    expect(
      validateTemplate(template, CAPABILITIES),
      template.templateId,
    ).toEqual([]);
  }
});

test("every template has mandatory items and uses only registered predicates", () => {
  for (const template of TEMPLATES) {
    expect(template.items.some((i) => i.mandatory)).toBe(true);
    for (const item of template.items) {
      expect(PREDICATES, item.itemId).toHaveProperty(item.predicate);
    }
  }
});

test("no shipped template offers objective release while its capability is untested", () => {
  for (const template of TEMPLATES) {
    expect(template.objectiveRelease, template.templateId).toBe(false);
  }
});

test("an unknown template or version is an error, not a silent default", () => {
  expect(() => getTemplate("software_license", 99)).toThrow(/Unknown template/);
  expect(() => getTemplate("nope", 1)).toThrow(/Unknown template/);
});

test("V7-02: a template_defined placeholder is rejected", () => {
  const t = base() as unknown as { refundRule: string };
  t.refundRule = "template_defined";
  expect(codes(t)).toContain("PLACEHOLDER");
});

test("V7-02: a dependency cycle is rejected", () => {
  const t = base();
  const [a, b] = t.items;
  if (!a || !b) throw new Error("fixture needs two items");
  a.dependsOn = [b.itemId];
  b.dependsOn = [a.itemId];
  expect(codes(t)).toContain("DEPENDENCY_CYCLE");
});

test("V7-02: a dangling dependency and a duplicate item id are rejected", () => {
  const t = base();
  const [a, b] = t.items;
  if (!a || !b) throw new Error("fixture needs two items");
  a.dependsOn = ["does_not_exist"];
  b.itemId = a.itemId;
  expect(codes(t)).toEqual(
    expect.arrayContaining(["DANGLING_DEPENDENCY", "DUPLICATE_ITEM"]),
  );
});

test("V7-02: a template with no mandatory check is rejected", () => {
  const t = base();
  for (const item of t.items) item.mandatory = false;
  expect(codes(t)).toContain("NO_MANDATORY_ITEM");
});

test("an unknown predicate, currency or impossible deadline is rejected", () => {
  const t = base();
  const first = t.items[0];
  if (!first) throw new Error("fixture needs an item");
  first.predicate = "eval_this_javascript";
  expect(codes(t)).toContain("UNKNOWN_PREDICATE");

  const currency = base() as unknown as { currency: string };
  currency.currency = "USD";
  expect(codes(currency)).toContain("INVALID_SHAPE");

  const deadline = base();
  deadline.timing.inspectionHours = 0;
  expect(codes(deadline)).toContain("INVALID_SHAPE");
});

test("a predicate must be able to produce one of the item's permitted proof types", () => {
  const t = base();
  const item = t.items.find((i) => i.predicate === "buyer_confirms");
  if (!item) throw new Error("fixture needs a buyer_confirms item");
  item.proofTypes = ["independent_fact"];
  expect(codes(t)).toContain("PROOF_TYPE_MISMATCH");
});

test("a vault secret can only be submitted by the seller (B3)", () => {
  const t = base();
  const secret = t.items.find((i) => i.dataClass === "vault_secret");
  if (!secret) throw new Error("fixture needs a vault item");
  secret.submissionRoles = ["seller", "buyer"];
  expect(codes(t)).toContain("BUYER_SECRET_IN_VAULT");
});

const tested: Capabilities = {
  ...CAPABILITIES,
  mock_license_issuer: "MOCK_TESTED",
};

test("V7-03: objective release is refused when a mandatory item is subjective", () => {
  const t = base();
  t.objectiveRelease = true;
  t.timing.objectiveChallengeHours = 24;
  for (const item of t.items) {
    item.predicate = "mock_license.entitlement_matches";
    item.proofTypes = ["independent_fact"];
    item.dataClass = "public_status";
    item.submissionRoles = ["system"];
  }
  expect(codes(t, tested)).toEqual([]);
  const first = t.items[0];
  if (!first) throw new Error("fixture needs an item");
  first.subjective = true;
  expect(codes(t, tested)).toContain("OBJECTIVE_NEEDS_INDEPENDENT_PROOF");
});

test("objective release is refused when a mandatory item rests on a party's word", () => {
  const t = base();
  t.objectiveRelease = true;
  t.timing.objectiveChallengeHours = 24;
  expect(codes(t, tested)).toContain("OBJECTIVE_NEEDS_INDEPENDENT_PROOF");
});

test("objective release is refused when the proving capability is not tested (INV-13)", () => {
  const t = base();
  t.objectiveRelease = true;
  t.timing.objectiveChallengeHours = 24;
  for (const item of t.items) {
    item.predicate = "mock_license.entitlement_matches";
    item.proofTypes = ["independent_fact"];
    item.dataClass = "public_status";
    item.submissionRoles = ["system"];
  }
  expect(codes(t, CAPABILITIES)).toContain("CAPABILITY_UNAVAILABLE");
});
