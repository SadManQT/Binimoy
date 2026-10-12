-- LP-018 and LP-022: in-app notices, operator pauses, and a challenge window
-- that starts only when its notice has been shown to the buyer.

-- D.6: minimal metadata and a link target. Never message text, allegation
-- text, a secret or an acceptance token.
create table notice (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references app_user (id),
  deal_id uuid references deal (id),
  kind text not null,
  -- Set when the notice was produced from a recorded event; one notice per
  -- event and recipient however often the outbox is replayed.
  event_id uuid references event (event_id),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  -- An authenticated page showed it to the recipient. Not "read".
  rendered_at timestamptz,
  unique (event_id, recipient_id)
);
create index notice_recipient_idx on notice (recipient_id, created_at desc);
create index notice_deal_idx on notice (deal_id);

-- D.13: separate, audited emergency controls.
create table ops_pause (
  kind text primary key check (kind in ('funding', 'settlement', 'research', 'ai')),
  paused_by text not null,
  reason text not null,
  paused_at timestamptz not null default now()
);
create table ops_audit (
  id bigint generated always as identity primary key,
  kind text not null,
  action text not null check (action in ('pause', 'resume')),
  actor text not null,
  reason text not null,
  occurred_at timestamptz not null default now()
);
create trigger ops_audit_append_only before update or delete on ops_audit
for each row execute function reject_change();

-- V7-15: no due time until the buyer has been shown the notice.
alter table objective_window alter column due_at drop not null;
alter table objective_window add column notice_id uuid references notice (id);
alter table objective_window add column challenge_hours integer not null default 24;
create index objective_window_notice_idx on objective_window (notice_id);

alter table notice enable row level security;
alter table ops_pause enable row level security;
alter table ops_audit enable row level security;
