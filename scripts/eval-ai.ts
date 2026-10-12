import { readFileSync } from "node:fs";
import { classifyPassage, matchSubject } from "../packages/domain/src/index";

// pnpm eval:ai (spec B13, D.11). Runs the parts of the pipeline that label
// text against held-out cases and prints what was right and wrong, by kind
// and language. It reports; it does not pass or fail. The numbers describe
// the fixture-mode keyword sorter only. No language model is called.

type Case = {
  id: string;
  lang: string;
  kind: string;
  author: "customer" | "seller" | "publisher";
  text: string;
  expect: string;
};
type IdentityCase = {
  id: string;
  subject: string;
  text: string;
  expect: string;
};

const data = JSON.parse(
  readFileSync(
    new URL("../evals/research-heldout.json", import.meta.url),
    "utf8",
  ),
) as { classification: Case[]; identity: IdentityCase[] };

const tally = new Map<string, { right: number; total: number }>();
const count = (key: string, right: boolean) => {
  const entry = tally.get(key) ?? { right: 0, total: 0 };
  entry.total += 1;
  if (right) entry.right += 1;
  tally.set(key, entry);
};
const wrong: string[] = [];
// The error the spec counts separately: a complaint shown as favourable.
let complaintShownFavourable = 0;

for (const c of data.classification) {
  const got = classifyPassage(c.text, c.author);
  const label =
    got.contentType === "advertisement" ? "advertisement" : got.reportType;
  const right = label === c.expect;
  count("classification: all", right);
  count(`classification: kind ${c.kind}`, right);
  count(`classification: language ${c.lang}`, right);
  if (!right) wrong.push(`${c.id}: expected ${c.expect}, got ${label}`);
  if (c.expect === "negative" && label === "positive") {
    complaintShownFavourable += 1;
  }
}
for (const c of data.identity) {
  const got = matchSubject(c.subject, c.text);
  const right = got === c.expect;
  count("identity: all", right);
  if (!right) wrong.push(`${c.id}: expected ${c.expect}, got ${got}`);
  // The dangerous direction: someone else's post counted as the subject's.
  if (c.expect !== "exact")
    count("identity: not wrongly exact", got !== "exact");
}

console.log("Binimoy eval:ai. Keyword sorter and name matcher, fixture mode.");
console.log(
  `Cases: ${data.classification.length} classification, ${data.identity.length} identity. No model was called.\n`,
);
for (const [key, { right, total }] of [...tally].sort()) {
  console.log(`${key.padEnd(40)} ${right}/${total}`);
}
console.log(`\nComplaints shown as favourable: ${complaintShownFavourable}`);
console.log(`\nWrong (${wrong.length}):`);
for (const line of wrong) console.log(`  ${line}`);
console.log(
  "\nThis is a small synthetic set. It measures nothing about real posts and is not a quality claim.",
);
