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
  ["funded", "টাকা জমা (নকল)"],
  ["delivered", "সরবরাহ জমা"],
  ["inspected", "সব আবশ্যক পরীক্ষা পাস"],
  ["settled", "টাকার নিষ্পত্তি"],
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
      "একটি বিরোধ খোলা আছে, তাই না-পাঠানো টাকা আটকে আছে। মীমাংসার উপায়গুলো নিচে দেখুন।";
  } else if (deal.settlement) {
    text = finished.settled
      ? "নিষ্পত্তি সম্পন্ন। রসিদে পুরো রেকর্ড আছে।"
      : operations.includes("FAILED_FINAL")
        ? "টাকা পাঠানো ব্যর্থ হয়েছে এবং টাকা আবার আটকে রাখা হয়েছে।"
        : "নিষ্পত্তির অনুমোদন হয়েছে, কিন্তু টাকা পাঠানো এখনো চূড়ান্ত নয়।";
  } else if (deal.parties < 2) {
    text = "অন্য পক্ষকে আমন্ত্রণ লিংক পাঠান।";
  } else if (deal.agreementState === "DRAFT") {
    text = "শর্ত ঠিক থাকলে সম্মতির জন্য পাঠান।";
  } else if (deal.agreementState === "AWAITING_ACCEPTANCE") {
    text = deal.acceptedByMe
      ? "আপনি সম্মতি দিয়েছেন। অন্য পক্ষের সম্মতির অপেক্ষা।"
      : "শর্তগুলো পড়ে সম্মতি দিন।";
  } else if (!finished.agreed) {
    text = "এই ডিল আর চালু নেই।";
  } else if (!finished.funded) {
    text = buyer ? "টাকা জমা দিন (নকল টাকা)।" : "ক্রেতার টাকা জমার অপেক্ষা।";
  } else if (!deal.package) {
    text = buyer ? "বিক্রেতার সরবরাহের অপেক্ষা।" : "সরবরাহ জমা দিন।";
  } else if (!finished.inspected) {
    text = buyer
      ? "প্রতিটি আবশ্যক অংশ পরীক্ষা করুন। যা মিলছে না, তা “ব্যর্থ” বা “পরীক্ষা করা যাচ্ছে না” লিখুন।"
      : "ক্রেতার পরীক্ষা বা প্রোভাইডারের উত্তরের অপেক্ষা।";
  } else {
    text = buyer
      ? "সব আবশ্যক পরীক্ষা পাস। ঠিক থাকলে সরবরাহ গ্রহণ করুন।"
      : "সব আবশ্যক পরীক্ষা পাস। ক্রেতার গ্রহণের অপেক্ষা।";
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
