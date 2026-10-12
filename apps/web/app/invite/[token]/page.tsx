import { peekInvite } from "@lp/db/agreements";
import { ERROR_TEXT, ROLE_TEXT } from "../../../lib/copy";
import { pool } from "../../../lib/pool";
import { requireUser } from "../../../lib/session";
import { acceptInviteAction } from "../../deals/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "আমন্ত্রণ · বিনিময়" };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { token } = await params;
  const { error } = await searchParams;
  const invite = await peekInvite(pool(), token);

  return (
    <main>
      <h1>ডিলে যোগ দেওয়ার আমন্ত্রণ</h1>
      {error && <p role="alert">{ERROR_TEXT[error] ?? error}</p>}
      {invite ? (
        <>
          <p>
            ডিল: <strong>{invite.title}</strong>
            <br />
            আপনি যোগ দেবেন: <strong>{ROLE_TEXT[invite.role]}</strong> হিসেবে
          </p>
          <p>
            যোগ দিলে আপনি চুক্তির খসড়া দেখতে পাবেন। যোগ দেওয়া মানে শর্তে সম্মতি নয়;
            সম্মতি আলাদা ধাপ।
          </p>
          <form action={acceptInviteAction}>
            <input type="hidden" name="token" value={token} />
            <button type="submit">যোগ দিন</button>
          </form>
        </>
      ) : (
        <p>{ERROR_TEXT.INVITE_INVALID} যিনি পাঠিয়েছেন তাঁর কাছে নতুন লিংক চান।</p>
      )}
      <p>
        <a href="/deals">আমার ডিল</a>
      </p>
    </main>
  );
}
