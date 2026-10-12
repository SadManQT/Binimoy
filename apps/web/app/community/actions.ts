"use server";

import { takaToMinor } from "@lp/contracts";
import {
  addFollowup,
  appealReport,
  claimReport,
  decideFollowup,
  decideReport,
  saveDraft,
  submitReport,
  withdrawReport,
} from "@lp/db/community";
import { createSafetyAlert, retractSafetyAlert } from "@lp/db/shops";
import { redirect } from "next/navigation";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";

const text = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();

type Result = { ok: true } | { ok: false; error: string };
const back = (reportId: string, result: Result): never =>
  redirect(
    `/community/${encodeURIComponent(reportId)}${result.ok ? "" : `?error=${result.error}`}`,
  );

// Every function re-checks authorship or the moderator role in the database.

export async function saveDraftAction(form: FormData) {
  const user = await requireUser();
  const reportId = text(form, "reportId");
  const taka = text(form, "amountTaka");
  const amountMinor = taka ? takaToMinor(taka) : null;
  const result =
    taka && !amountMinor
      ? ({ ok: false, error: "VALIDATION_FAILED" } as const)
      : await saveDraft(pool(), {
          userId: user.id,
          reportId: reportId || undefined,
          subject: text(form, "subject"),
          category: text(form, "category"),
          eventDate: text(form, "eventDate") || null,
          experienceType: text(form, "experienceType"),
          amountMinor,
          narrative: text(form, "narrative"),
          publicText: text(form, "publicText"),
          rating: text(form, "rating") ? Number(text(form, "rating")) : null,
          issue: text(form, "issue") || null,
          shopCategory: text(form, "shopCategory") || undefined,
        });
  if (result.ok) redirect(`/community/${result.reportId}`);
  if (reportId) back(reportId, result);
  redirect(`/community?error=${result.error}`);
}

export async function submitReportAction(form: FormData) {
  const user = await requireUser();
  const reportId = text(form, "reportId");
  // The checkbox is the author's approval of the preview shown above it.
  const result =
    form.get("approved") === "yes"
      ? await submitReport(pool(), {
          userId: user.id,
          reportId,
          expectedVersion: Number(text(form, "version")),
        })
      : ({ ok: false, error: "VALIDATION_FAILED" } as const);
  back(reportId, result);
}

export async function withdrawReportAction(form: FormData) {
  const user = await requireUser();
  const reportId = text(form, "reportId");
  back(reportId, await withdrawReport(pool(), { userId: user.id, reportId }));
}

export async function appealReportAction(form: FormData) {
  const user = await requireUser();
  const reportId = text(form, "reportId");
  back(
    reportId,
    await appealReport(pool(), {
      userId: user.id,
      reportId,
      reason: text(form, "reason"),
    }),
  );
}

export async function addFollowupAction(form: FormData) {
  const user = await requireUser();
  const reportId = text(form, "reportId");
  back(
    reportId,
    await addFollowup(pool(), {
      userId: user.id,
      reportId,
      kind: text(form, "kind"),
      body: text(form, "body"),
    }),
  );
}

export async function claimReportAction(form: FormData) {
  const user = await requireUser();
  const reportId = text(form, "reportId");
  const result = await claimReport(pool(), { moderatorId: user.id, reportId });
  redirect(
    result.ok ? `/community/${reportId}` : `/moderation?error=${result.error}`,
  );
}

export async function decideReportAction(form: FormData) {
  const user = await requireUser();
  const reportId = text(form, "reportId");
  const result = await decideReport(pool(), {
    moderatorId: user.id,
    reportId,
    decision: text(form, "decision"),
    reason: text(form, "reason"),
  });
  if (result.ok) redirect("/moderation");
  back(reportId, result);
}

export async function decideFollowupAction(form: FormData) {
  const user = await requireUser();
  const result = await decideFollowup(pool(), {
    moderatorId: user.id,
    followupId: text(form, "followupId"),
    publish: text(form, "publish") === "yes",
    reason: text(form, "reason"),
  });
  redirect(result.ok ? "/moderation" : `/moderation?error=${result.error}`);
}

export async function createSafetyAlertAction(form: FormData) {
  const user = await requireUser();
  const result = await createSafetyAlert(pool(), {
    userId: user.id,
    title: text(form, "title"),
    body: text(form, "body"),
  });
  redirect(result.ok ? "/moderation" : `/moderation?error=${result.error}`);
}

export async function retractSafetyAlertAction(form: FormData) {
  const user = await requireUser();
  const result = await retractSafetyAlert(pool(), {
    userId: user.id,
    alertId: text(form, "alertId"),
  });
  redirect(result.ok ? "/moderation" : `/moderation?error=${result.error}`);
}
