import { moderationQueue } from "@lp/db/community";
import { listAlerts } from "@lp/db/shops";
import { notFound } from "next/navigation";
import { getI18n } from "../../lib/i18n";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";
import {
  claimReportAction,
  createSafetyAlertAction,
  decideFollowupAction,
  retractSafetyAlertAction,
} from "../community/actions";
import { communityCopy } from "../community/copy";

export const dynamic = "force-dynamic";
export const metadata = { title: "মডারেশন · বিনিময়" };

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;
  // Not a moderator and "no such page" look the same on purpose.
  const queue = await moderationQueue(pool(), user.id);
  if (!queue) notFound();
  const { notes } = await listAlerts(pool(), { limit: 1 });
  const { locale, L } = await getI18n();
  const { COMMUNITY_ERROR_TEXT, FOLLOWUP_TEXT, REPORT_STATE_TEXT } =
    communityCopy(locale);
  const nothing = L("এখন কিছু অপেক্ষায় নেই।", "Nothing is waiting right now.");

  return (
    <main>
      <h1>{L("মডারেশনের সারি", "Moderation queue")}</h1>
      {error ? (
        <p role="alert">
          {COMMUNITY_ERROR_TEXT[error] ??
            L("কাজটি করা যায়নি।", "That could not be done.")}
        </p>
      ) : null}
      <p>
        {L(
          "আপনার নিজের লেখা এখানে আসে না। আপনি দেখেন লেখাটি প্রকাশের নিয়ম মানে কি না; ঘটনা সত্য কি না, সে রায় আপনি দেন না। কোনো ডিল বা ভল্টের তথ্য এখান থেকে দেখা যায় না।",
          "Your own writing does not come here. You check whether a text follows the publishing rules; you do not rule on whether the events are true. No deal or vault information can be seen from here.",
        )}
      </p>

      <h2>{L("জমা পড়া লেখা", "Submitted texts")}</h2>
      {queue.reports.length === 0 ? (
        <p>{nothing}</p>
      ) : (
        <ul data-testid="report-queue">
          {queue.reports.map((report) => (
            <li key={report.id}>
              {report.subject} · {REPORT_STATE_TEXT[report.state]}
              {report.appeal ? L(" · আপিল", " · appeal") : ""}
              {report.mine ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={`/community/${report.id}`}>
                    {L("আমার কেস খুলুন", "Open my case")}
                  </a>
                </>
              ) : (
                <form action={claimReportAction}>
                  <input type="hidden" name="reportId" value={report.id} />
                  <button type="submit">
                    {L("দায়িত্ব নিন", "Take this")}: {report.subject}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>{L("উত্তর ও পরের খবর", "Replies and updates")}</h2>
      {queue.followups.length === 0 ? (
        <p>{nothing}</p>
      ) : (
        <ul data-testid="followup-queue">
          {queue.followups.map((f) => (
            <li key={f.id}>
              <strong>{FOLLOWUP_TEXT[f.kind]}</strong> ·{" "}
              <a href={`/community/${f.reportId}`}>
                {L("মূল লেখা", "Original text")}
              </a>
              <blockquote>{f.body}</blockquote>
              <form action={decideFollowupAction}>
                <input type="hidden" name="followupId" value={f.id} />
                <label>
                  {L("সিদ্ধান্ত", "Decision")}
                  <select name="publish" defaultValue="no">
                    <option value="yes">{L("প্রকাশ করুন", "Publish")}</option>
                    <option value="no">{L("প্রকাশ নয়", "Do not publish")}</option>
                  </select>
                </label>
                <label>
                  {L("কারণ", "Reason")}
                  <input
                    name="reason"
                    required
                    minLength={10}
                    maxLength={1000}
                  />
                </label>
                <button type="submit">{L("সিদ্ধান্ত দিন", "Decide")}</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="alerts">
        <h2 id="alerts">{L("সাধারণ ওয়ার্নিং", "General warnings")}</h2>
        <p>
          {L(
            "একটি ধরনের প্রতারণার কৌশল নিয়ে সাধারণ অ্যালার্ট, যা “অ্যালার্ট” পাতায় সবার উপরে দেখায়। এটি আপনার নামে রেকর্ড হয়। নির্দিষ্ট কাউকে দোষী বলবেন না; ফোন নম্বর বা অ্যাকাউন্ট নম্বর লিখবেন না। বদলানো যায় না, শুধু তুলে নেওয়া যায়।",
            "A general alert about one kind of scam method, shown at the top of the “Alerts” page. It is recorded under your name. Do not call any specific person guilty; do not write phone or account numbers. It cannot be edited, only withdrawn.",
          )}
        </p>
        <form action={createSafetyAlertAction}>
          <label>
            {L("শিরোনাম", "Title")}
            <input name="title" required minLength={8} maxLength={120} />
          </label>
          <label>
            {L("ওয়ার্নিং", "Warning")}
            <textarea name="body" required minLength={40} maxLength={2000} />
          </label>
          <button type="submit">
            {L("ওয়ার্নিং প্রকাশ করুন", "Publish the warning")}
          </button>
        </form>
        {notes.length > 0 && (
          <ul className="rows" data-testid="live-notes">
            {notes.map((note) => (
              <li key={note.id}>
                <strong>{note.title}</strong>
                <form action={retractSafetyAlertAction}>
                  <input type="hidden" name="alertId" value={note.id} />
                  <button type="submit" className="quiet">
                    {L("তুলে নিন", "Withdraw")}: {note.title}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
