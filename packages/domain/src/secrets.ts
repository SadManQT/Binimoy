// Spec B3: the monitored room is readable by the server and by AI, so
// passwords, one-time codes and PINs must not go there. This is a heuristic
// that catches the obvious shapes. It will miss some secrets and flag some
// harmless text; the UI says so and points to the vault.

const KEYWORD =
  "(?:pass(?:word)?|pwd|পাসওয়ার্ড|pin|পিন|otp|ওটিপি|cvv|cvc|recovery codes?|backup codes?)";

// "password: x", "pin = 1234", "পাসওয়ার্ড হলো x", "the pwd is x"
const ASSIGNED = new RegExp(
  `${KEYWORD}\\s*(?:[:=\\-]|is|are|হলো|হল)\\s*\\S{3,}`,
  "iu",
);
// "OTP 482913", "code 829113", "cvv 123"
const NUMERIC = /(?:otp|ওটিপি|code|কোড|cvv|cvc|pin|পিন)\D{0,12}\d{3,8}(?!\d)/iu;
// A bare payment card number.
const CARD = /(?<!\d)(?:\d[ -]?){15,18}\d(?!\d)/u;

export function looksLikeSecret(text: string): boolean {
  return ASSIGNED.test(text) || NUMERIC.test(text) || CARD.test(text);
}
