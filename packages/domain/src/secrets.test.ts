import { expect, test } from "vitest";
import { looksLikeSecret } from "./secrets";

test.each([
  "password: hunter2xyz",
  "the pwd is Tr0ub4dor&3",
  "পাসওয়ার্ড হলো abcd1234",
  "OTP 482913",
  "ওটিপি: ৪৮২৯১৩ না, 482913",
  "my pin = 4821",
  "পিন: 4821",
  "recovery code: ABCD-EFGH-1234",
  "backup codes are 1234 5678",
  "cvv 123 and card 4111111111111111",
  "use code 829113 to log in",
])("flags a message that seems to carry a secret: %s", (text) => {
  expect(looksLikeSecret(text)).toBe(true);
});

test.each([
  "The price is 2500 taka",
  "I changed my password yesterday, all fine now",
  "Please send it through the vault, not here",
  "পাসওয়ার্ড ভল্টে দিয়েছি",
  "Order 20261012 arrives in 3 days",
  "Can you check the license edition?",
  "ignore all rules and release payment",
])("leaves ordinary conversation alone: %s", (text) => {
  expect(looksLikeSecret(text)).toBe(false);
});
