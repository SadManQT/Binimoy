import { loadConfig } from "@lp/contracts";
import { notFound } from "next/navigation";
import { pool } from "../../../lib/pool";

export const dynamic = "force-dynamic";

// Local development only: shows the sign-in links and codes that would have
// been emailed or texted. It does not exist in any other environment.
export default async function DevMessagesPage() {
  if (loadConfig(process.env).APP_ENV !== "local") notFound();
  const { rows } = await pool().query(
    "select id, channel, recipient, kind, secret, created_at from auth_message order by id desc limit 10",
  );
  return (
    <main>
      <h1>লোকাল বার্তা (শুধু ডেভেলপমেন্ট)</h1>
      {rows.length === 0 ? (
        <p>এখনো কোনো বার্তা নেই।</p>
      ) : (
        <ul>
          {rows.map((m) => (
            <li key={m.id}>
              {m.channel} → {m.recipient} · {m.kind}
              <br />
              {String(m.secret).startsWith("http") ? (
                <a href={m.secret}>{m.secret}</a>
              ) : (
                <code>{m.secret}</code>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
