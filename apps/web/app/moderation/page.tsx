import { moderationQueue } from "@lp/db/community";
import { listAlerts } from "@lp/db/shops";
import { notFound } from "next/navigation";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";
import {
  claimReportAction,
  createSafetyAlertAction,
  decideFollowupAction,
  retractSafetyAlertAction,
} from "../community/actions";
import {
  COMMUNITY_ERROR_TEXT,
  FOLLOWUP_TEXT,
  REPORT_STATE_TEXT,
} from "../community/copy";

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

  return (
    <main>
      <h1>মডারেশনের সারি</h1>
      {error ? (
        <p role="alert">{COMMUNITY_ERROR_TEXT[error] ?? "কাজটি করা যায়নি।"}</p>
      ) : null}
      <p>
        আপনার নিজের লেখা এখানে আসে না। আপনি দেখেন লেখাটি প্রকাশের নিয়ম মানে কি না; ঘটনা
        সত্য কি না, সে রায় আপনি দেন না। কোনো ডিল বা ভল্টের তথ্য এখান থেকে দেখা যায় না।
      </p>

      <h2>জমা পড়া লেখা</h2>
      {queue.reports.length === 0 ? (
        <p>এখন কিছু অপেক্ষায় নেই।</p>
      ) : (
        <ul data-testid="report-queue">
          {queue.reports.map((report) => (
            <li key={report.id}>
              {report.subject} · {REPORT_STATE_TEXT[report.state]}
              {report.appeal ? " · আপিল" : ""}
              {report.mine ? (
                <>
                  {" "}
                  · <a href={`/community/${report.id}`}>আমার কেস খুলুন</a>
                </>
              ) : (
                <form action={claimReportAction}>
                  <input type="hidden" name="reportId" value={report.id} />
                  <button type="submit">দায়িত্ব নিন: {report.subject}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>উত্তর ও পরের খবর</h2>
      {queue.followups.length === 0 ? (
        <p>এখন কিছু অপেক্ষায় নেই।</p>
      ) : (
        <ul data-testid="followup-queue">
          {queue.followups.map((f) => (
            <li key={f.id}>
              <strong>{FOLLOWUP_TEXT[f.kind]}</strong> ·{" "}
              <a href={`/community/${f.reportId}`}>মূল লেখা</a>
              <blockquote>{f.body}</blockquote>
              <form action={decideFollowupAction}>
                <input type="hidden" name="followupId" value={f.id} />
                <label>
                  সিদ্ধান্ত
                  <select name="publish" defaultValue="no">
                    <option value="yes">প্রকাশ করুন</option>
                    <option value="no">প্রকাশ নয়</option>
                  </select>
                </label>
                <label>
                  কারণ
                  <input
                    name="reason"
                    required
                    minLength={10}
                    maxLength={1000}
                  />
                </label>
                <button type="submit">সিদ্ধান্ত দিন</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="alerts">
        <h2 id="alerts">সাধারণ ওয়ার্নিং</h2>
        <p>
          একটি ধরনের প্রতারণার কৌশল নিয়ে সাধারণ অ্যালার্ট, যা “অ্যালার্ট” পাতায় সবার উপরে দেখায়।
          এটি আপনার নামে রেকর্ড হয়। নির্দিষ্ট কাউকে দোষী বলবেন না; ফোন নম্বর বা অ্যাকাউন্ট
          নম্বর লিখবেন না। বদলানো যায় না, শুধু তুলে নেওয়া যায়।
        </p>
        <form action={createSafetyAlertAction}>
          <label>
            শিরোনাম
            <input name="title" required minLength={8} maxLength={120} />
          </label>
          <label>
            ওয়ার্নিং
            <textarea name="body" required minLength={40} maxLength={2000} />
          </label>
          <button type="submit">ওয়ার্নিং প্রকাশ করুন</button>
        </form>
        {notes.length > 0 && (
          <ul className="rows" data-testid="live-notes">
            {notes.map((note) => (
              <li key={note.id}>
                <strong>{note.title}</strong>
                <form action={retractSafetyAlertAction}>
                  <input type="hidden" name="alertId" value={note.id} />
                  <button type="submit" className="quiet">
                    তুলে নিন: {note.title}
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
