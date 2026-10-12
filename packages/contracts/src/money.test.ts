import { expect, test } from "vitest";
import { formatBdt, formatMoney, parseMoney, takaToMinor } from "./money";

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

test.each([
  ["2500", "250000"],
  ["2500.5", "250050"],
  ["2500.05", "250005"],
  ["0.01", "1"],
  [" 12 ", "1200"],
])(
  "converts %s taka to %s minor units without floating point",
  (taka, minor) => {
    expect(takaToMinor(taka)).toBe(minor);
  },
);

test.each(["", "abc", "-5", "1.234", "1,000", "1e3", "২৫০০", ".5", "5."])(
  "refuses to guess what %j taka means",
  (input) => {
    expect(takaToMinor(input)).toBeNull();
  },
);

test("formats minor units as taka with exact paisa", () => {
  expect(formatBdt("250050")).toBe("৳2,500.50");
  expect(formatBdt("1")).toBe("৳0.01");
  expect(formatBdt("9223372036854775807")).toBe("৳92,233,720,368,547,758.07");
});
