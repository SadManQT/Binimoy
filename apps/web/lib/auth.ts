import { type Auth, createAuth, fixtureSender } from "@lp/adapters";
import { loadConfig } from "@lp/contracts";
import { pool } from "./pool";

const cache = globalThis as { lpAuth?: Auth };

export function auth(): Auth {
  if (!cache.lpAuth) {
    const config = loadConfig(process.env);
    cache.lpAuth = createAuth({
      pool: pool(),
      baseURL: config.APP_URL,
      secret: config.AUTH_SECRET,
      // ponytail: links and codes are stored, not sent, and only in local/test.
      // A real email and SMS sender arrives with the notification adapter (LP-018).
      send: fixtureSender(pool(), config.APP_ENV),
      social: config.social,
    });
  }
  return cache.lpAuth;
}
