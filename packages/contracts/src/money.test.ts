import { expect, test } from "vitest";
import { formatMoney, parseMoney } from "./money";

test("parses a decimal integer string of minor units into a bigint", () => {
  expect(parseMoney("0")).toBe(0n);
  expect(parseMoney("100000")).toBe(100000n);
});

test("round-trips values beyond JavaScript's safe integer range", () => {
  const big = "9223372036854775807";
  expect(formatMoney(parseMoney(big))).toBe(big);
});

test.each([
  ["negative", "-1"],
  ["decimal point", "10.50"],
  ["exponent", "1e5"],
  ["explicit sign", "+5"],
  ["leading zero", "007"],
  ["empty", ""],
  ["whitespace", " 5"],
  ["Bangla numerals", "১০০"],
  ["above the database bigint limit", "9223372036854775808"],
])("rejects %s", (_name, input) => {
  expect(() => parseMoney(input)).toThrow(/money/i);
});

test("rejects a JavaScript number even when it looks whole", () => {
  expect(() => parseMoney(100 as unknown as string)).toThrow(/money/i);
});

test("refuses to format a negative amount", () => {
  expect(() => formatMoney(-1n)).toThrow(/money/i);
});
