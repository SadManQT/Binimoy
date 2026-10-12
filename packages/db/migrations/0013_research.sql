-- LP-012: research subjects, private collections, immutable source snapshots
-- and attributed report cards. No table here holds a score or a verdict.

-- C7.2: a subject is one named page, person, business or domain. Similar
-- names are separate rows; nothing merges them.
create table subject (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  normalized_key text not null unique,
  created_at timestamptz not null default now()
);

-- D.9: a collection is private to the user who ran it.
create table research_collection (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user (id),
  subject_id uuid not null references subject (id),
  status text not null check (status in ('RUNNING', 'DONE', 'PARTIAL', 'FAILED')),
  -- What was searched, where, when, and what failed (C7.4).
  coverage jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index research_collection_user_idx on research_collection (user_id, created_at);
create index research_collection_subject_idx on research_collection (subject_id);

-- D.10: what was actually retrieved, kept as it was. Publication time and
-- retrieval time are separate; the first is often unknown.
create table source_snapshot (
  id uuid primary key default gen_random_uuid(),
  canonical_url text not null,
  provider text not null,
  title text not null,
  snippet text not null,
  access_status text not null check (access_status in (
    'FULL_TEXT', 'PARTIAL_TEXT', 'SNIPPET_ONLY', 'LINK_ONLY', 'USER_SUBMITTED', 'UNAVAILABLE'
  )),
  body text,
  published_at timestamptz,
  retrieved_at timestamptz not null default now()
);
create index source_snapshot_url_idx on source_snapshot (canonical_url);

create table report_card (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references research_collection (id),
  snapshot_id uuid not null references source_snapshot (id),
  -- Null when the page could not be read: a snippet is never classified.
  content_type text check (content_type in (
    'customer_experience', 'seller_response', 'advertisement', 'news'
  )),
  report_type text check (report_type in (
    'positive', 'negative', 'mixed', 'neutral', 'response', 'resolution'
  )),
  subject_match text not null check (subject_match in ('exact', 'ambiguous')),
  attributed_summary text,
  duplicate_group text,
  limitations text not null default '',
  unique (collection_id, snapshot_id)
);
create index report_card_collection_idx on report_card (collection_id);
create index report_card_snapshot_idx on report_card (snapshot_id);

create trigger source_snapshot_append_only before update or delete on source_snapshot
for each row execute function reject_change();

alter table subject enable row level security;
alter table research_collection enable row level security;
alter table source_snapshot enable row level security;
alter table report_card enable row level security;
