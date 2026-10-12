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

export const TEMPLATES: readonly Template[] = [
  softwareLicense,
  digitalFiles,
  accountTransfer,
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
