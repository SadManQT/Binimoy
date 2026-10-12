// Words for community reports. A label says what the writer reports; none of
// them says what the shop is.
export const EXPERIENCE_TEXT: Record<string, string> = {
  positive: "ভালো এক্সপেরিয়েন্স",
  negative: "রিপোর্ট",
  mixed: "ভালো ও খারাপ দুটোই",
  neutral: "সাধারণ এক্সপেরিয়েন্স",
};
export const REPORT_STATE_TEXT: Record<string, string> = {
  DRAFT: "ড্রাফট (শুধু আপনি দেখছেন)",
  SUBMITTED: "জমা হয়েছে, মডারেটরের অপেক্ষায়",
  NEEDS_INFORMATION: "মডারেটর আরও তথ্য চেয়েছেন",
  UNDER_REVIEW: "মডারেটর দেখছেন",
  PUBLISHED: "পাবলিশড",
  NOT_PUBLISHED: "প্রকাশ করা হয়নি",
  WITHDRAWN: "লেখক তুলে নিয়েছেন",
};
export const EVENT_TEXT: Record<string, string> = {
  SUBMITTED: "জমা দেওয়া হয়েছে",
  CLAIMED: "একজন মডারেটর দায়িত্ব নিয়েছেন",
  NEEDS_INFORMATION: "আরও তথ্য চাওয়া হয়েছে",
  PUBLISHED: "প্রকাশ করা হয়েছে",
  NOT_PUBLISHED: "প্রকাশ না করার সিদ্ধান্ত",
  APPEALED: "আপিল করা হয়েছে",
  WITHDRAWN: "লেখক তুলে নিয়েছেন",
};
export const FOLLOWUP_TEXT: Record<string, string> = {
  RESPONSE: "উত্তর",
  CORRECTION: "লেখকের সংশোধন",
  RESOLUTION: "লেখকের জানানো সমাধান",
};
export const FOLLOWUP_STATUS_TEXT: Record<string, string> = {
  PENDING: "মডারেটরের অপেক্ষায়, এখনো অন্যরা দেখছেন না",
  PUBLISHED: "পাবলিশড",
  REJECTED: "প্রকাশ করা হয়নি",
};
export const COMMUNITY_ERROR_TEXT: Record<string, string> = {
  VALIDATION_FAILED:
    "তথ্য ঠিক নেই। নাম, ধরন, লেখার দৈর্ঘ্য এবং অ্যাপ্রুভালের টিক আবার দেখুন। কারণ লিখলে অন্তত ১০ অক্ষর লিখুন।",
  SECRET_SUSPECTED:
    "প্রকাশের লেখায় ফোন নম্বর, অ্যাকাউন্ট বা লেনদেন নম্বর, ইমেইল বা পাসওয়ার্ডের মতো কিছু আছে। সেগুলো বাদ দিন। এই শনাক্তকরণ নিখুঁত নয়; লম্বা সংখ্যা থাকলে সেটি বাদ দিয়ে লিখুন।",
  NOT_AUTHORIZED: "এই কাজের অনুমতি আপনার নেই।",
  ILLEGAL_TRANSITION: "রিপোর্টের এই অবস্থায় কাজটি করা যায় না।",
  VERSION_CONFLICT: "লেখাটি পরে বদলেছে। নিচের বর্তমান লেখা পড়ে আবার অ্যাপ্রুভাল দিন।",
  BUDGET_EXHAUSTED: "আজকের সীমা শেষ। পরে আবার চেষ্টা করুন।",
  APPEAL_WINDOW_CLOSED: "আপিলের সাত দিন পার হয়ে গেছে।",
  DUPLICATE_REPORT:
    "এই শপ নিয়ে আপনার একটি লেখা ইতিমধ্যে জমা বা পাবলিশড আছে। নতুন কিছু জানাতে চাইলে সেই লেখায় সংশোধন বা সমাধান যোগ করুন।",
};
