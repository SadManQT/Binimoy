"use server";

import { takaToMinor } from "@lp/contracts";
import { claimDeal, claimReview, decide } from "@lp/db/review";
import { redirect } from "next/navigation";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";

const text = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();

// Every function here re-checks the staff role and the assignment in the
// database. Hiding a button is not the control.

export async function claimReviewAction(form: FormData) {
  const user = await requireUser();
  const disputeId = text(form, "disputeId");
  const result = await claimReview(pool(), { reviewerId: user.id, disputeId });
  redirect(
    result.ok ? `/review/${disputeId}` : `/review?error=${result.error}`,
  );
}

export async function claimDealAction(form: FormData) {
  const user = await requireUser();
  const result = await claimDeal(pool(), {
    reviewerId: user.id,
    dealId: text(form, "dealId"),
  });
  redirect(result.ok ? "/review" : `/review?error=${result.error}`);
}

export async function decideAction(form: FormData) {
  const user = await requireUser();
  const disputeId = text(form, "disputeId");
  const result = await decide(pool(), {
    reviewerId: user.id,
    disputeId,
    decision: {
      outcome: text(form, "outcome"),
      toSellerMinor: takaToMinor(text(form, "toSellerTaka")) ?? "",
      rule: text(form, "rule"),
      facts: text(form, "facts"),
      rejectedInferences: text(form, "rejectedInferences"),
      reasoning: text(form, "reasoning"),
    },
  });
  redirect(
    result.ok ? "/review" : `/review/${disputeId}?error=${result.error}`,
  );
}
