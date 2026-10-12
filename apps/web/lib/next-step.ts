// Spec C36.2: one place on the deal page that says what happens next, for
// the person looking at it. Pure, so it can be tested without a database.

export type DealSnapshot = {
  myRole: "buyer" | "seller";
  parties: number;
  agreementState: string;
  acceptedByMe: boolean;
  funded: boolean;
  // The current delivery: whether it was accepted, and the state of each
  // mandatory check.
  package: { accepted: boolean; mandatory: string[] } | null;
  // The latest live settlement and the state of each of its transfers.
  settlement: { operations: string[] } | null;
  disputeOpen: boolean;
};

export type Step = {
  key: "agreed" | "funded" | "delivered" | "inspected" | "settled";
  label: string;
  state: "done" | "now" | "todo";
};

const LABELS: [Step["key"], string][] = [
  ["agreed", "দুই পক্ষ সম্মত"],
  ["funded", "টাকা জমা (টেস্ট)"],
  ["delivered", "ডেলিভারি জমা"],
  ["inspected", "সব আবশ্যক চেক পাস"],
  ["settled", "টাকার সেটেলমেন্ট"],
];

export function nextStep(deal: DealSnapshot): { text: string; steps: Step[] } {
  const buyer = deal.myRole === "buyer";
  const operations = deal.settlement?.operations ?? [];
  const finished = {
    agreed: deal.agreementState === "ACCEPTED",
    funded: deal.funded,
    delivered: deal.package !== null,
    inspected:
      deal.package !== null &&
      deal.package.mandatory.every((state) => state === "PASSED"),
    // C36.3: settled means every transfer actually succeeded.
    settled:
      operations.length > 0 &&
      operations.every((state) => state === "SUCCEEDED"),
  };

  let text: string;
  if (deal.disputeOpen) {
    text =
      "একটি ডিসপিউট খোলা আছে, তাই না-পাঠানো টাকা আটকে আছে। মীমাংসার উপায়গুলো নিচে দেখুন।";
  } else if (deal.settlement) {
    text = finished.settled
      ? "সেটেলমেন্ট সম্পন্ন। রসিদে পুরো রেকর্ড আছে।"
      : operations.includes("FAILED_FINAL")
        ? "টাকা পাঠানো ব্যর্থ হয়েছে এবং টাকা আবার আটকে রাখা হয়েছে।"
        : "সেটেলমেন্টের অনুমোদন হয়েছে, কিন্তু টাকা পাঠানো এখনো চূড়ান্ত নয়।";
  } else if (deal.parties < 2) {
    text = "অন্য পক্ষকে ইনভাইট লিংক পাঠান।";
  } else if (deal.agreementState === "DRAFT") {
    text = "শর্ত ঠিক থাকলে সম্মতির জন্য পাঠান।";
  } else if (deal.agreementState === "AWAITING_ACCEPTANCE") {
    text = deal.acceptedByMe
      ? "আপনি সম্মতি দিয়েছেন। অন্য পক্ষের সম্মতির অপেক্ষা।"
      : "শর্তগুলো পড়ে সম্মতি দিন।";
  } else if (!finished.agreed) {
    text = "এই ডিল আর চালু নেই।";
  } else if (!finished.funded) {
    text = buyer ? "টাকা জমা দিন (টেস্ট মানি)।" : "বায়ারের টাকা জমার অপেক্ষা।";
  } else if (!deal.package) {
    text = buyer ? "সেলারের ডেলিভারির অপেক্ষা।" : "ডেলিভারি জমা দিন।";
  } else if (!finished.inspected) {
    text = buyer
      ? "প্রতিটি আবশ্যক অংশ চেক করুন। যা মিলছে না, তা “ব্যর্থ” বা “চেক করা যাচ্ছে না” লিখুন।"
      : "বায়ারের চেক বা প্রোভাইডারের উত্তরের অপেক্ষা।";
  } else {
    text = buyer
      ? "সব আবশ্যক চেক পাস। ঠিক থাকলে ডেলিভারি গ্রহণ করুন।"
      : "সব আবশ্যক চেক পাস। বায়ারের গ্রহণের অপেক্ষা।";
  }

  let reached = true;
  const steps = LABELS.map(([key, label]): Step => {
    const done = reached && finished[key];
    const state = done ? "done" : reached ? "now" : "todo";
    if (!done) reached = false;
    return { key, label, state };
  });
  return { text, steps };
}
