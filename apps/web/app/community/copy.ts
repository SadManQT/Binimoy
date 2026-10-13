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

const EN = {
  EXPERIENCE_TEXT: {
    positive: "Good experience",
    negative: "Report",
    mixed: "Both good and bad",
    neutral: "General experience",
  },
  REPORT_STATE_TEXT: {
    DRAFT: "Draft (only you can see it)",
    SUBMITTED: "Submitted, waiting for a moderator",
    NEEDS_INFORMATION: "The moderator asked for more information",
    UNDER_REVIEW: "A moderator is looking at it",
    PUBLISHED: "Published",
    NOT_PUBLISHED: "Not published",
    WITHDRAWN: "Withdrawn by the writer",
  },
  EVENT_TEXT: {
    SUBMITTED: "Submitted",
    CLAIMED: "A moderator took it",
    NEEDS_INFORMATION: "More information was asked for",
    PUBLISHED: "Published",
    NOT_PUBLISHED: "Decision not to publish",
    APPEALED: "Appealed",
    WITHDRAWN: "Withdrawn by the writer",
  },
  FOLLOWUP_TEXT: {
    RESPONSE: "Reply",
    CORRECTION: "The writer's correction",
    RESOLUTION: "Resolution reported by the writer",
  },
  FOLLOWUP_STATUS_TEXT: {
    PENDING: "Waiting for a moderator, not visible to others yet",
    PUBLISHED: "Published",
    REJECTED: "Not published",
  },
  COMMUNITY_ERROR_TEXT: {
    VALIDATION_FAILED:
      "Something is not filled in correctly. Check the name, type, length of the text and the approval tick again. If you give a reason, write at least 10 characters.",
    SECRET_SUSPECTED:
      "The text to be published holds something that looks like a phone number, account or transaction number, email or password. Remove those. This detection is not perfect; if there is a long number, leave it out.",
    NOT_AUTHORIZED: "You are not allowed to do this.",
    ILLEGAL_TRANSITION: "This cannot be done at the report's current stage.",
    VERSION_CONFLICT:
      "The text changed afterwards. Read the current text below and approve it again.",
    BUDGET_EXHAUSTED: "Today's limit is used up. Try again later.",
    APPEAL_WINDOW_CLOSED: "The seven days to appeal have passed.",
    DUPLICATE_REPORT:
      "You already have a submitted or published text about this shop. To add something new, add a correction or resolution to that text.",
  },
} satisfies Record<string, Record<string, string>>;
const BN = {
  EXPERIENCE_TEXT,
  REPORT_STATE_TEXT,
  EVENT_TEXT,
  FOLLOWUP_TEXT,
  FOLLOWUP_STATUS_TEXT,
  COMMUNITY_ERROR_TEXT,
};
// The same labels in the reader's language.
export const communityCopy = (
  locale: "bn" | "en",
): Record<keyof typeof BN, Record<string, string>> =>
  locale === "en" ? EN : BN;
