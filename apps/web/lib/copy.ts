// User-facing Bangla for machine codes. The UI translates codes; it never
// infers success from the absence of an error (spec A8).

export const ERROR_TEXT: Record<string, string> = {
  VALIDATION_FAILED: "তথ্য ঠিক নেই। প্রতিটি ঘর এবং টাকার পরিমাণ আবার দেখুন।",
  NOT_AUTHORIZED: "এই কাজের অনুমতি আপনার নেই।",
  VERSION_CONFLICT:
    "এই ডিল ইতিমধ্যে বদলে গেছে। নিচের বর্তমান শর্ত পড়ে আবার সিদ্ধান্ত নিন।",
  IDEMPOTENCY_CONFLICT: "এই অনুরোধ আগে অন্য তথ্য দিয়ে পাঠানো হয়েছিল। পাতা রিফ্রেশ করুন।",
  ILLEGAL_TRANSITION: "ডিলের এই অবস্থায় কাজটি করা যায় না।",
  COUNTERPARTY_MISSING: "অন্য পক্ষ এখনো যোগ দেননি। আগে ইনভাইট লিংক পাঠান।",
  ALREADY_FUNDED: "পেমেন্ট শুরু হয়ে গেছে, তাই ডিল আর বাতিল করা যায় না।",
  REVIEWER_NOT_ASSIGNED:
    "এই ডিলে শুরু থেকেই মানব রিভিউয়ার দরকার, কিন্তু এখনো কাউকে নিযুক্ত করা যায় না। তাই টাকা জমা দেওয়া যাবে না।",
  INVOICE_EXPIRED: "ইনভয়েসের মেয়াদ শেষ। নতুন ইনভয়েস তৈরি করুন।",
  TEST_MODE_REQUIRED: "এই সংস্করণে শুধু টেস্ট পেমেন্ট চলে।",
  INCOMPLETE_DELIVERY:
    "সব আবশ্যক অংশ এখনো সম্পূর্ণ বা পাস হয়নি। আগের ধাপগুলো আগে শেষ করুন।",
  VAULT_INVALID:
    "ভল্টের বার্তাটি এই ডিলের সেলারের এনক্রিপ্ট করা বার্তা হিসেবে ভেরিফাই করা যায়নি।",
  VAULT_UNAVAILABLE: "এই পরিবেশে ভল্ট চালু নেই।",
  DISPUTE_OPEN: "একটি ডিসপিউট খোলা আছে। সেটি মীমাংসা না হওয়া পর্যন্ত টাকা ছাড়া যাবে না।",
  INSUFFICIENT_HELD_FUNDS: "আটকে রাখা টাকার পরিমাণ ডিলের সাথে মিলছে না।",
  REVIEW_UNAVAILABLE:
    "এই ডিলে দুই পক্ষ শুধু-এআই ধরন বেছেছিলেন, তাই হিউম্যান রিভিউ নেই। দুই পক্ষ সম্মত বণ্টন করতে পারেন।",
  APPEAL_WINDOW_CLOSED: "আপিলের সময় শেষ হয়ে গেছে।",
  MISSING_CONSENT: "লিখতে হলে আগে পর্যবেক্ষণে কনসেন্ট দিতে হবে।",
  SECRET_SUSPECTED:
    "বার্তাটি পাসওয়ার্ড, কোড বা পিনের মতো দেখাচ্ছে, তাই সংরক্ষণ করা হয়নি। গোপন তথ্য ভল্টে দিন। এই শনাক্তকরণ নিখুঁত নয়; ভুল হলে বাক্যটি অন্যভাবে লিখুন।",
  BUDGET_EXHAUSTED: "এই ডিলে এআই ব্যবহারের সীমা শেষ হয়েছে।",
  PAUSED:
    "পরিচালনাকারী এই কাজটি সাময়িকভাবে বন্ধ রেখেছেন। আপনার আগের তথ্য ও টাকা যেমন ছিল তেমনই আছে; ডিসপিউট জানানো ও অবস্থা দেখা চালু আছে।",
  INVITE_INVALID: "ইনভাইটটি আর কার্যকর নয়: মেয়াদ শেষ, ব্যবহৃত বা বাতিল।",
};

export const FUNDING_TEXT: Record<string, string> = {
  CREATED: "ইনভয়েস তৈরি, পেমেন্ট শুরু হয়নি",
  PENDING: "পেমেন্ট শুরু হয়েছে, প্রোভাইডারের নিশ্চিতকরণের অপেক্ষা",
  CONFIRMED: "টাকা জমা নিশ্চিত, নিরাপদ হিসাবে আটকে রাখা",
  EXPIRED: "ইনভয়েসের মেয়াদ শেষ",
  CANCELLED: "ইনভয়েস বাতিল",
  RECONCILIATION_REQUIRED:
    "পরিমাণ মেলেনি: টাকা জমা হিসেবে গণ্য হয়নি, হিসাব মেলানো দরকার",
};

export const INSPECTION_TEXT: Record<string, string> = {
  NOT_STARTED: "শুরু হয়নি",
  PENDING: "চেকের অপেক্ষায়",
  PASSED: "পাস",
  FAILED: "ব্যর্থ",
  UNKNOWN: "ভেরিফাই করা যায়নি (দোষ বা সাফল্য কোনোটাই নয়)",
  STALE: "পুরোনো সংস্করণের, আর গণ্য নয়",
};

export const AUTHORIZATION_TEXT: Record<string, string> = {
  CREATED: "অ্যাপ্রুভাল তৈরি",
  RESERVED: "অনুমোদিত, টাকা সংরক্ষিত, এখনো পাঠানো হয়নি",
  INVALIDATED: "অ্যাপ্রুভাল বাতিল, টাকা আবার আটকে রাখা",
  EXPIRED: "অ্যাপ্রুভালের মেয়াদ শেষ",
  DISPATCH_COMMITTED: "পাঠানোর প্রক্রিয়া শুরু",
  CONSUMED: "পাঠানোর প্রক্রিয়ায় দেওয়া হয়েছে",
};

export const OPERATION_TEXT: Record<string, string> = {
  NOT_SENT: "এখনো পাঠানো হয়নি",
  DISPATCH_COMMITTED: "পাঠানো হচ্ছে, ফলাফল এখনো জানা নেই",
  PENDING: "প্রোভাইডারে অপেক্ষমাণ",
  SUCCEEDED: "সম্পন্ন",
  FAILED_FINAL: "চূড়ান্তভাবে ব্যর্থ, টাকা আবার আটকে রাখা হয়েছে",
  UNKNOWN: "ফলাফল অজানা, মেলানো হচ্ছে; টাকা সংরক্ষিত আছে",
  CANCELLED_CONFIRMED: "বাতিল নিশ্চিত",
};

export const PATH_TEXT: Record<string, string> = {
  ACCEPTED_RELEASE: "বায়ারের গ্রহণের ভিত্তিতে সেলারকে পেমেন্ট",
  NO_DELIVERY_REFUND: "সময়মতো ডেলিভারি না হওয়ায় বায়ারকে ফেরত",
  OBJECTIVE_RELEASE: "স্বাধীন প্রমাণের ভিত্তিতে পেমেন্ট",
  MUTUAL_RESOLUTION: "দুই পক্ষের সম্মত বণ্টন",
  REVIEWED_RESOLUTION: "রিভিউয়ারের সিদ্ধান্ত",
};

export const CLAIM_TEXT: Record<string, string> = {
  NOT_RECEIVED: "কিছুই পাইনি",
  CANNOT_ACCESS: "লগইন বা প্রবেশ করা যাচ্ছে না",
  WRONG_PRODUCT: "ভুল প্রোডাক্ট বা ভুল অ্যাকাউন্ট",
  INCOMPLETE: "কিছু অংশ বাদ পড়েছে",
  LOST_ACCESS_LATER: "পরে প্রবেশাধিকার হারিয়েছি",
  COMPROMISED: "অ্যাকাউন্ট বেহাত হয়েছে বলে সন্দেহ",
  OTHER: "অন্য কিছু",
};

export const DISPUTE_TEXT: Record<string, string> = {
  OPEN: "খোলা; টাকা আটকে আছে",
  QUEUED: "রিভিউয়ারের অপেক্ষায় (এখনো কাউকে দেওয়া হয়নি)",
  ASSIGNED: "একজন রিভিউয়ারকে দেওয়া হয়েছে",
  REVIEWING: "রিভিউ চলছে",
  DECIDED_AWAITING_APPEAL: "সিদ্ধান্ত হয়েছে; আপিলের সময় চলছে, টাকা এখনো পাঠানো হয়নি",
  APPEALED: "আপিল করা হয়েছে; অন্য একজন রিভিউয়ারের অপেক্ষা, টাকা আটকে আছে",
  RESOLVED: "মীমাংসিত",
  UNRESOLVED_CLOSED: "অমীমাংসিত অবস্থায় বন্ধ; কাউকে বিজয়ী ঘোষণা করা হয়নি, টাকা আটকে আছে",
};

export const STATE_TEXT: Record<string, string> = {
  DRAFT: "ড্রাফট",
  AWAITING_ACCEPTANCE: "দুই পক্ষের কনসেন্টর অপেক্ষায়",
  ACCEPTED: "দুই পক্ষ সম্মত (শর্ত আর বদলানো যাবে না)",
  SUPERSEDED: "নতুন ডিল দিয়ে প্রতিস্থাপিত",
  CANCELLED: "বাতিল",
  EXPIRED: "মেয়াদ শেষ",
};

export const ROLE_TEXT: Record<string, string> = {
  buyer: "বায়ার",
  seller: "সেলার",
};

// B2: say what each mode is, and be truthful about human availability.
export const MODE_TEXT: Record<string, { name: string; note: string }> = {
  ai_first: {
    name: "এআই-প্রথম, প্রয়োজনে মানুষ",
    note: "ডিসপিউট হলে মানব রিভিউয়ার চাওয়া যায়, তবে কখন কেউ দায়িত্ব নেবেন তার নিশ্চয়তা নেই। এআই সহায়তা এখনো তৈরি হয়নি।",
  },
  human_from_start: {
    name: "শুরু থেকেই মানুষের সহায়তা",
    note: "একজন রিভিউয়ার এই ডিলের দায়িত্ব না নেওয়া পর্যন্ত টাকা জমা দেওয়া যাবে না। কখন কেউ দায়িত্ব নেবেন তার নিশ্চয়তা নেই।",
  },
  ai_only: {
    name: "শুধু এআই (স্ব-চেক)",
    note: "কোনো কর্মী যুক্ত হবেন না। অমীমাংসিত ডিসপিউট অমীমাংসিতই থাকবে।",
  },
};

export const PROOF_TEXT: Record<string, string> = {
  seller_statement: "সেলারের বক্তব্য",
  buyer_observation: "বায়ারের নিজের চেক",
  independent_fact: "স্বাধীন ভেরিফাই",
};

// D.6: a notice says that something happened and where to look. It carries
// no message text, no claim text and no button that accepts anything.
export const NOTICE_TEXT: Record<string, string> = {
  AGREEMENT_ACCEPTED: "দুই পক্ষ ডিলে সম্মত হয়েছেন",
  FUNDING_CONFIRMED: "টাকা জমা নিশ্চিত হয়েছে (টেস্ট)",
  DELIVERY_SUBMITTED: "সেলার ডেলিভারি জমা দিয়েছেন; আপনার চেকের সময় চলছে",
  OBJECTIVE_RELEASE_NOTICE:
    "সব আবশ্যক শর্ত স্বাধীনভাবে প্রমাণিত হয়েছে। আপনি নির্ধারিত সময়ের মধ্যে আপত্তি না করলে সেলারকে পেমেন্ট হবে। ডিলটি খুলে দেখুন।",
  SETTLEMENT_AUTHORIZED: "টাকা সেটেলমেন্টের অ্যাপ্রুভাল হয়েছে, এখনো পাঠানো হয়নি",
  TRANSFER_COMPLETED: "টাকা পাঠানো সম্পন্ন হয়েছে (টেস্ট)",
  TRANSFER_FAILED: "টাকা পাঠানো ব্যর্থ হয়েছে; টাকা আবার আটকে রাখা হয়েছে",
  DISPUTE_OPENED: "অন্য পক্ষ একটি ডিসপিউট খুলেছেন। রিপোর্ট মানেই কেউ দোষী নয়।",
  DISPUTE_UPDATED: "ডিসপিউটের অবস্থা বদলেছে",
};

// What a complaint alleges. Always shown as the author's claim.
export const ISSUE_TEXT: Record<string, string> = {
  not_delivered: "টাকা নিয়ে প্রোডাক্ট দেয়নি",
  wrong_item: "ভুল বা ভিন্ন প্রোডাক্ট দিয়েছে",
  access_revoked: "পরে অ্যাক্সেস কেড়ে নিয়েছে",
  no_refund: "টাকা ফেরত দেয়নি",
  blocked_after_payment: "টাকা নেওয়ার পর ব্লক করেছে",
  impersonation: "অন্য কারও নাম ব্যবহার করেছে",
  other: "অন্য সমস্যা",
};

export const REVIEW_TYPE_TEXT: Record<string, string> = {
  positive: "ভালো এক্সপেরিয়েন্স",
  negative: "রিপোর্ট",
  mixed: "মিশ্র এক্সপেরিয়েন্স",
  neutral: "সাধারণ এক্সপেরিয়েন্স",
};
// Amber, not red: red is kept for failed operations and disputed checklist
// items (C36.1). A complaint is an allegation, not a finding.
export const REVIEW_TONE: Record<string, string> = {
  positive: "ok",
  negative: "wait",
  mixed: "plain",
  neutral: "plain",
};

export const bn = (value: number) => value.toLocaleString("bn-BD");
export const bnDate = (iso: string) =>
  new Date(iso).toLocaleDateString("bn-BD", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
