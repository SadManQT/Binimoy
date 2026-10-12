import { formatBdt } from "@lp/contracts";
import { getReport } from "@lp/db/community";
import { notFound } from "next/navigation";
import { ISSUE_TEXT } from "../../../lib/copy";
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
export const metadata = { title: "অভিজ্ঞতা · বিনিময়" };

const when = (iso: string) => new Date(iso).toLocaleString("bn-BD");

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
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
        <a href="/community">← অভিজ্ঞতার পাতা</a>
      </p>
      <h1>“{report.subject}” সম্পর্কে একজন ব্যবহারকারীর লেখা</h1>
      <p data-testid="report-state">
        <strong>{EXPERIENCE_TEXT[report.experienceType]}</strong> ·{" "}
        {REPORT_STATE_TEXT[report.state]}
        {report.eventDate ? ` · ঘটনার তারিখ: ${report.eventDate}` : ""}
        {report.rating ? ` · লেখকের রেটিং: ${report.rating} / ৫` : ""}
      </p>
      {report.issue && (
        <p data-testid="report-issue">
          <strong>লেখকের অভিযোগ:</strong> {ISSUE_TEXT[report.issue]}{" "}
          <small>(লেখকের দাবি, যাচাই করা হয়নি)</small>
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
            {report.state === "PUBLISHED" ? "প্রকাশিত লেখা" : "প্রকাশের জন্য লেখা"}
          </h2>
          <blockquote data-testid="public-text">{report.publicText}</blockquote>
          <p>
            <small data-testid="unverified-label">
              এটি লেখকের নিজের বক্তব্য। বিনিময় ঘটনাটি যাচাই করেনি। মডারেটর শুধু দেখেছেন
              লেখাটি প্রকাশের নিয়ম মানে কি না। এটি “{report.subject}” সম্পর্কে আমাদের
              কোনো রায় নয়।
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
          <h2 id="private">ব্যক্তিগত মূল লেখা (প্রকাশ হয় না)</h2>
          <blockquote>{report.narrative}</blockquote>
          {report.amountMinor ? (
            <p>দাবি করা টাকা: {formatBdt(report.amountMinor)}</p>
          ) : null}
        </section>
      ) : null}

      {editable ? (
        <>
          <section aria-labelledby="edit">
            <h2 id="edit">খসড়া</h2>
            <form action={saveDraftAction}>
              <input type="hidden" name="reportId" value={report.id} />
              <input type="hidden" name="subject" value={report.subject} />
              <label>
                অভিজ্ঞতার ধরন
                <select
                  name="experienceType"
                  defaultValue={report.experienceType}
                >
                  {Object.entries(EXPERIENCE_TEXT).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                আপনার রেটিং (ঐচ্ছিক; এটি আপনার নিজের মূল্যায়ন)
                <select name="rating" defaultValue={report.rating ?? ""}>
                  <option value="">রেটিং দিচ্ছি না</option>
                  <option value="5">৫ · খুব ভালো</option>
                  <option value="4">৪ · ভালো</option>
                  <option value="3">৩ · মোটামুটি</option>
                  <option value="2">২ · খারাপ</option>
                  <option value="1">১ · খুব খারাপ</option>
                </select>
              </label>
              <label>
                অভিযোগ হলে: কী ঘটেছে (শুধু “অভিযোগ” বা “মিশ্র” ধরনের জন্য)
                <select name="issue" defaultValue={report.issue ?? ""}>
                  <option value="">প্রযোজ্য নয়</option>
                  {Object.entries(ISSUE_TEXT).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                কী কিনেছিলেন
                <input
                  name="category"
                  defaultValue={report.category}
                  maxLength={60}
                />
              </label>
              <label>
                ঘটনার তারিখ (ঐচ্ছিক)
                <input
                  type="date"
                  name="eventDate"
                  defaultValue={report.eventDate ?? ""}
                />
              </label>
              <label>
                টাকার পরিমাণ, যদি দাবি থাকে (ঐচ্ছিক)
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
                আপনার পুরো বিবরণ (ব্যক্তিগত; শুধু আপনি ও দায়িত্বপ্রাপ্ত মডারেটর দেখবেন)
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
              <button type="submit">খসড়া সংরক্ষণ করুন</button>
            </form>
          </section>

          <section aria-labelledby="preview" data-testid="preview">
            <h2 id="preview">প্রকাশ হলে যেভাবে দেখাবে</h2>
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
                    উপরের লেখাটি আমার নিজের অভিজ্ঞতা, এবং ঠিক এই লেখাটিই প্রকাশের জন্য
                    আমি অনুমোদন করছি।
                  </label>
                  <button type="submit">মডারেটরের কাছে জমা দিন</button>
                </form>
              </>
            ) : (
              <p>
                জমা দিতে হলে পুরো বিবরণ এবং প্রকাশের লেখা, দুটোই লিখে সংরক্ষণ করুন।
                ততক্ষণ এটি আপনার ব্যক্তিগত খসড়া।
              </p>
            )}
          </section>
        </>
      ) : null}

      {report.assignedToMe && report.state === "UNDER_REVIEW" ? (
        <section aria-labelledby="decide" data-testid="moderate">
          <h2 id="decide">মডারেটরের সিদ্ধান্ত</h2>
          <p>
            সিদ্ধান্তটি শুধু এই নিয়ে: লেখাটি প্রকাশের নিয়ম মানে কি না। ঘটনা সত্য কি না বা
            দোকানটি কেমন, তা নিয়ে নয়।
          </p>
          <form action={decideReportAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <label>
              সিদ্ধান্ত
              <select name="decision" defaultValue="NEEDS_INFORMATION">
                <option value="PUBLISHED">প্রকাশ করুন</option>
                <option value="NEEDS_INFORMATION">আরও তথ্য চান</option>
                <option value="NOT_PUBLISHED">প্রকাশ নয়</option>
              </select>
            </label>
            <label>
              কারণ (লেখক দেখবেন)
              <input name="reason" required minLength={10} maxLength={1000} />
            </label>
            <button type="submit">সিদ্ধান্ত দিন</button>
          </form>
        </section>
      ) : null}

      {report.state === "PUBLISHED" || report.followups.length > 0 ? (
        <section aria-labelledby="followups" data-testid="followups">
          <h2 id="followups">উত্তর ও পরের খবর</h2>
          {report.followups.length === 0 ? (
            <p>এখনো কোনো উত্তর নেই। উত্তর না থাকা মানে স্বীকার করা নয়।</p>
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
                      যিনি লিখেছেন তিনি এই পেজ বা দোকানের পক্ষের কি না, তা যাচাই করা
                      হয়নি।
                    </small>
                  ) : (
                    <small>
                      এটি লেখকের নিজের কথা; যাচাই করা হয়নি। আগের লেখাটি বদলানো হয়নি।
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
                  কী যোগ করছেন
                  <select name="kind" defaultValue="RESOLUTION">
                    <option value="RESOLUTION">সমাধান হয়েছে</option>
                    <option value="CORRECTION">সংশোধন</option>
                  </select>
                </label>
              ) : (
                <input type="hidden" name="kind" value="RESPONSE" />
              )}
              <label>
                {author ? "আপনার লেখা" : "এই লেখার উত্তর দিন"}
                <input name="body" required minLength={10} maxLength={2000} />
              </label>
              <button type="submit">মডারেটরের কাছে পাঠান</button>
            </form>
          ) : null}
        </section>
      ) : null}

      {author && report.canAppeal ? (
        <section aria-labelledby="appeal">
          <h2 id="appeal">আপিল</h2>
          <p>সিদ্ধান্তের সাত দিনের মধ্যে আপিল করা যায়। অন্য একজন মডারেটর দেখবেন।</p>
          <form action={appealReportAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <label>
              কেন সিদ্ধান্তটি ঠিক নয়
              <input name="reason" required minLength={10} maxLength={1000} />
            </label>
            <button type="submit">আপিল করুন</button>
          </form>
        </section>
      ) : null}

      {author && report.state !== "DRAFT" && report.state !== "WITHDRAWN" ? (
        <section aria-labelledby="withdraw">
          <h2 id="withdraw">তুলে নিন</h2>
          <p>
            তুলে নিলে লেখাটি আর কেউ দেখবে না। লেখাটি যে একসময় ছিল এবং তুলে নেওয়া
            হয়েছে, সেই তথ্য থাকবে।
          </p>
          <form action={withdrawReportAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <button type="submit">লেখাটি তুলে নিন</button>
          </form>
        </section>
      ) : null}

      {report.history.length > 0 ? (
        <section aria-labelledby="history" data-testid="history">
          <h2 id="history">যা যা হয়েছে</h2>
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
