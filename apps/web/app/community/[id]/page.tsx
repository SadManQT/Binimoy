import { formatBdt } from "@lp/contracts";
import { getReport } from "@lp/db/community";
import { notFound } from "next/navigation";
import { ISSUE_TEXT } from "../../../lib/copy";
import { getI18n } from "../../../lib/i18n";
import { pool } from "../../../lib/pool";
import { requireUser } from "../../../lib/session";
import {
  addFollowupAction,
  appealReportAction,
  decideReportAction,
  saveDraftAction,
  submitReportAction,
  withdrawReportAction,
} from "../actions";
import {
  COMMUNITY_ERROR_TEXT,
  EVENT_TEXT,
  EXPERIENCE_TEXT,
  FOLLOWUP_STATUS_TEXT,
  FOLLOWUP_TEXT,
  REPORT_STATE_TEXT,
} from "../copy";

export const dynamic = "force-dynamic";
export const metadata = { title: "এক্সপেরিয়েন্স · বিনিময়" };

const when = (iso: string) => new Date(iso).toLocaleString("bn-BD");

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { locale, t } = await getI18n();
  const L = (bn: string, en: string) => (locale === "en" ? en : bn);
  const { id } = await params;
  const { error } = await searchParams;
  // A draft, an unpublished report and a missing one all look the same.
  const report = await getReport(pool(), { userId: user.id, reportId: id });
  if (!report) notFound();

  const author = report.role === "author";
  const editable =
    author &&
    (report.state === "DRAFT" || report.state === "NEEDS_INFORMATION");
  const ready = Boolean(report.narrative && report.publicText);

  return (
    <main>
      <p>
        <a href="/community">← {t.nav.write}</a>
      </p>
      <h1>{report.subject}</h1>
      <p data-testid="report-state">
        <strong>{t.types[report.experienceType]}</strong> ·{" "}
        {REPORT_STATE_TEXT[report.state]}
        {report.eventDate ? ` · ঘটনার তারিখ: ${report.eventDate}` : ""}
        {report.rating ? ` · লেখকের রেটিং: ${report.rating} / ৫` : ""}
      </p>
      {report.issue && (
        <p data-testid="report-issue">
          <strong>{L("লেখকের রিপোর্ট:", "Reported:")}</strong>{" "}
          {t.issues[report.issue]}{" "}
          <small>
            {L(
              "(লেখকের দাবি, ভেরিফাই করা হয়নি)",
              "(the writer's claim, not verified)",
            )}
          </small>
        </p>
      )}
      {error ? (
        <p role="alert">{COMMUNITY_ERROR_TEXT[error] ?? "কাজটি করা যায়নি।"}</p>
      ) : null}

      {report.state === "WITHDRAWN" && report.role === "public" ? (
        <p data-testid="withdrawn">
          লেখক এই লেখাটি তুলে নিয়েছেন। তুলে নেওয়া মানে লেখাটি মিথ্যা ছিল, তা নয়; সত্য ছিল,
          তাও নয়।
        </p>
      ) : null}

      {report.publicText && !editable ? (
        <section aria-labelledby="text">
          <h2 id="text">
            {report.state === "PUBLISHED" ? "পাবলিশড লেখা" : "প্রকাশের জন্য লেখা"}
          </h2>
          <blockquote data-testid="public-text">{report.publicText}</blockquote>
          <p>
            <small data-testid="unverified-label">
              এটি লেখকের নিজের বক্তব্য। বিনিময় ঘটনাটি ভেরিফাই করেনি। মডারেটর শুধু
              দেখেছেন লেখাটি প্রকাশের নিয়ম মানে কি না। এটি “{report.subject}” সম্পর্কে
              আমাদের কোনো রায় নয়।
            </small>
          </p>
          {report.responseDueAt ? (
            <p>
              <small>
                উত্তর দেওয়ার প্রস্তাবিত সময় {when(report.responseDueAt)} পর্যন্ত; পরেও
                উত্তর দেওয়া যায়। উত্তর না দেওয়া মানে স্বীকার করা নয়।
              </small>
            </p>
          ) : null}
        </section>
      ) : null}

      {report.narrative !== undefined && !editable ? (
        <section aria-labelledby="private" data-testid="private-original">
          <h2 id="private">
            {L(
              "ব্যক্তিগত মূল লেখা (প্রকাশ হয় না)",
              "Private original (never published)",
            )}
          </h2>
          <blockquote>{report.narrative}</blockquote>
          {report.amountMinor ? (
            <p>দাবি করা টাকা: {formatBdt(report.amountMinor)}</p>
          ) : null}
        </section>
      ) : null}

      {editable ? (
        <>
          <section aria-labelledby="edit">
            <h2 id="edit">{L("ড্রাফট", "Draft")}</h2>
            <form action={saveDraftAction}>
              <input type="hidden" name="reportId" value={report.id} />
              <input type="hidden" name="subject" value={report.subject} />
              <label>
                {L("এক্সপেরিয়েন্সের ধরন", "Type of experience")}
                <select
                  name="experienceType"
                  defaultValue={report.experienceType}
                >
                  {Object.entries(t.types).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {L(
                  "আপনার রেটিং (ঐচ্ছিক; এটি আপনার নিজের মূল্যায়ন)",
                  "Your rating (optional; it is your own)",
                )}
                <select name="rating" defaultValue={report.rating ?? ""}>
                  <option value="">{L("রেটিং দিচ্ছি না", "No rating")}</option>
                  <option value="5">{L("৫ · খুব ভালো", "5 · Very good")}</option>
                  <option value="4">{L("৪ · ভালো", "4 · Good")}</option>
                  <option value="3">{L("৩ · মোটামুটি", "3 · Okay")}</option>
                  <option value="2">{L("২ · খারাপ", "2 · Bad")}</option>
                  <option value="1">{L("১ · খুব খারাপ", "1 · Very bad")}</option>
                </select>
              </label>
              <label>
                {L(
                  "রিপোর্ট হলে: কী ঘটেছে (শুধু “রিপোর্ট” বা “মিশ্র” ধরনের জন্য)",
                  "If it is a report: what happened (only for “Report” or “Mixed”)",
                )}
                <select name="issue" defaultValue={report.issue ?? ""}>
                  <option value="">{L("প্রযোজ্য নয়", "Does not apply")}</option>
                  {Object.entries(t.issues).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {L("কী কিনেছিলেন", "What you bought")}
                <input
                  name="category"
                  defaultValue={report.category}
                  maxLength={60}
                />
              </label>
              <label>
                {L("ঘটনার তারিখ (ঐচ্ছিক)", "Date it happened (optional)")}
                <input
                  type="date"
                  name="eventDate"
                  defaultValue={report.eventDate ?? ""}
                />
              </label>
              <label>
                {L(
                  "টাকার পরিমাণ, যদি দাবি থাকে (ঐচ্ছিক)",
                  "Amount, if you are claiming one (optional)",
                )}
                <input
                  name="amountTaka"
                  inputMode="decimal"
                  defaultValue={
                    report.amountMinor
                      ? String(Number(report.amountMinor) / 100)
                      : ""
                  }
                />
              </label>
              <label>
                {L(
                  "আপনার পুরো বিবরণ (ব্যক্তিগত; শুধু আপনি ও দায়িত্বপ্রাপ্ত মডারেটর দেখবেন)",
                  "Your full account (private; only you and the assigned moderator see it)",
                )}
                <textarea
                  name="narrative"
                  rows={6}
                  maxLength={5000}
                  defaultValue={report.narrative}
                  style={{ display: "block", width: "100%", font: "inherit" }}
                />
              </label>
              <label>
                প্রকাশের জন্য লেখা (ফোন নম্বর, অ্যাকাউন্ট বা লেনদেন নম্বর, ঠিকানা, অন্যের নাম
                বাদ দিন)
                <textarea
                  name="publicText"
                  rows={4}
                  maxLength={2000}
                  defaultValue={report.publicText ?? ""}
                  style={{ display: "block", width: "100%", font: "inherit" }}
                />
              </label>
              <button type="submit">
                {L("ড্রাফট সংরক্ষণ করুন", "Save draft")}
              </button>
            </form>
          </section>

          <section aria-labelledby="preview" data-testid="preview">
            <h2 id="preview">
              {L("প্রকাশ হলে যেভাবে দেখাবে", "How it will look when published")}
            </h2>
            {ready ? (
              <>
                <blockquote data-testid="preview-text">
                  {report.publicText}
                </blockquote>
                <form action={submitReportAction}>
                  <input type="hidden" name="reportId" value={report.id} />
                  <input type="hidden" name="version" value={report.version} />
                  <label>
                    <input
                      type="checkbox"
                      name="approved"
                      value="yes"
                      required
                      style={{
                        display: "inline",
                        width: "auto",
                        minHeight: 0,
                      }}
                    />{" "}
                    উপরের লেখাটি আমার নিজের এক্সপেরিয়েন্স, এবং ঠিক এই লেখাটিই প্রকাশের
                    জন্য আমি অ্যাপ্রুভাল করছি।
                  </label>
                  <button type="submit">
                    {L("মডারেটরের কাছে জমা দিন", "Submit to a moderator")}
                  </button>
                </form>
              </>
            ) : (
              <p>
                জমা দিতে হলে পুরো বিবরণ এবং প্রকাশের লেখা, দুটোই লিখে সংরক্ষণ করুন।
                ততক্ষণ এটি আপনার ব্যক্তিগত ড্রাফট।
              </p>
            )}
          </section>
        </>
      ) : null}

      {report.similarity !== undefined && report.similarity >= 0.6 ? (
        <p className="notice" data-testid="similarity-hint">
          এই লেখাটা একই শপ নিয়ে আরেকটা লেখার সাথে{" "}
          {Math.round(report.similarity * 100)}% মিলে যায়। কপি করা হতে পারে; এটা শুধু
          একটা ইঙ্গিত, প্রমাণ না। সিদ্ধান্ত আপনার।
        </p>
      ) : null}

      {report.assignedToMe && report.state === "UNDER_REVIEW" ? (
        <section aria-labelledby="decide" data-testid="moderate">
          <h2 id="decide">{L("মডারেটরের সিদ্ধান্ত", "Moderator's decision")}</h2>
          <p>
            সিদ্ধান্তটি শুধু এই নিয়ে: লেখাটি প্রকাশের নিয়ম মানে কি না। ঘটনা সত্য কি না বা শপটি
            কেমন, তা নিয়ে নয়।
          </p>
          <form action={decideReportAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <label>
              {L("সিদ্ধান্ত", "Decision")}
              <select name="decision" defaultValue="NEEDS_INFORMATION">
                <option value="PUBLISHED">{L("প্রকাশ করুন", "Publish")}</option>
                <option value="NEEDS_INFORMATION">
                  {L("আরও তথ্য চান", "Ask for more")}
                </option>
                <option value="NOT_PUBLISHED">
                  {L("প্রকাশ নয়", "Do not publish")}
                </option>
              </select>
            </label>
            <label>
              {L("কারণ (লেখক দেখবেন)", "Reason (the writer will see it)")}
              <input name="reason" required minLength={10} maxLength={1000} />
            </label>
            <button type="submit">{L("সিদ্ধান্ত দিন", "Decide")}</button>
          </form>
        </section>
      ) : null}

      {report.state === "PUBLISHED" || report.followups.length > 0 ? (
        <section aria-labelledby="followups" data-testid="followups">
          <h2 id="followups">{L("উত্তর ও পরের খবর", "Replies and updates")}</h2>
          {report.followups.length === 0 ? (
            <p>
              {L(
                "এখনো কোনো উত্তর নেই। উত্তর না থাকা মানে স্বীকার করা নয়।",
                "No reply yet. No reply is not an admission.",
              )}
            </p>
          ) : (
            <ul>
              {report.followups.map((f) => (
                <li key={f.id} data-testid="followup">
                  <strong>{FOLLOWUP_TEXT[f.kind]}</strong> · {when(f.at)}
                  {f.status !== "PUBLISHED"
                    ? ` · ${FOLLOWUP_STATUS_TEXT[f.status]}`
                    : ""}
                  <blockquote>{f.body}</blockquote>
                  {f.kind === "RESPONSE" ? (
                    <small>
                      যিনি লিখেছেন তিনি এই পেজ বা শপের পক্ষের কি না, তা ভেরিফাই করা
                      হয়নি।
                    </small>
                  ) : (
                    <small>
                      এটি লেখকের নিজের কথা; ভেরিফাই করা হয়নি। আগের লেখাটি বদলানো
                      হয়নি।
                    </small>
                  )}
                </li>
              ))}
            </ul>
          )}
          {report.state === "PUBLISHED" && report.role !== "moderator" ? (
            <form action={addFollowupAction}>
              <input type="hidden" name="reportId" value={report.id} />
              {author ? (
                <label>
                  {L("কী যোগ করছেন", "What you are adding")}
                  <select name="kind" defaultValue="RESOLUTION">
                    <option value="RESOLUTION">
                      {L("সমাধান হয়েছে", "It was resolved")}
                    </option>
                    <option value="CORRECTION">
                      {L("সংশোধন", "Correction")}
                    </option>
                  </select>
                </label>
              ) : (
                <input type="hidden" name="kind" value="RESPONSE" />
              )}
              <label>
                {author ? "আপনার লেখা" : "এই লেখার উত্তর দিন"}
                <input name="body" required minLength={10} maxLength={2000} />
              </label>
              <button type="submit">
                {L("মডারেটরের কাছে পাঠান", "Send to a moderator")}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {author && report.canAppeal ? (
        <section aria-labelledby="appeal">
          <h2 id="appeal">{L("আপিল", "Appeal")}</h2>
          <p>
            {L(
              "সিদ্ধান্তের সাত দিনের মধ্যে আপিল করা যায়। অন্য একজন মডারেটর দেখবেন।",
              "You can appeal within seven days. A different moderator will look at it.",
            )}
          </p>
          <form action={appealReportAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <label>
              {L("কেন সিদ্ধান্তটি ঠিক নয়", "Why the decision is wrong")}
              <input name="reason" required minLength={10} maxLength={1000} />
            </label>
            <button type="submit">{L("আপিল করুন", "Appeal")}</button>
          </form>
        </section>
      ) : null}

      {author && report.state !== "DRAFT" && report.state !== "WITHDRAWN" ? (
        <section aria-labelledby="withdraw">
          <h2 id="withdraw">{L("তুলে নিন", "Withdraw")}</h2>
          <p>
            তুলে নিলে লেখাটি আর কেউ দেখবে না। লেখাটি যে একসময় ছিল এবং তুলে নেওয়া
            হয়েছে, সেই তথ্য থাকবে।
          </p>
          <form action={withdrawReportAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <button type="submit">
              {L("লেখাটি তুলে নিন", "Withdraw this post")}
            </button>
          </form>
        </section>
      ) : null}

      {report.history.length > 0 ? (
        <section aria-labelledby="history" data-testid="history">
          <h2 id="history">{L("যা যা হয়েছে", "History")}</h2>
          <ol>
            {report.history.map((event) => (
              <li key={`${event.kind}-${event.at}`}>
                {when(event.at)} · {EVENT_TEXT[event.kind] ?? event.kind}
                {event.reason ? `: ${event.reason}` : ""}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
