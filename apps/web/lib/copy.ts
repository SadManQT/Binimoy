// User-facing Bangla for machine codes. The UI translates codes; it never
// infers success from the absence of an error (spec A8).

export const ERROR_TEXT: Record<string, string> = {
  VALIDATION_FAILED: "তথ্য ঠিক নেই। প্রতিটি ঘর এবং টাকার পরিমাণ আবার দেখুন।",
  NOT_AUTHORIZED: "এই কাজের অনুমতি আপনার নেই।",
  VERSION_CONFLICT:
    "এই চুক্তি ইতিমধ্যে বদলে গেছে। নিচের বর্তমান শর্ত পড়ে আবার সিদ্ধান্ত নিন।",
  IDEMPOTENCY_CONFLICT: "এই অনুরোধ আগে অন্য তথ্য দিয়ে পাঠানো হয়েছিল। পাতা রিফ্রেশ করুন।",
  ILLEGAL_TRANSITION: "চুক্তির এই অবস্থায় কাজটি করা যায় না।",
  COUNTERPARTY_MISSING: "অন্য পক্ষ এখনো যোগ দেননি। আগে আমন্ত্রণ লিংক পাঠান।",
  INVITE_INVALID: "আমন্ত্রণটি আর কার্যকর নয়: মেয়াদ শেষ, ব্যবহৃত বা বাতিল।",
};

export const STATE_TEXT: Record<string, string> = {
  DRAFT: "খসড়া",
  AWAITING_ACCEPTANCE: "দুই পক্ষের সম্মতির অপেক্ষায়",
  ACCEPTED: "দুই পক্ষ সম্মত (শর্ত আর বদলানো যাবে না)",
  SUPERSEDED: "নতুন চুক্তি দিয়ে প্রতিস্থাপিত",
  CANCELLED: "বাতিল",
  EXPIRED: "মেয়াদ শেষ",
};

export const ROLE_TEXT: Record<string, string> = {
  buyer: "ক্রেতা",
  seller: "বিক্রেতা",
};

// B2: say what each mode is, and be truthful about human availability.
export const MODE_TEXT: Record<string, { name: string; note: string }> = {
  ai_first: {
    name: "এআই-প্রথম, প্রয়োজনে মানুষ",
    note: "এই পরীক্ষামূলক সংস্করণে মানব রিভিউয়ার এখনো চালু হয়নি; এআই সহায়তাও এখনো নেই।",
  },
  human_from_start: {
    name: "শুরু থেকেই মানুষের সহায়তা",
    note: "এখনো কোনো রিভিউয়ার নিযুক্ত করা যায় না। রিভিউয়ার নিযুক্ত না হওয়া পর্যন্ত এই ডিলে টাকা জমা দেওয়া যাবে না।",
  },
  ai_only: {
    name: "শুধু এআই (স্ব-পরীক্ষা)",
    note: "কোনো কর্মী যুক্ত হবেন না। অমীমাংসিত বিরোধ অমীমাংসিতই থাকবে।",
  },
};

export const PROOF_TEXT: Record<string, string> = {
  seller_statement: "বিক্রেতার বক্তব্য",
  buyer_observation: "ক্রেতার নিজের পরীক্ষা",
  independent_fact: "স্বাধীন যাচাই",
};
