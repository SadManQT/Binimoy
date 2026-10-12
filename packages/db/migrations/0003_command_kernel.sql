-- LP-002 baseline: identities, deals, aggregate state, events, outbox, idempotency.
-- Detail tables for each aggregate are added by the task that owns it.

create table app_user (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table deal (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references app_user (id),
  created_at timestamptz not null default now()
);
create index deal_created_by_idx on deal (created_by);

-- D.2: roles are per deal. The primary key allows one buyer and one seller;
-- the unique constraint stops one identity from holding both roles.
create table deal_party (
  deal_id uuid not null references deal (id),
  user_id uuid not null references app_user (id),
  role text not null check (role in ('buyer', 'seller')),
  primary key (deal_id, role),
  unique (deal_id, user_id)
);
create index deal_party_user_id_idx on deal_party (user_id);

-- D.3: one row per state machine instance. `version` is the optimistic lock.
create table aggregate (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'agreement', 'funding_invoice', 'delivery', 'inspection_item',
    'dispute', 'authorization', 'adapter_operation', 'notice'
  )),
  deal_id uuid not null references deal (id),
  state text not null,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now()
);
create index aggregate_deal_id_idx on aggregate (deal_id);

-- A8 common event. One event per aggregate version.
create table event (
  event_id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_id uuid not null references aggregate (id),
  aggregate_version integer not null,
  actor_ref text not null,
  causation_id uuid not null,
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  schema_version integer not null,
  payload jsonb not null,
  unique (aggregate_id, aggregate_version)
);

create function reject_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name;
end
$$;

create trigger event_append_only
before update or delete on event
for each row execute function reject_change();

-- Written in the same transaction as the event. Leases, retries and the
-- dead-letter path are added with the dispatcher in LP-005.
create table outbox (
  event_id uuid primary key references event (event_id),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz
);
create index outbox_pending_idx on outbox (created_at) where dispatched_at is null;

-- D.4: scoped by environment, principal, command and aggregate.
create table idempotency (
  environment text not null,
  principal text not null,
  command text not null,
  aggregate_id uuid not null references aggregate (id),
  key text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (aggregate_id, principal, command, environment, key)
);

alter table app_user enable row level security;
alter table deal enable row level security;
alter table deal_party enable row level security;
alter table aggregate enable row level security;
alter table event enable row level security;
alter table outbox enable row level security;
alter table idempotency enable row level security;
