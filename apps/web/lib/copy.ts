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
  ALREADY_FUNDED: "পেমেন্ট শুরু হয়ে গেছে, তাই ডিল আর বাতিল করা যায় না।",
  REVIEWER_NOT_ASSIGNED:
    "এই ডিলে শুরু থেকেই মানব রিভিউয়ার দরকার, কিন্তু এখনো কাউকে নিযুক্ত করা যায় না। তাই টাকা জমা দেওয়া যাবে না।",
  INVOICE_EXPIRED: "ইনভয়েসের মেয়াদ শেষ। নতুন ইনভয়েস তৈরি করুন।",
  TEST_MODE_REQUIRED: "এই সংস্করণে শুধু পরীক্ষামূলক (নকল) পেমেন্ট চলে।",
  INCOMPLETE_DELIVERY:
    "সব আবশ্যক অংশ এখনো সম্পূর্ণ বা পাস হয়নি। আগের ধাপগুলো আগে শেষ করুন।",
  VAULT_INVALID:
    "ভল্টের বার্তাটি এই ডিলের বিক্রেতার এনক্রিপ্ট করা বার্তা হিসেবে যাচাই করা যায়নি।",
  VAULT_UNAVAILABLE: "এই পরিবেশে ভল্ট চালু নেই।",
  DISPUTE_OPEN: "একটি বিরোধ খোলা আছে। সেটি মীমাংসা না হওয়া পর্যন্ত টাকা ছাড়া যাবে না।",
  INSUFFICIENT_HELD_FUNDS: "আটকে রাখা টাকার পরিমাণ চুক্তির সাথে মিলছে না।",
  REVIEW_UNAVAILABLE:
    "এই ডিলে দুই পক্ষ শুধু-এআই ধরন বেছেছিলেন, তাই মানব পর্যালোচনা নেই। দুই পক্ষ সম্মত বণ্টন করতে পারেন।",
  APPEAL_WINDOW_CLOSED: "আপিলের সময় শেষ হয়ে গেছে।",
  INVITE_INVALID: "আমন্ত্রণটি আর কার্যকর নয়: মেয়াদ শেষ, ব্যবহৃত বা বাতিল।",
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
  PENDING: "পরীক্ষার অপেক্ষায়",
  PASSED: "পাস",
  FAILED: "ব্যর্থ",
  UNKNOWN: "যাচাই করা যায়নি (দোষ বা সাফল্য কোনোটাই নয়)",
  STALE: "পুরোনো সংস্করণের, আর গণ্য নয়",
};

export const AUTHORIZATION_TEXT: Record<string, string> = {
  CREATED: "অনুমোদন তৈরি",
  RESERVED: "অনুমোদিত, টাকা সংরক্ষিত, এখনো পাঠানো হয়নি",
  INVALIDATED: "অনুমোদন বাতিল, টাকা আবার আটকে রাখা",
  EXPIRED: "অনুমোদনের মেয়াদ শেষ",
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
  ACCEPTED_RELEASE: "ক্রেতার গ্রহণের ভিত্তিতে বিক্রেতাকে পরিশোধ",
  NO_DELIVERY_REFUND: "সময়মতো সরবরাহ না হওয়ায় ক্রেতাকে ফেরত",
  OBJECTIVE_RELEASE: "স্বাধীন প্রমাণের ভিত্তিতে পরিশোধ",
  MUTUAL_RESOLUTION: "দুই পক্ষের সম্মত বণ্টন",
  REVIEWED_RESOLUTION: "পর্যালোচকের সিদ্ধান্ত",
};

export const CLAIM_TEXT: Record<string, string> = {
  NOT_RECEIVED: "কিছুই পাইনি",
  CANNOT_ACCESS: "লগইন বা প্রবেশ করা যাচ্ছে না",
  WRONG_PRODUCT: "ভুল পণ্য বা ভুল অ্যাকাউন্ট",
  INCOMPLETE: "কিছু অংশ বাদ পড়েছে",
  LOST_ACCESS_LATER: "পরে প্রবেশাধিকার হারিয়েছি",
  COMPROMISED: "অ্যাকাউন্ট বেহাত হয়েছে বলে সন্দেহ",
  OTHER: "অন্য কিছু",
};

export const DISPUTE_TEXT: Record<string, string> = {
  OPEN: "খোলা; টাকা আটকে আছে",
  QUEUED: "পর্যালোচকের অপেক্ষায় (এখনো কাউকে দেওয়া হয়নি)",
  ASSIGNED: "একজন পর্যালোচককে দেওয়া হয়েছে",
  REVIEWING: "পর্যালোচনা চলছে",
  DECIDED_AWAITING_APPEAL: "সিদ্ধান্ত হয়েছে; আপিলের সময় চলছে, টাকা এখনো পাঠানো হয়নি",
  APPEALED: "আপিল করা হয়েছে; অন্য একজন পর্যালোচকের অপেক্ষা, টাকা আটকে আছে",
  RESOLVED: "মীমাংসিত",
  UNRESOLVED_CLOSED: "অমীমাংসিত অবস্থায় বন্ধ; কাউকে বিজয়ী ঘোষণা করা হয়নি, টাকা আটকে আছে",
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
    note: "বিরোধ হলে মানব পর্যালোচক চাওয়া যায়, তবে কখন কেউ দায়িত্ব নেবেন তার নিশ্চয়তা নেই। এআই সহায়তা এখনো তৈরি হয়নি।",
  },
  human_from_start: {
    name: "শুরু থেকেই মানুষের সহায়তা",
    note: "একজন পর্যালোচক এই ডিলের দায়িত্ব না নেওয়া পর্যন্ত টাকা জমা দেওয়া যাবে না। কখন কেউ দায়িত্ব নেবেন তার নিশ্চয়তা নেই।",
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
