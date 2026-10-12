-- Shop directory, ratings, alleged-issue reports and safety alerts.
-- Founder direction of 2026-10-12, recorded in ADR-009. A rating is the
-- reviewer's own; nothing here stores a platform verdict on a shop.

-- The kind of shop, for browsing. Set by the first person to report on it.
alter table subject add column category text check (category in (
  'game_topup', 'game_accounts', 'software', 'subscriptions', 'gift_cards',
  'digital_services', 'courses', 'domains_hosting', 'social_accounts', 'other'
));

-- The reviewer's own rating of their experience, 1 to 5. Optional.
alter table community_report add column rating smallint check (rating between 1 and 5);
-- What the author alleges went wrong. Null for anything that is not a complaint.
alter table community_report add column issue text check (issue in (
  'not_delivered', 'wrong_item', 'access_revoked', 'no_refund',
  'blocked_after_payment', 'impersonation', 'other'
));
-- One live report per person per shop: a second account of the same deal by
-- the same author cannot pad the numbers.
create unique index community_report_one_live on community_report (author_id, subject_id)
  where state in ('SUBMITTED', 'UNDER_REVIEW', 'PUBLISHED');
create index community_report_published_idx on community_report (published_at desc)
  where state = 'PUBLISHED';

-- A general warning written by a moderator: a pattern to watch for. It is
-- signed by the moderator who wrote it and can be retracted, never edited.
create table safety_alert (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by uuid not null references app_user (id),
  published_at timestamptz not null default now(),
  retracted_at timestamptz,
  retracted_by uuid references app_user (id)
);
create index safety_alert_created_by_idx on safety_alert (created_by);
create index safety_alert_retracted_by_idx on safety_alert (retracted_by);
create index safety_alert_live_idx on safety_alert (published_at desc) where retracted_at is null;

alter table safety_alert enable row level security;
