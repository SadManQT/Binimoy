-- LP-013: community reports. A report is a user's own account. Nothing here
-- records a finding about the subject, and nothing is public until a
-- moderator who is not the author publishes it.

create table community_report (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references app_user (id),
  subject_id uuid not null references subject (id),
  category text not null default '',
  experience_type text not null check (experience_type in (
    'positive', 'negative', 'mixed', 'neutral'
  )),
  event_date date,
  amount_minor bigint check (amount_minor is null or amount_minor > 0),
  -- C9.2: the original stays private; only public_text is ever shown.
  narrative text not null default '',
  public_text text not null default '',
  state text not null default 'DRAFT' check (state in (
    'DRAFT', 'SUBMITTED', 'NEEDS_INFORMATION', 'UNDER_REVIEW',
    'PUBLISHED', 'NOT_PUBLISHED', 'WITHDRAWN'
  )),
  -- Counts the author's edits, so approval binds to the text they last saw.
  version integer not null default 1,
  moderator_id uuid references app_user (id),
  -- After an appeal: the moderator who may not handle it again.
  barred_moderator_id uuid references app_user (id),
  decided_at timestamptz,
  published_at timestamptz,
  response_due_at timestamptz,
  created_at timestamptz not null default now()
);
create index community_report_author_idx on community_report (author_id, created_at);
create index community_report_subject_idx on community_report (subject_id) where state = 'PUBLISHED';
create index community_report_queue_idx on community_report (state) where state in ('SUBMITTED', 'UNDER_REVIEW');
create index community_report_moderator_idx on community_report (moderator_id);
create index community_report_barred_idx on community_report (barred_moderator_id);

-- D.10: who did what to a report, and why. Never changed.
create table community_report_event (
  id bigint generated always as identity primary key,
  report_id uuid not null references community_report (id),
  actor_id uuid not null references app_user (id),
  kind text not null check (kind in (
    'SUBMITTED', 'CLAIMED', 'NEEDS_INFORMATION', 'PUBLISHED', 'NOT_PUBLISHED',
    'APPEALED', 'WITHDRAWN'
  )),
  reason text not null default '',
  occurred_at timestamptz not null default now()
);
create index community_report_event_report_idx on community_report_event (report_id, id);
create index community_report_event_actor_idx on community_report_event (actor_id, occurred_at);
create trigger community_report_event_append_only before update or delete on community_report_event
for each row execute function reject_change();

-- A seller's response, or the author's later correction or resolution. Shown
-- beside the report; it never replaces it.
create table community_followup (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references community_report (id),
  author_id uuid not null references app_user (id),
  kind text not null check (kind in ('RESPONSE', 'CORRECTION', 'RESOLUTION')),
  body text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PUBLISHED', 'REJECTED')),
  decided_by uuid references app_user (id),
  reason text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index community_followup_report_idx on community_followup (report_id, created_at);
create index community_followup_author_idx on community_followup (author_id);
create index community_followup_decided_by_idx on community_followup (decided_by);
create index community_followup_pending_idx on community_followup (status) where status = 'PENDING';

alter table community_report enable row level security;
alter table community_report_event enable row level security;
alter table community_followup enable row level security;
