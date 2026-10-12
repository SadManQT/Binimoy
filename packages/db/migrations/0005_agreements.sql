-- LP-004: deal titles, invitations, immutable agreement versions and acceptances.

alter table deal add column title text not null default '';
alter table deal alter column title drop default;

-- A8 InviteCounterparty: exact party scope, expiring, single use. Only a hash
-- of the token is stored; the token itself is shown once to the inviter.
create table deal_invite (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deal (id),
  role text not null check (role in ('buyer', 'seller')),
  token_hash text not null unique,
  created_by uuid not null references app_user (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references app_user (id),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index deal_invite_deal_id_idx on deal_invite (deal_id);
create index deal_invite_created_by_idx on deal_invite (created_by);
create index deal_invite_accepted_by_idx on deal_invite (accepted_by);

-- INV-01: each revision of the terms is a new row. Rows are never edited.
create table agreement_version (
  agreement_id uuid not null references aggregate (id),
  version_no integer not null check (version_no >= 1),
  terms jsonb not null,
  terms_hash text not null,
  created_by uuid not null references app_user (id),
  created_at timestamptz not null default now(),
  primary key (agreement_id, version_no)
);
create index agreement_version_created_by_idx on agreement_version (created_by);

-- An acceptance is bound to one exact version and its hash. It can never
-- apply to a later revision.
create table agreement_acceptance (
  agreement_id uuid not null,
  version_no integer not null,
  user_id uuid not null references app_user (id),
  terms_hash text not null,
  accepted_at timestamptz not null default now(),
  primary key (agreement_id, version_no, user_id),
  foreign key (agreement_id, version_no) references agreement_version (agreement_id, version_no)
);
create index agreement_acceptance_user_id_idx on agreement_acceptance (user_id);

create trigger agreement_version_append_only
before update or delete on agreement_version
for each row execute function reject_change();

create trigger agreement_acceptance_append_only
before update or delete on agreement_acceptance
for each row execute function reject_change();

alter table deal_invite enable row level security;
alter table agreement_version enable row level security;
alter table agreement_acceptance enable row level security;
