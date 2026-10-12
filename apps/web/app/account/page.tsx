import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../lib/auth";
import { getI18n } from "../../lib/i18n";
import { AccountActions } from "./account-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "অ্যাকাউন্ট · বিনিময়" };

export default async function AccountPage() {
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/login");
  const sessions = await auth().api.listSessions({ headers: requestHeaders });
  const { user } = session;
  const { locale, num } = await getI18n();
  const L = (bn: string, en: string) => (locale === "en" ? en : bn);

  return (
    <main>
      <h1>{L("অ্যাকাউন্ট", "Account")}</h1>
      <dl>
        <dt>{L("নাম", "Name")}</dt>
        <dd>{user.name}</dd>
        <dt>{L("ইমেইল", "Email")}</dt>
        <dd>
          {user.email}{" "}
          {user.emailVerified
            ? L("(ভেরিফাই করা)", "(verified)")
            : L("(ভেরিফাই হয়নি)", "(not verified)")}
        </dd>
        <dt>{L("ইউজার আইডি", "User ID")}</dt>
        <dd>
          <code>{user.id}</code>
        </dd>
      </dl>

      <h2>
        {L("চালু সেশন", "Active sessions")} ({num(sessions.length)})
      </h2>
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            {s.userAgent ?? L("অজানা ডিভাইস", "Unknown device")} ·{" "}
            {new Date(s.createdAt).toLocaleString(
              locale === "en" ? "en-GB" : "bn-BD",
              {
                timeZone: "Asia/Dhaka",
              },
            )}{" "}
            (Asia/Dhaka)
            {s.id === session.session.id
              ? L(" · এই ডিভাইস", " · this device")
              : ""}
          </li>
        ))}
      </ul>
      <AccountActions />
    </main>
  );
}
