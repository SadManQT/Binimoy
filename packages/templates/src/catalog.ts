import type { Template, TemplateItem } from "./schema";

// Item wording follows spec C14. Each item states where its proof comes from:
// the seller's word, the buyer's own test, or an independent fact.

type ItemOptions = Partial<
  Pick<
    TemplateItem,
    "mandatory" | "dependsOn" | "dataClass" | "freshnessHours" | "subjective"
  >
>;

const item = (
  itemId: string,
  bn: string,
  en: string,
  predicate: string,
  options: ItemOptions = {},
): TemplateItem => {
  const independent = predicate.includes(".");
  return {
    itemId,
    title: { bn, en },
    mandatory: true,
    dependsOn: [],
    dataClass: "public_status",
    submissionRoles:
      predicate === "seller_declares" || predicate === "vault.package_bound"
        ? ["seller"]
        : predicate === "buyer_confirms"
          ? ["buyer"]
          : ["system"],
    predicate,
    proofTypes: [
      predicate === "seller_declares"
        ? "seller_statement"
        : independent
          ? "independent_fact"
          : "buyer_observation",
    ],
    freshnessHours: independent ? 24 : null,
    subjective: false,
    ...options,
  };
};

const common = {
  schemaVersion: 1,
  owner: "founder",
  capabilityVersion: "cap-1",
  policyVersion: "policy-1",
  supportedModes: ["ai_first", "human_from_start", "ai_only"],
  currency: "BDT",
  // B15 prototype defaults. Test assumptions, not commercial promises.
  timing: {
    deliveryHours: 24,
    inspectionHours: 24,
    correctionAttempts: 2,
    objectiveChallengeHours: null,
    appealHours: 48,
  },
  refundRule: "no_delivery_full_refund_else_review",
  // Disabled until the proving adapters are built and tested (D.1).
  objectiveRelease: false,
  milestones: false,
} as const satisfies Partial<Template>;

const softwareLicense: Template = {
  ...common,
  supportedModes: [...common.supportedModes],
  templateId: "software_license",
  version: 1,
  categoryId: "CAT-04",
  name: {
    bn: "সফটওয়্যার লাইসেন্স বা অ্যাক্টিভেশন কি",
    en: "Software license or activation key",
  },
  fields: [
    { key: "product", label: { bn: "পণ্য", en: "Product" }, required: true },
    { key: "edition", label: { bn: "সংস্করণ", en: "Edition" }, required: true },
    { key: "region", label: { bn: "অঞ্চল", en: "Region" }, required: true },
    { key: "duration", label: { bn: "মেয়াদ", en: "Duration" }, required: true },
    {
      key: "device_limit",
      label: { bn: "ডিভাইস সীমা", en: "Device limit" },
      required: true,
    },
    {
      key: "activation_destination",
      label: {
        bn: "যে অ্যাকাউন্ট বা ডিভাইসে চালু হবে",
        en: "Account or device to activate on",
      },
      required: true,
    },
  ],
  items: [
    item(
      "license_identity",
      "পণ্য, সংস্করণ, অঞ্চল, মেয়াদ ও ডিভাইস সীমা চুক্তির সাথে মেলে",
      "Product, edition, region, duration and device limit match the agreement",
      "seller_declares",
    ),
    item(
      "distribution_rights",
      "বিক্রেতার বিতরণের অধিকার ও উৎসের রেকর্ড",
      "Seller's distribution rights and source record",
      "seller_declares",
    ),
    item(
      "key_delivered",
      "কি বা এনটাইটেলমেন্ট গোপন ভল্টে দেওয়া হয়েছে",
      "Key or entitlement delivered through the secret vault",
      "vault.package_bound",
      { dataClass: "vault_secret", dependsOn: ["license_identity"] },
    ),
    item(
      "activation_works",
      "চুক্তির অ্যাকাউন্ট বা ডিভাইসে অ্যাক্টিভেশন সফল",
      "Activation succeeds on the agreed account or device",
      "buyer_confirms",
      { dependsOn: ["key_delivered"] },
    ),
    item(
      "license_terms_confirmed",
      "লাইসেন্সের ধরন এবং হস্তান্তর বা বাণিজ্যিক ব্যবহারের সীমা নিশ্চিত",
      "License type and limits on transfer or commercial use confirmed",
      "buyer_confirms",
      { dependsOn: ["activation_works"] },
    ),
    item(
      "renewal_and_expiry",
      "নবায়ন খরচ ও মেয়াদ শেষের তারিখ জানানো হয়েছে",
      "Renewal cost and expiry date disclosed",
      "seller_declares",
      { mandatory: false },
    ),
  ],
  residualRisks: [
    {
      bn: "সফল অ্যাক্টিভেশন প্রমাণ করে না যে কি বৈধভাবে পাওয়া বা কখনো বাতিল হবে না।",
      en: "A successful activation does not prove the key was obtained legitimately or will never be revoked.",
    },
  ],
};

const digitalFiles: Template = {
  ...common,
  supportedModes: [...common.supportedModes],
  templateId: "digital_files",
  version: 1,
  categoryId: "CAT-07",
  name: {
    bn: "ডিজিটাল ফাইল, টেমপ্লেট ও সৃজনশীল সম্পদ",
    en: "Digital files, templates and creative assets",
  },
  fields: [
    {
      key: "file_manifest",
      label: {
        bn: "ফাইলের তালিকা, ফরম্যাট ও আকার",
        en: "File manifest, formats and sizes",
      },
      required: true,
    },
    {
      key: "editable_sources",
      label: {
        bn: "যে সম্পাদনাযোগ্য সোর্স ফাইল থাকবে",
        en: "Editable source files included",
      },
      required: true,
    },
    {
      key: "license_terms",
      label: { bn: "লাইসেন্স ও মালিকানার শর্ত", en: "License and ownership terms" },
      required: true,
    },
    {
      key: "required_functions",
      label: {
        bn: "যে নির্দিষ্ট কাজগুলো পরীক্ষা করা হবে",
        en: "Specific functions to be tested",
      },
      required: true,
    },
  ],
  items: [
    item(
      "manifest_agreed",
      "ফাইলের তালিকা, ফরম্যাট ও বর্ণনা চুক্তির সাথে মেলে",
      "File manifest, formats and description match the agreement",
      "seller_declares",
    ),
    item(
      "license_and_ownership",
      "লাইসেন্স ও মালিকানার শর্ত জানানো হয়েছে",
      "License and ownership terms stated",
      "seller_declares",
    ),
    item(
      "package_delivered",
      "ফাইলের প্যাকেজ গোপন ভল্টে দেওয়া হয়েছে",
      "File package delivered through the secret vault",
      "vault.package_bound",
      { dataClass: "vault_secret", dependsOn: ["manifest_agreed"] },
    ),
    item(
      "files_open",
      "তালিকার প্রতিটি ফাইল খোলে",
      "Every file in the manifest opens",
      "buyer_confirms",
      { dependsOn: ["package_delivered"] },
    ),
    item(
      "sources_present",
      "সম্পাদনাযোগ্য সোর্স, ফন্ট ও নির্ভরতা আছে",
      "Editable sources, fonts and dependencies are present",
      "buyer_confirms",
      { dependsOn: ["files_open"] },
    ),
    item(
      "functions_tested",
      "চুক্তিতে লেখা কাজগুলো পরীক্ষায় চলে",
      "The functions named in the agreement work when tested",
      "buyer_confirms",
      { dependsOn: ["files_open"] },
    ),
    item(
      "subjective_quality",
      "নান্দনিক মান নিয়ে ক্রেতার মত",
      "Buyer's opinion of creative quality",
      "buyer_confirms",
      { mandatory: false, subjective: true },
    ),
  ],
  residualRisks: [
    {
      bn: "কপি করা ফাইল ফেরত নেওয়া যায় না; ডাউনলোড মান বা মালিকানা প্রমাণ করে না।",
      en: "Copied files cannot be taken back; a download proves neither quality nor ownership.",
    },
    {
      bn: "এনক্রিপ্ট করা ফাইল সার্ভারে ম্যালওয়্যার স্ক্যান করা হয় না।",
      en: "Encrypted files are not scanned for malware by the server.",
    },
  ],
};

const accountTransfer: Template = {
  ...common,
  supportedModes: [...common.supportedModes],
  templateId: "account_transfer",
  version: 1,
  categoryId: "CAT-01",
  name: {
    bn: "অনুমোদিত অ্যাকাউন্ট বা ওয়ার্কস্পেস হস্তান্তর (পরীক্ষামূলক)",
    en: "Permitted account or workspace transfer (synthetic)",
  },
  fields: [
    {
      key: "provider",
      label: { bn: "প্রোভাইডার", en: "Provider" },
      required: true,
    },
    {
      key: "account_identifier",
      label: { bn: "অ্যাকাউন্ট শনাক্তকারী", en: "Account identifier" },
      required: true,
    },
    {
      key: "promised_attributes",
      label: { bn: "প্রতিশ্রুত বৈশিষ্ট্য", en: "Promised account attributes" },
      required: true,
    },
    {
      key: "included_assets",
      label: {
        bn: "অন্তর্ভুক্ত সম্পদ, ব্যালেন্স বা সাবস্ক্রিপশন",
        en: "Included assets, balances or subscriptions",
      },
      required: true,
    },
    {
      key: "transfer_method",
      label: { bn: "অনুমোদিত হস্তান্তর পদ্ধতি", en: "Permitted transfer method" },
      required: true,
    },
  ],
  items: [
    item(
      "account_identity",
      "ঠিক এই অ্যাকাউন্ট ও প্রতিশ্রুত বৈশিষ্ট্য মেলে",
      "The exact account and promised attributes match",
      "mock_account.identity_matches",
    ),
    item(
      "transfer_permitted",
      "হস্তান্তর পদ্ধতি প্রোভাইডার অনুমোদিত",
      "The transfer method is permitted by the provider",
      "seller_declares",
    ),
    item(
      "handover_delivered",
      "অনুমোদিত হস্তান্তর তথ্য গোপন ভল্টে দেওয়া হয়েছে",
      "Permitted handover details delivered through the secret vault",
      "vault.package_bound",
      { dataClass: "vault_secret", dependsOn: ["account_identity"] },
    ),
    item(
      "ownership_transferred",
      "মালিকানা বা অ্যাডমিন হস্তান্তর সম্পন্ন",
      "Ownership or administrator transfer completed",
      "mock_account.transfer_confirmed",
      { dependsOn: ["handover_delivered"] },
    ),
    item(
      "recovery_with_buyer",
      "রিকভারি ইমেইল ও ফোন ক্রেতার নিয়ন্ত্রণে, বিক্রেতারটি সরানো",
      "Recovery channels are the buyer's; the seller's are removed",
      "mock_account.recovery_controlled_by_buyer",
      { dependsOn: ["ownership_transferred"] },
    ),
    // The buyer sets these at the provider. They are never typed into Binimoy.
    item(
      "buyer_own_credentials",
      "ক্রেতা প্রোভাইডারে নিজের নতুন পাসওয়ার্ড ও MFA বসিয়েছেন",
      "Buyer set their own new password and MFA at the provider",
      "buyer_confirms",
      { dependsOn: ["ownership_transferred"] },
    ),
    item(
      "prior_sessions_revoked",
      "আগের সেশন, টোকেন ও সংযুক্ত অ্যাক্সেস বাতিল",
      "Prior sessions, tokens and linked access revoked",
      "mock_account.prior_sessions_revoked",
      { dependsOn: ["buyer_own_credentials"] },
    ),
    item(
      "assets_present",
      "চুক্তিতে লেখা সম্পদ ও অনুমতি আছে",
      "Assets and permissions listed in the agreement are present",
      "buyer_confirms",
      { dependsOn: ["ownership_transferred"] },
    ),
    item(
      "fresh_login",
      "নতুন ডিভাইস থেকে ক্রেতার লগইন ও প্রয়োজনীয় কাজ চলে",
      "Fresh buyer login and required capabilities work",
      "buyer_confirms",
      { dependsOn: ["buyer_own_credentials"] },
    ),
    item(
      "seller_data_removed",
      "বিক্রেতার ব্যক্তিগত তথ্য ও পেমেন্ট পদ্ধতি সরানো",
      "Seller's personal data and payment methods removed",
      "seller_declares",
      { mandatory: false },
    ),
    item(
      "locks_disclosed",
      "ট্রান্সফার লক, অপেক্ষার সময় ও অবশিষ্ট রিকভারি অধিকার জানানো",
      "Transfer locks, waiting periods and residual recovery rights disclosed",
      "seller_declares",
    ),
  ],
  residualRisks: [
    {
      bn: "পাসওয়ার্ড বদলানো স্থায়ী নিয়ন্ত্রণ প্রমাণ করে না; প্রোভাইডার মূল মালিককে অ্যাকাউন্ট ফিরিয়ে দিতে পারে।",
      en: "A password change does not prove permanent control; a provider may restore the account to its original owner.",
    },
    {
      bn: "এটি পরীক্ষামূলক নকল প্রোভাইডার; বাস্তব প্রোভাইডারে একই যাচাই পাওয়া যাবে এমন দাবি নয়।",
      en: "This uses a synthetic mock provider; it is not a claim that a real provider offers the same checks.",
    },
  ],
};

const field = (key: string, bn: string, en: string, required = true) => ({
  key,
  label: { bn, en },
  required,
});
const risk = (bn: string, en: string) => ({ bn, en });
const SYNTHETIC = risk(
  "এটি পরীক্ষামূলক নকল প্রোভাইডার; বাস্তব প্রোভাইডারে একই যাচাই পাওয়া যাবে এমন দাবি নয়।",
  "This uses a synthetic mock provider; it is not a claim that a real provider offers the same checks.",
);
const template = (
  rest: Omit<Template, keyof typeof common | "version"> &
    Partial<Pick<Template, "objectiveRelease" | "milestones" | "timing">>,
): Template => ({
  ...common,
  supportedModes: [...common.supportedModes],
  version: 1,
  ...rest,
});

const gameAccount = template({
  templateId: "game_account",
  categoryId: "CAT-02",
  name: {
    bn: "গেম অ্যাকাউন্ট হস্তান্তর (পরীক্ষামূলক)",
    en: "Game account transfer (synthetic)",
  },
  fields: [
    field("game", "গেম", "Game"),
    field("server", "সার্ভার", "Server"),
    field("region", "অঞ্চল", "Region"),
    field("player_id", "প্লেয়ার আইডি", "Player ID"),
    field("rank", "র‍্যাঙ্ক", "Rank"),
    field("promised_inventory", "প্রতিশ্রুত ইনভেন্টরি", "Promised inventory"),
    field("excluded_assets", "যা ডিলে নেই", "Assets excluded from the deal"),
    field(
      "transfer_cooldown",
      "ট্রান্সফার কুলডাউন ও সীমা",
      "Transfer cooldowns and restrictions",
    ),
  ],
  items: [
    item(
      "account_identity",
      "ঠিক এই প্লেয়ার আইডি, সার্ভার ও অঞ্চল মেলে",
      "The exact player ID, server and region match",
      "mock_account.identity_matches",
    ),
    item(
      "attributes_match",
      "র‍্যাঙ্ক ও ইনভেন্টরি প্রকাশকের রেকর্ডে চুক্তির সাথে মেলে",
      "Rank and inventory match the agreement in the publisher's record",
      "mock_game.attributes_match",
      { dependsOn: ["account_identity"] },
    ),
    item(
      "transfer_permitted",
      "হস্তান্তর প্রকাশকের নিয়মে অনুমোদিত",
      "The transfer is permitted by the publisher's rules",
      "seller_declares",
    ),
    item(
      "handover_delivered",
      "অনুমোদিত হস্তান্তর তথ্য গোপন ভল্টে দেওয়া হয়েছে",
      "Permitted handover details delivered through the secret vault",
      "vault.package_bound",
      { dataClass: "vault_secret", dependsOn: ["account_identity"] },
    ),
    item(
      "ownership_transferred",
      "অ্যাকাউন্টের মালিকানা হস্তান্তর সম্পন্ন",
      "Account ownership transfer completed",
      "mock_account.transfer_confirmed",
      { dependsOn: ["handover_delivered"] },
    ),
    item(
      "recovery_with_buyer",
      "রিকভারি ইমেইল ও ফোন ক্রেতার নিয়ন্ত্রণে",
      "Recovery email and phone are the buyer's",
      "mock_account.recovery_controlled_by_buyer",
      { dependsOn: ["ownership_transferred"] },
    ),
    item(
      "buyer_own_credentials",
      "ক্রেতা প্রকাশকের কাছে নিজের নতুন পাসওয়ার্ড ও MFA বসিয়েছেন",
      "Buyer set their own new password and MFA at the publisher",
      "buyer_confirms",
      { dependsOn: ["ownership_transferred"] },
    ),
    item(
      "linked_accounts_removed",
      "বিক্রেতার সংযুক্ত প্রকাশক অ্যাকাউন্ট ও সেশন সরানো",
      "Seller's linked publisher accounts and sessions removed",
      "mock_account.prior_sessions_revoked",
      { dependsOn: ["buyer_own_credentials"] },
    ),
    item(
      "inventory_seen",
      "ক্রেতা লগইন করে প্রতিশ্রুত ইনভেন্টরি দেখেছেন",
      "Buyer logged in and saw the promised inventory",
      "buyer_confirms",
      { dependsOn: ["buyer_own_credentials"] },
    ),
    item(
      "cooldowns_disclosed",
      "কুলডাউন, সীমা ও বাদ পড়া সম্পদ জানানো হয়েছে",
      "Cooldowns, restrictions and excluded assets disclosed",
      "seller_declares",
    ),
  ],
  residualRisks: [
    risk(
      "স্ক্রিনশট র‍্যাঙ্ক বা ইনভেন্টরির চূড়ান্ত প্রমাণ নয়; প্রকাশক অ্যাকাউন্ট মূল মালিককে ফিরিয়ে দিতে পারে।",
      "Screenshots are not definitive proof of rank or inventory; a publisher may restore the account to its original owner.",
    ),
    SYNTHETIC,
  ],
});

const topUp = template({
  templateId: "game_topup",
  categoryId: "CAT-03",
  name: {
    bn: "গেম টপ-আপ ও ক্রেডিট (পরীক্ষামূলক)",
    en: "Game top-ups and credits (synthetic)",
  },
  fields: [
    field("game", "গেম", "Game"),
    field("server", "সার্ভার", "Server"),
    field("region", "অঞ্চল", "Region"),
    field("player_id", "যে প্লেয়ার আইডিতে যাবে", "Destination player ID"),
    field("quantity", "পরিমাণ", "Quantity"),
  ],
  items: [
    item(
      "supplier_authorized",
      "সরবরাহকারী অনুমোদিত এবং অর্ডার আইডি আছে",
      "Supplier is authorized and an order ID exists",
      "mock_topup.supplier_authorized",
    ),
    item(
      "fulfilled_to_destination",
      "সরবরাহকারীর রেকর্ডে টপ-আপ ঠিক চুক্তির প্লেয়ার আইডিতে গেছে",
      "Supplier's record shows fulfillment to exactly the agreed player ID",
      "mock_topup.fulfilled_to_destination",
      { dependsOn: ["supplier_authorized"] },
    ),
    item(
      "quantity_matches",
      "পাঠানো পরিমাণ চুক্তির সাথে মেলে, এবং অর্ডারটি একবারই পূরণ হয়েছে",
      "Quantity sent matches the agreement and the order was fulfilled once",
      "mock_topup.quantity_matches",
      { dependsOn: ["fulfilled_to_destination"] },
    ),
    item(
      "order_reference",
      "বিক্রেতা অর্ডারের রেফারেন্স দিয়েছেন",
      "Seller gave the order reference",
      "seller_declares",
      { mandatory: false },
    ),
    item(
      "balance_seen",
      "ক্রেতা গেমে ব্যালেন্স দেখেছেন",
      "Buyer saw the balance in the game",
      "buyer_confirms",
      { mandatory: false },
    ),
  ],
  objectiveRelease: true,
  timing: { ...common.timing, objectiveChallengeHours: 24 },
  residualRisks: [
    risk(
      "ভুল আইডিতে পাঠানো টপ-আপ ফেরত আনা যায় না। টাকা দেওয়ার আগে প্লেয়ার আইডি মিলিয়ে নিন।",
      "A top-up sent to a wrong ID cannot be reversed. Check the player ID before funding.",
    ),
    risk(
      "বিক্রেতা 'পাঠিয়েছি' বললেই হবে না; সরবরাহকারীর রেকর্ড চুক্তির আইডির সাথে না মিললে তালিকা অসম্পূর্ণ থাকে।",
      "A seller saying 'sent' is not enough; if the supplier's record does not match the agreed ID the checklist stays incomplete.",
    ),
    SYNTHETIC,
  ],
});

const saas = template({
  templateId: "saas_subscription",
  categoryId: "CAT-05",
  name: {
    bn: "সাবস্ক্রিপশন বা SaaS অ্যাক্সেস (পরীক্ষামূলক)",
    en: "Subscription or SaaS access (synthetic)",
  },
  fields: [
    field("plan", "প্ল্যান", "Plan"),
    field("duration", "মেয়াদ", "Duration"),
    field("user_count", "ব্যবহারকারীর সংখ্যা", "User count"),
    field("features", "ফিচার", "Features"),
    field("region", "অঞ্চল", "Region"),
    field("renewal", "নবায়নের নিয়ম", "Renewal behavior"),
    field(
      "buyer_account",
      "ক্রেতার নিজের অ্যাকাউন্ট বা ওয়ার্কস্পেস",
      "Buyer's own account or workspace",
    ),
  ],
  items: [
    item(
      "plan_matches",
      "প্রোভাইডারের রেকর্ডে প্ল্যান, মেয়াদ ও আসন সংখ্যা চুক্তির সাথে মেলে",
      "Provider's record shows the agreed plan, duration and seat count",
      "mock_saas.plan_matches",
    ),
    item(
      "fulfilled_into_buyer_account",
      "এনটাইটেলমেন্ট ক্রেতার নিজের অ্যাকাউন্টে, সঠিক ভূমিকাসহ",
      "Entitlement is in the buyer's own account with the correct role",
      "mock_saas.role_and_seats",
      { dependsOn: ["plan_matches"] },
    ),
    item(
      "billing_owner_disclosed",
      "বিল কে দেবে এবং বাতিলের নিয়ম জানানো হয়েছে",
      "Billing responsibility and cancellation process disclosed",
      "seller_declares",
    ),
    item(
      "admin_removal_disclosed",
      "বাইরের কোনো অ্যাডমিন পরে ক্রেতাকে সরাতে পারেন কি না জানানো হয়েছে",
      "Whether an external administrator can later remove the buyer is disclosed",
      "seller_declares",
    ),
    item(
      "access_usable",
      "ক্রেতা লগইন করে প্রতিশ্রুত ফিচার ব্যবহার করতে পারছেন",
      "Buyer can log in and use the promised features",
      "buyer_confirms",
      { dependsOn: ["fulfilled_into_buyer_account"] },
    ),
    item(
      "dates_confirmed",
      "শুরুর ও শেষের তারিখ ক্রেতা মিলিয়ে দেখেছেন",
      "Buyer checked the effective start and end dates",
      "buyer_confirms",
      { dependsOn: ["access_usable"] },
    ),
  ],
  residualRisks: [
    risk(
      "ভাগ করা ব্যক্তিগত লগইন অনুমোদিত সাবস্ক্রিপশন নয়; বাইরের অ্যাডমিন পরে অ্যাক্সেস সরিয়ে দিতে পারেন।",
      "A shared personal login is not an authorized subscription; an external administrator may remove access later.",
    ),
    SYNTHETIC,
  ],
});

const giftCard = template({
  templateId: "gift_card",
  categoryId: "CAT-06",
  name: {
    bn: "গিফট কার্ড বা ভাউচার (পরীক্ষামূলক)",
    en: "Gift card or voucher (synthetic)",
  },
  fields: [
    field("issuer", "ইস্যুকারী", "Issuer"),
    field("denomination", "মূল্যমান ও মুদ্রা", "Denomination and currency"),
    field("region", "অঞ্চল", "Region"),
    field("expiry", "মেয়াদ শেষ", "Expiry"),
    field("restrictions", "ব্যবহারের সীমা", "Redemption restrictions"),
  ],
  items: [
    item(
      "source_record",
      "অনুমোদিত উৎস ও কেনার রেকর্ড আছে",
      "Authorized source and purchase record exist",
      "seller_declares",
    ),
    item(
      "code_delivered",
      "কোড গোপন ভল্টে দেওয়া হয়েছে",
      "Code delivered through the secret vault",
      "vault.package_bound",
      { dataClass: "vault_secret", dependsOn: ["source_record"] },
    ),
    item(
      "balance_verified",
      "ইস্যুকারীর রেকর্ডে কোডটি অব্যবহৃত এবং পুরো মূল্যমানের",
      "Issuer's record shows the code unused and at full value",
      "mock_giftcard.balance_matches",
      { dependsOn: ["code_delivered"] },
    ),
    item(
      "redeemed_by_buyer",
      "ক্রেতা নিজের অ্যাকাউন্টে কোড ব্যবহার করতে পেরেছেন",
      "Buyer redeemed the code on their own account",
      "buyer_confirms",
      { dependsOn: ["code_delivered"] },
    ),
  ],
  residualRisks: [
    risk(
      "কোড দেখা মানে ব্যবহার করা নয়। ইস্যুকারী যাচাই না করতে পারলে ফল 'অজানা' থাকে, স্বয়ংক্রিয় মীমাংসা হয় না।",
      "Viewing a code is not redeeming it. If the issuer cannot verify, the result stays unknown and nothing is resolved automatically.",
    ),
    SYNTHETIC,
  ],
});

const sourceCode = template({
  templateId: "source_code",
  categoryId: "CAT-08",
  name: {
    bn: "সফটওয়্যার বা সোর্স কোড প্রকল্প (পরীক্ষামূলক)",
    en: "Software or source-code project (synthetic)",
  },
  fields: [
    field("repository", "রিপোজিটরি বা আর্কাইভ", "Repository or archive"),
    field("version", "সম্মত সংস্করণ", "Agreed version"),
    field("manifest", "ফাইলের তালিকা", "File manifest"),
    field(
      "build_instructions",
      "বিল্ডের নির্দেশনা ও নির্ভরতা",
      "Build instructions and dependencies",
    ),
    field("functional_tests", "যে কাজগুলো পরীক্ষা হবে", "Agreed functional tests"),
    field("license", "লাইসেন্স ও অধিকার", "License rights"),
    field(
      "support_scope",
      "ডকুমেন্টেশন ও সাপোর্টের পরিধি",
      "Documentation and support scope",
    ),
  ],
  items: [
    item(
      "manifest_agreed",
      "সংস্করণ ও ফাইলের তালিকা চুক্তির সাথে মেলে",
      "Version and file manifest match the agreement",
      "seller_declares",
    ),
    item(
      "license_rights",
      "লাইসেন্স ও অধিকার জানানো হয়েছে",
      "License rights stated",
      "seller_declares",
    ),
    item(
      "secrets_removed",
      "বিক্রেতার গোপন কি ও তৃতীয় পক্ষের ক্রেডেনশিয়াল সরানো",
      "Seller secrets and third-party credentials removed",
      "seller_declares",
    ),
    item(
      "archive_delivered",
      "সোর্স আর্কাইভ গোপন ভল্টে দেওয়া হয়েছে",
      "Source archive delivered through the secret vault",
      "vault.package_bound",
      { dataClass: "vault_secret", dependsOn: ["manifest_agreed"] },
    ),
    item(
      "build_and_tests",
      "আলাদা পরিবেশে বিল্ড ও সম্মত পরীক্ষা পাস করেছে",
      "Build and agreed tests pass in an isolated environment",
      "mock_build.tests_pass",
      { dependsOn: ["archive_delivered"] },
    ),
    item(
      "builds_for_buyer",
      "ক্রেতার পরিবেশে নির্দেশনা মেনে বিল্ড হয়",
      "Builds in the buyer's environment following the instructions",
      "buyer_confirms",
      { dependsOn: ["archive_delivered"] },
    ),
    item(
      "docs_present",
      "প্রতিশ্রুত ডকুমেন্টেশন আছে",
      "Promised documentation is present",
      "buyer_confirms",
      { dependsOn: ["archive_delivered"] },
    ),
    item(
      "repository_transferred",
      "রিপোজিটরি বা ডিপ্লয়মেন্টের মালিকানা হস্তান্তর (যদি অনুমোদিত)",
      "Repository or deployment ownership transferred, where permitted",
      "seller_declares",
      { mandatory: false },
    ),
  ],
  residualRisks: [
    risk(
      "আর্কাইভ থাকা মানে প্রকল্প বিল্ড হয় বা প্রতিশ্রুত কাজ আছে, তা নয়। পরীক্ষার ফল শুধু যে পরীক্ষা চালানো হয়েছে তার জন্য।",
      "An archive existing does not prove the project builds or contains the promised work. A test result covers only the tests that ran.",
    ),
    risk(
      "এই সংস্করণে কোড আসলে চালানো হয় না; বিল্ডের ফল একটি নকল রানার থেকে আসে।",
      "This version does not actually run code; the build result comes from a mock runner.",
    ),
  ],
});

const domainSite = template({
  templateId: "domain_website",
  categoryId: "CAT-09",
  name: {
    bn: "ডোমেইন, ওয়েবসাইট ও হোস্টিং স্থানান্তর (পরীক্ষামূলক)",
    en: "Domain, website and hosting migration (synthetic)",
  },
  fields: [
    field("domain", "ডোমেইন", "Domain"),
    field("registrar", "রেজিস্ট্রার", "Registrar"),
    field("expiry", "মেয়াদ শেষ", "Expiry"),
    field("hosting", "হোস্টিং", "Hosting"),
    field(
      "assets",
      "ওয়েবসাইটের ফাইল, ডেটাবেস ও কনটেন্টের অধিকার",
      "Website files, databases and content rights",
    ),
    field("migration_plan", "স্থানান্তরের পরিকল্পনা", "Migration plan"),
  ],
  items: [
    item(
      "transfer_lock_disclosed",
      "ট্রান্সফার লক ও সীমা জানানো হয়েছে",
      "Transfer locks and restrictions disclosed",
      "seller_declares",
    ),
    item(
      "registrar_transfer",
      "রেজিস্ট্রারের রেকর্ডে ডোমেইনটি ক্রেতার নামে",
      "Registrar's record shows the domain with the buyer",
      "mock_registrar.transfer_confirmed",
      { dependsOn: ["transfer_lock_disclosed"] },
    ),
    item(
      "site_assets_delivered",
      "ওয়েবসাইটের ফাইল ও ডেটাবেসের ব্যাকআপ গোপন ভল্টে দেওয়া হয়েছে",
      "Website files and database backup delivered through the secret vault",
      "vault.package_bound",
      { dataClass: "vault_secret" },
    ),
    item(
      "database_present",
      "ডেটাবেস আছে এবং ব্যাকআপ থেকে ফিরিয়ে আনা যায়",
      "Database is present and restores from the backup",
      "buyer_confirms",
      { dependsOn: ["site_assets_delivered"] },
    ),
    item(
      "site_working",
      "DNS ও হোস্টিং বদলের পর সাইটের প্রয়োজনীয় কাজ চলে",
      "Essential site functions work after the DNS and hosting change",
      "buyer_confirms",
      { dependsOn: ["registrar_transfer", "database_present"] },
    ),
    item(
      "buyer_admin_and_billing",
      "অ্যাডমিন অ্যাক্সেস ও বিলিং ক্রেতার নিয়ন্ত্রণে",
      "Administrator access and billing are the buyer's",
      "buyer_confirms",
      { dependsOn: ["registrar_transfer"] },
    ),
    item(
      "seller_access_revoked",
      "বিক্রেতার অ্যাক্সেস সরানো হয়েছে",
      "Seller's access revoked",
      "seller_declares",
      { mandatory: false },
    ),
  ],
  residualRisks: [
    risk(
      "শুধু DNS বদলানো ডোমেইনের মালিকানা প্রমাণ করে না; শুধু হোস্টিং অ্যাক্সেস সব সম্পদ হস্তান্তর প্রমাণ করে না।",
      "A DNS change alone does not prove domain ownership; hosting access alone does not prove every asset transferred.",
    ),
    SYNTHETIC,
  ],
});

const courseAccess = template({
  templateId: "course_access",
  categoryId: "CAT-10",
  name: {
    bn: "কোর্স ও হস্তান্তরযোগ্য ডিজিটাল অ্যাক্সেস (পরীক্ষামূলক)",
    en: "Courses and transferable digital access (synthetic)",
  },
  fields: [
    field("provider", "প্রোভাইডার", "Provider"),
    field("course", "কোর্স বা প্যাকেজ", "Course or access package"),
    field("duration", "মেয়াদ", "Duration"),
    field("account_destination", "যে অ্যাকাউন্টে ভর্তি হবে", "Account to enroll"),
    field(
      "certificate_support",
      "সার্টিফিকেট ও সাপোর্ট",
      "Certificate availability and support scope",
    ),
  ],
  items: [
    item(
      "transfer_permitted",
      "প্রোভাইডারের রেকর্ডে এই এনটাইটেলমেন্ট হস্তান্তরযোগ্য",
      "Provider's record shows this entitlement may be transferred",
      "mock_enrollment.transfer_permitted",
    ),
    item(
      "enrolled",
      "ভর্তি ঠিক চুক্তির অ্যাকাউন্টে নিশ্চিত",
      "Enrollment confirmed on exactly the agreed account",
      "mock_enrollment.enrolled_at_destination",
      { dependsOn: ["transfer_permitted"] },
    ),
    item(
      "duration_matches",
      "মেয়াদ ও প্রতিশ্রুত ফিচার চুক্তির সাথে মেলে",
      "Duration and promised features match the agreement",
      "mock_enrollment.duration_matches",
      { dependsOn: ["enrolled"] },
    ),
    item(
      "buyer_can_open",
      "ক্রেতা কোর্স খুলতে পারছেন",
      "Buyer can open the course",
      "buyer_confirms",
      { mandatory: false },
    ),
  ],
  objectiveRelease: true,
  timing: { ...common.timing, objectiveChallengeHours: 24 },
  residualRisks: [
    risk(
      "ভর্তি নিশ্চিত হওয়া কোর্সের মান বা সার্টিফিকেটের মূল্য প্রমাণ করে না।",
      "Confirmed enrollment does not prove course quality or the value of a certificate.",
    ),
    SYNTHETIC,
  ],
});

const serviceMilestones = template({
  templateId: "service_milestones",
  categoryId: "CAT-11",
  name: { bn: "ডিজিটাল সেবা ও মাইলস্টোন", en: "Digital services and milestones" },
  fields: [
    field("scope", "কাজের পরিধি", "Scope of work"),
    field("exclusions", "যা এর বাইরে", "Explicit exclusions"),
    field(
      "acceptance_criteria",
      "গ্রহণের নির্দিষ্ট মানদণ্ড",
      "Objective acceptance criteria",
    ),
    field(
      "revision_limit",
      "সংশোধনের সীমা ও উত্তরের সময়",
      "Revision limits and response deadlines",
    ),
    field(
      "handover",
      "সোর্স ফাইল ও মালিকানা হস্তান্তর",
      "Source files, ownership rights and handover",
    ),
  ],
  items: [
    item(
      "rights_stated",
      "এই মাইলস্টোনের কাজের মালিকানা ও অধিকার জানানো হয়েছে",
      "Ownership and rights for this milestone's work stated",
      "seller_declares",
    ),
    item(
      "deliverable_delivered",
      "এই মাইলস্টোনের কাজ গোপন ভল্টে দেওয়া হয়েছে",
      "This milestone's deliverable delivered through the secret vault",
      "vault.package_bound",
      { dataClass: "vault_secret" },
    ),
    item(
      "meets_criteria",
      "কাজটি এই মাইলস্টোনের লিখিত মানদণ্ড পূরণ করে",
      "The work meets this milestone's written criteria",
      "buyer_confirms",
      { dependsOn: ["deliverable_delivered"] },
    ),
    item(
      "sources_handed_over",
      "প্রতিশ্রুত সোর্স ফাইল পাওয়া গেছে",
      "Promised source files received",
      "buyer_confirms",
      { dependsOn: ["deliverable_delivered"] },
    ),
    item(
      "subjective_quality",
      "মান নিয়ে ক্রেতার মত",
      "Buyer's opinion of quality",
      "buyer_confirms",
      { mandatory: false, subjective: true },
    ),
  ],
  milestones: true,
  residualRisks: [
    risk(
      "একটি মাইলস্টোন গ্রহণ করলে শুধু সেই মাইলস্টোনের টাকা ছাড়ে; পরের মাইলস্টোনের টাকা আটকে থাকে।",
      "Accepting one milestone releases only that milestone's price; later milestones stay held.",
    ),
    risk(
      "টাকা জমার পর কাজের পরিধি বদলানো যায় না। পরিবর্তন চাইলে দুই পক্ষের সম্মত বণ্টন করে নতুন ডিল করতে হয়।",
      "Scope cannot change after funding. A change needs a mutual allocation and a new deal.",
    ),
  ],
});

export const TEMPLATES: readonly Template[] = [
  accountTransfer,
  gameAccount,
  topUp,
  softwareLicense,
  saas,
  giftCard,
  digitalFiles,
  sourceCode,
  domainSite,
  courseAccess,
  serviceMilestones,
];

// Historical deals keep their own template version, so a lookup is always by
// id and exact version, never "latest".
export function getTemplate(templateId: string, version: number): Template {
  const found = TEMPLATES.find(
    (t) => t.templateId === templateId && t.version === version,
  );
  if (!found) throw new Error(`Unknown template ${templateId} v${version}`);
  return found;
}
