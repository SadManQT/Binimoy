import type { Pool } from "pg";
import type { AuthMessage, SendAuthMessage } from "./auth";

// Stores sign-in links and codes in the database instead of sending them, so
// local development and tests need no email or SMS provider. These are live
// credentials in plain text, so it refuses to run outside local and test.
export function fixtureSender(pool: Pool, appEnv: string): SendAuthMessage {
  return async (message) => {
    if (appEnv !== "local" && appEnv !== "test") {
      throw new Error(
        `No ${message.channel} sender is configured for APP_ENV=${appEnv}. Fixture delivery is allowed only in local and test.`,
      );
    }
    await pool.query(
      "insert into auth_message (channel, recipient, kind, secret) values ($1, $2, $3, $4)",
      [message.channel, message.to, message.kind, message.secret],
    );
  };
}

export async function latestAuthMessage(
  pool: Pool,
  recipient: string,
): Promise<Pick<AuthMessage, "channel" | "kind" | "secret"> | null> {
  const { rows } = await pool.query(
    "select channel, kind, secret from auth_message where recipient = $1 order by id desc limit 1",
    [recipient],
  );
  return rows[0] ?? null;
}
