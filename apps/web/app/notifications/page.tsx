import { listNotices, renderNotices } from "@lp/db/notices";
import { NOTICE_TEXT } from "../../lib/copy";
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
  return (
    <main>
      <p>
        <a href="/deals">← আমার ডিল</a>
      </p>
      <h1>নোটিফিকেশন</h1>
      <p>
        এখানে শুধু জানানো হয় কী ঘটেছে। কোনো নোটিফিকেশন থেকে সরাসরি কিছু গ্রহণ বা অ্যাপ্রুভাল
        করা যায় না; সিদ্ধান্ত নিতে ডিলটি খুলুন। এই সংস্করণে ইমেইল বা এসএমএস নোটিফিকেশন
        পাঠানো হয় না।
      </p>
      {notices.length === 0 ? (
        <p>এখনো কোনো নোটিফিকেশন নেই।</p>
      ) : (
        <ul data-testid="notices">
          {notices.map((notice) => (
            <li key={notice.id} data-kind={notice.kind}>
              {notice.renderedAt ? "" : <strong>নতুন · </strong>}
              {NOTICE_TEXT[notice.kind] ?? notice.kind}
              <br />
              <small>
                {new Date(notice.createdAt).toLocaleString("bn-BD", {
                  timeZone: "Asia/Dhaka",
                })}{" "}
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
