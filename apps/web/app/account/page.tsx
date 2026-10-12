import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../lib/auth";
import { AccountActions } from "./account-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "অ্যাকাউন্ট · বিনিময়" };

export default async function AccountPage() {
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/login");
  const sessions = await auth().api.listSessions({ headers: requestHeaders });
  const { user } = session;

  return (
    <main>
      <h1>অ্যাকাউন্ট</h1>
      <dl>
        <dt>নাম</dt>
        <dd>{user.name}</dd>
        <dt>ইমেইল</dt>
        <dd>
          {user.email} {user.emailVerified ? "(যাচাই করা)" : "(যাচাই হয়নি)"}
        </dd>
        <dt>ব্যবহারকারী আইডি</dt>
        <dd>
          <code>{user.id}</code>
        </dd>
      </dl>

      <h2>চালু সেশন ({sessions.length})</h2>
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            {s.userAgent ?? "অজানা ডিভাইস"} ·{" "}
            {new Date(s.createdAt).toLocaleString("bn-BD", {
              timeZone: "Asia/Dhaka",
            })}{" "}
            (Asia/Dhaka)
            {s.id === session.session.id ? " · এই ডিভাইস" : ""}
          </li>
        ))}
      </ul>
      <AccountActions />
    </main>
  );
}
