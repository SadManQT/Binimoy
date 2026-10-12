// Spec D.4: money is an integer count of minor units. It crosses JSON as a
// decimal integer string and lives in the domain as a bigint, never a number.
const MAX = 9223372036854775807n; // PostgreSQL bigint
const DECIMAL_INTEGER = /^(0|[1-9][0-9]*)$/;

export function parseMoney(input: string): bigint {
  if (typeof input !== "string" || !DECIMAL_INTEGER.test(input)) {
    throw new Error(
      "Invalid money: expected a non-negative integer string of minor units.",
    );
  }
  const value = BigInt(input);
  if (value > MAX) throw new Error("Invalid money: amount is too large.");
  return value;
}

export function formatMoney(value: bigint): string {
  if (value < 0n || value > MAX) {
    throw new Error("Invalid money: amount is out of range.");
  }
  return value.toString();
}
