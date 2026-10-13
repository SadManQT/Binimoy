-- Evidence pictures attached to a community report (D.9). Server-readable,
-- private to the author and the assigned moderator, never published.
-- ponytail: bytes live in Postgres. Fine for a few small pictures per report;
-- move to object storage with scoped URLs when volume grows.
create table report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references community_report (id),
  uploaded_by uuid not null references app_user (id),
  -- Decided from the file's own signature, never from what the browser said.
  media_type text not null check (media_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 2097152),
  sha256 text not null,
  content bytea,
  -- No scanner is connected: nothing is ever marked clean by default.
  scan_state text not null default 'UNKNOWN' check (scan_state in ('UNKNOWN', 'CLEAN', 'INFECTED')),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  -- Removing a picture removes its bytes; the row stays as the record.
  check ((content is null) = (removed_at is not null))
);
create index report_evidence_report_idx on report_evidence (report_id);
create index report_evidence_uploaded_by_idx on report_evidence (uploaded_by);

alter table report_evidence enable row level security;
