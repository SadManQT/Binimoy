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

// Turns what a person types ("2500" or "2500.50") into minor units, using
// string arithmetic only. Returns null instead of guessing at anything else.
// ponytail: ASCII digits only. Accepting Bangla numerals needs an explicit,
// tested mapping (D.12), so they are refused for now rather than misread.
export function takaToMinor(input: string): string | null {
  const match = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const minor =
    BigInt(match[1] as string) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  try {
    return formatMoney(minor);
  } catch {
    return null;
  }
}

// Display only. Digits stay ASCII so an amount reads the same everywhere.
export function formatBdt(minor: string): string {
  const value = parseMoney(minor);
  const taka = (value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const paisa = (value % 100n).toString().padStart(2, "0");
  return `৳${taka}.${paisa}`;
}
