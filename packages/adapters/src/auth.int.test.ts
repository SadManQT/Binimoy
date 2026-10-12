import { randomUUID } from "node:crypto";
import { createAggregate, executeCommand } from "@lp/db/commands";
import { migrate } from "@lp/db/migrate";
import { testPool } from "@lp/db/testing";
import { afterAll, beforeAll, expect, test } from "vitest";
import { type Auth, actorFromHeaders, createAuth } from "./auth";
import { fixtureSender, latestAuthMessage } from "./auth-messages";

const BASE = "http://localhost:3000";
const pool = await testPool();
let auth: Auth;

// The auth library inspects the schema when it is created, so build it only
// after the schema exists.
beforeAll(async () => {
  await migrate(pool);
  auth = createAuth({
    pool,
    baseURL: BASE,
    secret: "integration-test-secret-not-used-anywhere-else-7f3a9c",
    send: fixtureSender(pool, "test"),
    social: {},
  });
});
afterAll(() => pool.end());

type Reply = { status: number; body: Record<string, unknown>; cookie: string };

// Drives the real HTTP handler, so cookies, origin checks and status codes are exercised.
async function call(
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; cookie?: string; origin?: string } = {},
): Promise<Reply> {
  const response = await auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method,
      redirect: "manual",
      headers: {
        origin: options.origin ?? BASE,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body: body ?? {}, cookie };
}

const email = () => `u-${randomUUID()}@example.test`;
const PASSWORD = "correct horse battery";

async function signUp(address = email()) {
  const reply = await call("POST", "/sign-up/email", {
    body: { name: "Test User", email: address, password: PASSWORD },
  });
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  const userId = (reply.body.user as { id: string }).id;
  return { address, userId, cookie: reply.cookie };
}

const sessionUser = async (cookie: string) => {
  const reply = await call("GET", "/get-session", { cookie });
  return (reply.body?.user as { id: string } | undefined)?.id ?? null;
};

test("two people get separate sessions that resolve to their own identity", async () => {
  const a = await signUp();
  const b = await signUp();
  expect(a.userId).not.toBe(b.userId);
  expect(await sessionUser(a.cookie)).toBe(a.userId);
  expect(await sessionUser(b.cookie)).toBe(b.userId);
});

test("a tampered or invented session cookie resolves to nobody", async () => {
  const a = await signUp();
  const tampered = a.cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  expect(await sessionUser(tampered)).toBeNull();
  expect(
    await sessionUser("better-auth.session_token=forged.forged"),
  ).toBeNull();
  expect(
    await actorFromHeaders(auth, new Headers({ cookie: tampered })),
  ).toBeNull();
});

test("signing out revokes the session", async () => {
  const a = await signUp();
  const out = await call("POST", "/sign-out", { cookie: a.cookie });
  expect(out.status).toBe(200);
  expect(await sessionUser(a.cookie)).toBeNull();
});

test("a wrong password does not sign in", async () => {
  const a = await signUp();
  const reply = await call("POST", "/sign-in/email", {
    body: { email: a.address, password: "not the password" },
  });
  expect(reply.status).toBe(401);
  expect(reply.cookie).toBe("");
});

test("a state-changing request from another origin is refused", async () => {
  const a = await signUp();
  const reply = await call("POST", "/sign-out", {
    cookie: a.cookie,
    origin: "https://evil.example",
  });
  expect(reply.status).toBe(403);
  expect(await sessionUser(a.cookie)).toBe(a.userId);
});

test("magic link signs in the address it was sent to", async () => {
  const address = email();
  const sent = await call("POST", "/sign-in/magic-link", {
    body: { email: address },
  });
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  const message = await latestAuthMessage(pool, address);
  expect(message?.kind).toBe("magic_link");
  const link = new URL(message?.secret ?? "");
  const verified = await call(
    "GET",
    `${link.pathname.replace("/api/auth", "")}${link.search}`,
  );
  expect(await sessionUser(verified.cookie)).not.toBeNull();
});

test("email one-time code signs in, and a wrong code does not", async () => {
  const address = email();
  await call("POST", "/email-otp/send-verification-otp", {
    body: { email: address, type: "sign-in" },
  });
  const message = await latestAuthMessage(pool, address);
  expect(message?.kind).toBe("email_otp");
  const wrong = await call("POST", "/sign-in/email-otp", {
    body: { email: address, otp: "000000" },
  });
  expect(wrong.cookie).toBe("");
  const right = await call("POST", "/sign-in/email-otp", {
    body: { email: address, otp: message?.secret },
  });
  expect(right.status, JSON.stringify(right.body)).toBe(200);
  expect(await sessionUser(right.cookie)).not.toBeNull();
});

test("phone one-time code signs in", async () => {
  const phone = `+88017${Math.floor(10000000 + Math.random() * 89999999)}`;
  const sent = await call("POST", "/phone-number/send-otp", {
    body: { phoneNumber: phone },
  });
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  const message = await latestAuthMessage(pool, phone);
  expect(message).toMatchObject({ channel: "sms", kind: "phone_otp" });
  const verified = await call("POST", "/phone-number/verify", {
    body: { phoneNumber: phone, code: message?.secret },
  });
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  expect(await sessionUser(verified.cookie)).not.toBeNull();
});

test("resetting a password revokes sessions that existed before it", async () => {
  const a = await signUp();
  await call("POST", "/request-password-reset", {
    body: { email: a.address, redirectTo: `${BASE}/reset` },
  });
  const message = await latestAuthMessage(pool, a.address);
  expect(message?.kind).toBe("reset_password");
  const token = new URL(message?.secret ?? "").pathname.split("/").pop();
  const reset = await call("POST", "/reset-password", {
    body: { newPassword: "a brand new passphrase", token },
  });
  expect(reset.status, JSON.stringify(reset.body)).toBe(200);
  expect(await sessionUser(a.cookie)).toBeNull();
});

test("a social provider without credentials is not offered", async () => {
  const reply = await call("POST", "/sign-in/social", {
    body: { provider: "google", callbackURL: BASE },
  });
  expect(reply.status).toBeGreaterThanOrEqual(400);
  expect(reply.cookie).toBe("");
});

test("sign-up input cannot grant a staff role", async () => {
  const address = email();
  const reply = await call("POST", "/sign-up/email", {
    body: {
      name: "Wants Power",
      email: address,
      password: PASSWORD,
      role: "reviewer",
      staffRole: "reviewer",
    },
  });
  const userId = (reply.body.user as { id: string } | undefined)?.id;
  const { rows } = await pool.query(
    "select count(*)::int as n from staff_role where user_id = $1",
    [userId ?? randomUUID()],
  );
  expect(rows[0].n).toBe(0);
});

test("a signed-in user cannot act on a deal they are not party to", async () => {
  const buyer = await signUp();
  const seller = await signUp();
  const outsider = await signUp();
  const deal = await pool.query(
    "insert into deal (created_by) values ($1) returning id",
    [buyer.userId],
  );
  const dealId: string = deal.rows[0].id;
  await pool.query(
    "insert into deal_party (deal_id, user_id, role) values ($1, $2, 'buyer'), ($1, $3, 'seller')",
    [dealId, buyer.userId, seller.userId],
  );
  const client = await pool.connect();
  const deliveryId = await createAggregate(client, {
    type: "delivery",
    dealId,
  });
  client.release();

  const attempt = async (cookie: string) => {
    const actor = await actorFromHeaders(auth, new Headers({ cookie }));
    if (!actor) return "NO_SESSION";
    const result = await executeCommand(pool, {
      environment: "test",
      actor,
      aggregateId: deliveryId,
      command: "SubmitDelivery",
      envelope: {
        commandId: randomUUID(),
        idempotencyKey: `key-${randomUUID()}`,
        expectedAggregateVersion: 1,
        payload: {},
      },
    });
    return result.ok ? result.state : result.error;
  };

  expect(await attempt(outsider.cookie)).toBe("NOT_AUTHORIZED");
  expect(await attempt(buyer.cookie)).toBe("NOT_AUTHORIZED");
  expect(await attempt("")).toBe("NO_SESSION");
  expect(await attempt(seller.cookie)).toBe("SUBMITTED");
});
