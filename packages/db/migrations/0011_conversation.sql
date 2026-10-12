-- LP-006: the AI-monitored deal room (spec B3). Server-readable by design.
-- This is NOT the secret vault.

create table monitored_message (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deal (id),
  author_id uuid not null references app_user (id),
  created_at timestamptz not null default now()
);
create index monitored_message_deal_idx on monitored_message (deal_id, created_at);
create index monitored_message_author_idx on monitored_message (author_id);

-- Every edit and deletion is a new version; nothing overwrites an earlier
-- one. `seq` is the durable cursor a client resumes from (D.12).
create table monitored_message_version (
  seq bigint generated always as identity primary key,
  message_id uuid not null references monitored_message (id),
  version_no integer not null check (version_no >= 1),
  kind text not null check (kind in ('original', 'edit', 'deleted', 'redacted')),
  body text,
  created_at timestamptz not null default now(),
  unique (message_id, version_no),
  -- A deleted or redacted version carries no text.
  check ((body is null) = (kind in ('deleted', 'redacted')))
);

-- D.8: "preserve history" does not mean keeping an exposed password forever.
-- The one change ever allowed to a stored version is removing its text.
create function guard_message_version() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.body is null
     and new.kind = 'redacted'
     and new.seq = old.seq
     and new.message_id = old.message_id
     and new.version_no = old.version_no
     and new.created_at = old.created_at then
    return new;
  end if;
  raise exception '% is append-only', tg_table_name;
end
$$;

create trigger monitored_message_version_guard
before update or delete on monitored_message_version
for each row execute function guard_message_version();

-- A private record that something secret reached the monitored room. It
-- never repeats the secret.
create table secret_incident (
  id bigint generated always as identity primary key,
  deal_id uuid not null references deal (id),
  message_id uuid not null references monitored_message (id),
  reported_by uuid not null references app_user (id),
  created_at timestamptz not null default now()
);
create index secret_incident_deal_idx on secret_incident (deal_id);
create index secret_incident_message_idx on secret_incident (message_id);
create index secret_incident_reported_by_idx on secret_incident (reported_by);

alter table monitored_message enable row level security;
alter table monitored_message_version enable row level security;
alter table secret_incident enable row level security;
