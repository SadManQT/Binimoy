import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

type Requirement = {
  id: string;
  source: string;
  phase: string;
  ownerTask: string;
  status: string;
  implementationPaths: string[];
  acceptanceTests: string[];
  evidence: string[];
};

const requirements: Requirement[] = JSON.parse(
  readFileSync("docs/requirements.json", "utf8"),
);
const tasks = readFileSync("TASKS.yaml", "utf8");
const pad = (n: number) => String(n).padStart(2, "0");

test("V7-01: every FE and CAT id is registered exactly once", () => {
  const expected = [
    ...Array.from({ length: 37 }, (_, i) => `FE-${pad(i + 1)}`),
    ...Array.from({ length: 11 }, (_, i) => `CAT-${pad(i + 1)}`),
  ];
  expect(requirements.map((r) => r.id).sort()).toEqual(expected.sort());
});

test("every requirement has a real owner task and a known phase", () => {
  for (const r of requirements) {
    expect(tasks, r.id).toContain(`id: ${r.ownerTask}`);
    expect(["P0", "P1", "P2", "P1/P2"], r.id).toContain(r.phase);
    expect(r.source.length, r.id).toBeGreaterThan(0);
  }
});

test("a VERIFIED requirement must carry paths, tests and evidence", () => {
  for (const r of requirements.filter((r) => r.status === "VERIFIED")) {
    expect(r.implementationPaths.length, r.id).toBeGreaterThan(0);
    expect(r.acceptanceTests.length, r.id).toBeGreaterThan(0);
    expect(r.evidence.length, r.id).toBeGreaterThan(0);
  }
});
