-- LP-003: authentication tables, staff roles and monitoring consent.
-- The auth tables follow the schema Better Auth 1.7.7 generates for our
-- configuration (see ADR-003); camelCase column names are its convention.

-- app_user becomes the single user table. Defaults exist only to fill rows
-- created before this migration and are dropped again.
alter table app_user
  add column name text not null default '',
  add column email text not null default (gen_random_uuid()::text || '@placeholder.invalid'),
  add column "emailVerified" boolean not null default false,
  add column image text,
  add column "updatedAt" timestamptz not null default current_timestamp,
  add column "phoneNumber" text,
  add column "phoneNumberVerified" boolean,
  add column "twoFactorEnabled" boolean,
  add constraint app_user_email_key unique (email),
  add constraint app_user_phone_number_key unique ("phoneNumber");
alter table app_user
  alter column name drop default,
  alter column email drop default;

create table auth_session (
  id uuid primary key default gen_random_uuid(),
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references app_user (id) on delete cascade
);
create index auth_session_user_id_idx on auth_session ("userId");

create table auth_account (
  id uuid primary key default gen_random_uuid(),
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references app_user (id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null
);
create index auth_account_user_id_idx on auth_account ("userId");

create table auth_verification (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp
);
create index auth_verification_identifier_idx on auth_verification (identifier);

create table auth_two_factor (
  id uuid primary key default gen_random_uuid(),
  secret text not null,
  "backupCodes" text not null,
  "userId" uuid not null references app_user (id) on delete cascade,
  verified boolean,
  "failedVerificationCount" integer,
  "lockedUntil" timestamptz
);
create index auth_two_factor_secret_idx on auth_two_factor (secret);
create index auth_two_factor_user_id_idx on auth_two_factor ("userId");

-- Fixture delivery of sign-in links and codes. Used only when APP_ENV is
-- local or test; the application refuses to write here anywhere else.
create table auth_message (
  id bigint generated always as identity primary key,
  channel text not null check (channel in ('email', 'sms')),
  recipient text not null,
  kind text not null,
  secret text not null,
  created_at timestamptz not null default now()
);
create index auth_message_recipient_idx on auth_message (recipient, id desc);

-- D.2: privileged roles are granted by an operator, never chosen by the user.
-- Revocation keeps the row, so the history stays auditable.
create table staff_role (
  id bigint generated always as identity primary key,
  user_id uuid not null references app_user (id),
  role text not null check (role in (
    'reviewer', 'appeal_reviewer', 'approver', 'moderator', 'operator'
  )),
  granted_by text not null,
  reason text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text
);
create unique index staff_role_active_key on staff_role (user_id, role) where revoked_at is null;

-- D.8: one row per acceptance. A withdrawal sets withdrawn_at; a later
-- acceptance is a new row. Nothing here is ever updated to look accepted.
create table monitoring_consent (
  id bigint generated always as identity primary key,
  deal_id uuid not null,
  user_id uuid not null,
  policy_version text not null,
  purposes text[] not null check (cardinality(purposes) > 0),
  model_destination text not null,
  attachment_classes text[] not null,
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  -- Only a party to the deal can consent for it.
  foreign key (deal_id, user_id) references deal_party (deal_id, user_id)
);
create unique index monitoring_consent_active_key
  on monitoring_consent (deal_id, user_id, policy_version) where withdrawn_at is null;

alter table auth_session enable row level security;
alter table auth_account enable row level security;
alter table auth_verification enable row level security;
alter table auth_two_factor enable row level security;
alter table auth_message enable row level security;
alter table staff_role enable row level security;
alter table monitoring_consent enable row level security;
