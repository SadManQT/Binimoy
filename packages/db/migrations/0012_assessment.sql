-- LP-011: AI case assessments. A job is a request to run the model; an
-- assessment is a validated result, bound to exactly what it was based on.

create table ai_job (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deal (id),
  requested_by uuid not null references app_user (id),
  status text not null default 'QUEUED' check (status in (
    'QUEUED', 'RUNNING', 'DONE', 'FAILED', 'DISCARDED', 'CANCELLED'
  )),
  -- Why a job did not produce an assessment. Never model output.
  failure text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
-- D.11 bounded work: one assessment in progress per deal.
create unique index ai_job_one_active on ai_job (deal_id) where status in ('QUEUED', 'RUNNING');
create index ai_job_deal_idx on ai_job (deal_id, created_at);
create index ai_job_requested_by_idx on ai_job (requested_by);

-- D.11: every assessment records the model, the prompt, the consent policy
-- and the versions of everything it read, so a later change can mark it stale.
create table ai_assessment (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references ai_job (id),
  deal_id uuid not null references deal (id),
  model_id text not null,
  prompt_version text not null,
  policy_version text not null,
  agreement_version_no integer not null,
  package_version_no integer,
  message_cursor bigint not null,
  context_hash text not null,
  manifest jsonb not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);
create index ai_assessment_deal_idx on ai_assessment (deal_id, created_at);

create trigger ai_assessment_append_only before update or delete on ai_assessment
for each row execute function reject_change();

alter table ai_job enable row level security;
alter table ai_assessment enable row level security;
