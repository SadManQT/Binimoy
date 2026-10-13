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

const LABELS: [Step["key"], string, string][] = [
  ["agreed", "দুই পক্ষ সম্মত", "Both sides agreed"],
  ["funded", "টাকা জমা (টেস্ট)", "Money paid in (test)"],
  ["delivered", "ডেলিভারি জমা", "Delivery submitted"],
  ["inspected", "সব আবশ্যক চেক পাস", "All required checks passed"],
  ["settled", "টাকার সেটেলমেন্ট", "Money settled"],
];

export function nextStep(
  deal: DealSnapshot,
  locale: "bn" | "en" = "bn",
): { text: string; steps: Step[] } {
  const L = (bn: string, en: string) => (locale === "en" ? en : bn);
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
    text = L(
      "একটি ডিসপিউট খোলা আছে, তাই না-পাঠানো টাকা আটকে আছে। মীমাংসার উপায়গুলো নিচে দেখুন।",
      "A dispute is open, so money that has not been sent is held. See the ways to settle it below.",
    );
  } else if (deal.settlement) {
    text = finished.settled
      ? L(
          "সেটেলমেন্ট সম্পন্ন। রসিদে পুরো রেকর্ড আছে।",
          "Settlement is complete. The receipt has the full record.",
        )
      : operations.includes("FAILED_FINAL")
        ? L(
            "টাকা পাঠানো ব্যর্থ হয়েছে এবং টাকা আবার আটকে রাখা হয়েছে।",
            "The transfer failed and the money is held again.",
          )
        : L(
            "সেটেলমেন্টের অনুমোদন হয়েছে, কিন্তু টাকা পাঠানো এখনো চূড়ান্ত নয়।",
            "Settlement is approved, but the transfer is not final yet.",
          );
  } else if (deal.parties < 2) {
    text = L(
      "অন্য পক্ষকে ইনভাইট লিংক পাঠান।",
      "Send the invite link to the other side.",
    );
  } else if (deal.agreementState === "DRAFT") {
    text = L(
      "শর্ত ঠিক থাকলে সম্মতির জন্য পাঠান।",
      "If the terms are right, send them for agreement.",
    );
  } else if (deal.agreementState === "AWAITING_ACCEPTANCE") {
    text = deal.acceptedByMe
      ? L(
          "আপনি সম্মতি দিয়েছেন। অন্য পক্ষের সম্মতির অপেক্ষা।",
          "You have agreed. Waiting for the other side to agree.",
        )
      : L("শর্তগুলো পড়ে সম্মতি দিন।", "Read the terms and agree to them.");
  } else if (!finished.agreed) {
    text = L("এই ডিল আর চালু নেই।", "This deal is no longer active.");
  } else if (!finished.funded) {
    text = buyer
      ? L("টাকা জমা দিন (টেস্ট মানি)।", "Pay the money in (test money).")
      : L("বায়ারের টাকা জমার অপেক্ষা।", "Waiting for the buyer to pay in.");
  } else if (!deal.package) {
    text = buyer
      ? L("সেলারের ডেলিভারির অপেক্ষা।", "Waiting for the seller to deliver.")
      : L("ডেলিভারি জমা দিন।", "Submit the delivery.");
  } else if (!finished.inspected) {
    text = buyer
      ? L(
          "প্রতিটি আবশ্যক অংশ চেক করুন। যা মিলছে না, তা “ব্যর্থ” বা “চেক করা যাচ্ছে না” লিখুন।",
          "Check every required part. Mark what does not match as “Failed” or “Cannot check”.",
        )
      : L(
          "বায়ারের চেক বা প্রোভাইডারের উত্তরের অপেক্ষা।",
          "Waiting for the buyer's check or the provider's answer.",
        );
  } else {
    text = buyer
      ? L(
          "সব আবশ্যক চেক পাস। ঠিক থাকলে ডেলিভারি গ্রহণ করুন।",
          "All required checks passed. If it is right, accept the delivery.",
        )
      : L(
          "সব আবশ্যক চেক পাস। বায়ারের গ্রহণের অপেক্ষা।",
          "All required checks passed. Waiting for the buyer to accept.",
        );
  }

  let reached = true;
  const steps = LABELS.map(([key, bn, en]): Step => {
    const label = L(bn, en);
    const done = reached && finished[key];
    const state = done ? "done" : reached ? "now" : "todo";
    if (!done) reached = false;
    return { key, label, state };
  });
  return { text, steps };
}
