import { peekInvite } from "@lp/db/agreements";
import { copyFor } from "../../../lib/copy";
import { getI18n } from "../../../lib/i18n";
import { pool } from "../../../lib/pool";
import { requireUser } from "../../../lib/session";
import { acceptInviteAction } from "../../deals/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "ইনভাইট · বিনিময়" };

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
  const { locale, L } = await getI18n();
  const copy = copyFor(locale);

  return (
    <main>
      <h1>{L("ডিলে যোগ দেওয়ার ইনভাইট", "Invite to join a deal")}</h1>
      {error && <p role="alert">{copy.error[error] ?? error}</p>}
      {invite ? (
        <>
          <p>
            {L("ডিল", "Deal")}: <strong>{invite.title}</strong>
            <br />
            {L("আপনি যোগ দেবেন", "You will join as")}:{" "}
            <strong>{copy.role[invite.role]}</strong>
            {L(" হিসেবে", "")}
          </p>
          <p>
            {L(
              "যোগ দিলে আপনি ডিলের ড্রাফট দেখতে পাবেন। যোগ দেওয়া মানে শর্তে সম্মতি নয়; সম্মতি আলাদা ধাপ।",
              "Joining lets you see the deal's draft. Joining is not agreeing to the terms; agreeing is a separate step.",
            )}
          </p>
          <form action={acceptInviteAction}>
            <input type="hidden" name="token" value={token} />
            <button type="submit">{L("যোগ দিন", "Join")}</button>
          </form>
        </>
      ) : (
        <p>
          {copy.error.INVITE_INVALID}{" "}
          {L(
            "যিনি পাঠিয়েছেন তাঁর কাছে নতুন লিংক চান।",
            "Ask whoever sent it for a new link.",
          )}
        </p>
      )}
      <p>
        <a href="/deals">{L("আমার ডিল", "My deals")}</a>
      </p>
    </main>
  );
}
