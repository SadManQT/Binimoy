# ADR-003: Authentication library, and Matrix SDK compatibility

- Status: ACCEPTED for authentication (2026-10-12). Matrix part remains PROPOSED until LP-007.
- Affects: LP-003, LP-007, FE-09, FE-15

## Problem

Spec A2 requires a maintained authentication solution and forbids writing custom authentication. The founder asked for every login option.

## Options

1. **Supabase Auth.** Hosted with the database. Many providers. Ties sessions to Supabase, cannot run in CI or on plain PostgreSQL, and keeps users in a separate schema from the deal tables.
2. **Better Auth.** A library that stores users and sessions in our own PostgreSQL through the existing connection pool.

## Decision

**Better Auth 1.7.7**, behind `createAuth` in `packages/adapters/src/auth.ts`.

- It runs on any PostgreSQL, so local, CI and Supabase behave the same (ADR-001).
- Sessions are database rows, so revocation is immediate and testable.
- `app_user` is the single user table. Deal membership, consent and staff roles reference it directly.
- Its tables are created by our own reviewed migration (`0004_auth_and_consent.sql`), not by the library at runtime.

### Login options

| Option | State |
|---|---|
| Email and password | Works |
| Email magic link | Works in local and test only (no email sender yet) |
| Email one-time code | Works in local and test only |
| Phone one-time code | Works in local and test only (no SMS sender yet) |
| Google, GitHub | Work locally: the founder signed in with both on 2026-10-12 (manual test, localhost only) |
| Facebook | Works locally: one manual sign-in on 2026-10-12 (localhost only, app in development mode). Facebook granted the `email` permission but returned no email for that profile, so the account was created with a temporary `<facebook id>@facebook.binimoy.invalid` address, unverified, as phone-only accounts are. No screen yet asks such a user for a real email |
| Two-factor (TOTP) | Library plugin and table are enabled. No enrollment screen and no enforcement yet |
| Passkeys | Not included. Needs a separate package |
| Apple | Not included |

### Security settings made explicit

- Origin and CSRF checks are forced on. The library turns them off by itself when it detects a test run, which would have hidden a cross-origin failure; a test now proves a foreign-origin request is refused.
- A password reset revokes the sessions that existed before it.
- Minimum password length is 10.
- Sign-in links and codes are never logged. In local and test they are stored in `auth_message`; any other environment refuses to store them.
- An actor is derived only from a valid session cookie (`actorFromHeaders`). No request field can name a user or a role.
- Staff roles live in `staff_role`, are granted only by an operator function, and keep their revocation history.

## Matrix SDK compatibility (unchanged from the LP-001 spike)

| Package | Version |
|---|---|
| next | 16.4.0 |
| react / react-dom | 19.3.0 |
| matrix-js-sdk | 43.0.0 |

- Installing beside Next and React gave no peer dependency warnings.
- `next build` of a client component that calls `createClient` and `initRustCrypto` succeeded.
- NOT_RUN: loading the crypto module in a browser; any homeserver, device verification or key recovery flow. These belong to LP-007.

## Consequences and open items

- A real email and SMS sender is required before magic link, codes, phone login or password reset can work in staging. Planned with the notification adapter (LP-018); the provider is a founder choice.
- Social providers need OAuth applications created by the founder. Redirect URI: `<APP_URL>/api/auth/callback/<provider>`.
- Staff MFA (D.2) needs an enrollment screen and enforcement before staging.
- Login rate limiting relies on the library's defaults and has not been tested.
- Fresh authentication before sensitive money actions (D.2) is not implemented; it belongs with those actions.
