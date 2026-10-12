import type { Actor } from "@lp/db/commands";
import { betterAuth } from "better-auth";
import {
  emailOTP,
  magicLink,
  phoneNumber,
  twoFactor,
} from "better-auth/plugins";
import type { Pool } from "pg";

// One outbound message: a sign-in link or a one-time code. Never logged.
export type AuthMessage = {
  channel: "email" | "sms";
  to: string;
  kind:
    | "magic_link"
    | "email_otp"
    | "phone_otp"
    | "verify_email"
    | "reset_password";
  secret: string;
};
export type SendAuthMessage = (message: AuthMessage) => Promise<void>;

export type SocialCredentials = { clientId: string; clientSecret: string };
export type AuthOptions = {
  pool: Pool;
  baseURL: string;
  secret: string;
  send: SendAuthMessage;
  // A provider is offered only when its credentials are configured.
  social: Partial<Record<"google" | "facebook" | "github", SocialCredentials>>;
};

// Facebook grants the email permission yet omits the address for a profile
// with no confirmed email. Such an account still needs the mandatory email
// column, so it gets a temporary one, as a phone-only account does.
// (`sub` is the user ID in the limited-login token form of the profile.)
export const facebookTempEmail = (profile: {
  id?: string;
  sub?: string;
  email?: string;
}) =>
  profile.email
    ? {}
    : { email: `${profile.id ?? profile.sub}@facebook.binimoy.invalid` };

export function createAuth(options: AuthOptions) {
  const { send } = options;
  const { facebook, ...social } = options.social;
  return betterAuth({
    appName: "Binimoy",
    baseURL: options.baseURL,
    secret: options.secret,
    database: options.pool,
    advanced: {
      database: { generateId: "uuid" },
      // The library switches these off by itself when it detects a test run.
      // Stated explicitly so tests and production enforce the same checks.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    user: { modelName: "app_user", fields: { createdAt: "created_at" } },
    session: { modelName: "auth_session" },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      // D.2: an auth reset revokes the sessions that existed before it.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) =>
        send({
          channel: "email",
          to: user.email,
          kind: "reset_password",
          secret: url,
        }),
    },
    emailVerification: {
      sendVerificationEmail: ({ user, url }) =>
        send({
          channel: "email",
          to: user.email,
          kind: "verify_email",
          secret: url,
        }),
    },
    socialProviders: {
      ...social,
      ...(facebook && {
        facebook: { ...facebook, mapProfileToUser: facebookTempEmail },
      }),
    },
    plugins: [
      magicLink({
        sendMagicLink: ({ email, url }) =>
          send({
            channel: "email",
            to: email,
            kind: "magic_link",
            secret: url,
          }),
      }),
      emailOTP({
        sendVerificationOTP: ({ email, otp }) =>
          send({ channel: "email", to: email, kind: "email_otp", secret: otp }),
      }),
      phoneNumber({
        sendOTP: ({ phoneNumber: to, code }) =>
          send({ channel: "sms", to, kind: "phone_otp", secret: code }),
        // A phone-only account still needs the mandatory email and name columns.
        signUpOnVerification: {
          getTempEmail: (phone) =>
            `${phone.replace(/\D/g, "")}@phone.binimoy.invalid`,
          getTempName: (phone) => phone,
        },
      }),
      twoFactor({ twoFactorTable: "auth_two_factor" }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

// The only way a request becomes an actor: a valid session cookie. Nothing in
// the request body or query can name a user or a role.
export async function actorFromHeaders(
  auth: Auth,
  headers: Headers,
): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers });
  return session ? { kind: "user", userId: session.user.id } : null;
}
