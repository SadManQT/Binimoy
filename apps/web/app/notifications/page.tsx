import { listNotices, renderNotices } from "@lp/db/notices";
import { NOTICE_TEXT, NOTICE_TEXT_EN } from "../../lib/copy";
import { getI18n } from "../../lib/i18n";
import { pool } from "../../lib/pool";
import { requireUser } from "../../lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "নোটিফিকেশন · বিনিময়" };

export default async function NotificationsPage() {
  const user = await requireUser();
  // Read first, so this page can mark what is new; then record that this
  // signed-in page showed them (D.6). "Shown" is not "read".
  const notices = await listNotices(pool(), user.id);
  await renderNotices(pool(), user.id);
  const { locale } = await getI18n();
  const L = (bn: string, en: string) => (locale === "en" ? en : bn);
  const texts = locale === "en" ? NOTICE_TEXT_EN : NOTICE_TEXT;
  return (
    <main>
      <p>
        <a href="/deals">← {L("আমার ডিল", "My deals")}</a>
      </p>
      <h1>{L("নোটিফিকেশন", "Notifications")}</h1>
      <p>
        {L(
          "এখানে শুধু জানানো হয় কী ঘটেছে। নোটিফিকেশন থেকে সরাসরি কিছু গ্রহণ বা অনুমোদন করা যায় না; সিদ্ধান্ত নিতে ডিলটা খুলুন। এই ভার্সনে ইমেইল বা এসএমএস নোটিফিকেশন পাঠানো হয় না।",
          "This page only tells you what happened. Nothing can be accepted or approved from a notification; open the deal to decide. This version sends no email or SMS notifications.",
        )}
      </p>
      {notices.length === 0 ? (
        <p>{L("এখনো কোনো নোটিফিকেশন নেই।", "No notifications yet.")}</p>
      ) : (
        <ul data-testid="notices">
          {notices.map((notice) => (
            <li key={notice.id} data-kind={notice.kind}>
              {notice.renderedAt ? "" : <strong>{L("নতুন", "New")} · </strong>}
              {texts[notice.kind] ?? notice.kind}
              <br />
              <small>
                {new Date(notice.createdAt).toLocaleString(
                  locale === "en" ? "en-GB" : "bn-BD",
                  {
                    timeZone: "Asia/Dhaka",
                  },
                )}{" "}
                (Asia/Dhaka)
                {notice.dealId ? (
                  <>
                    {" "}
                    · <a href={`/deals/${notice.dealId}`}>{notice.dealTitle}</a>
                  </>
                ) : null}
              </small>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
