-- LP-010: mutual resolution proposals, reviewer assignments, decisions, appeals.

-- B9 MUTUAL_RESOLUTION: one party proposes an exact split of the held money;
-- the other accepts that exact row or does not.
create table resolution_proposal (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deal (id),
  proposed_by uuid not null references app_user (id),
  to_seller_minor bigint not null check (to_seller_minor >= 0),
  to_buyer_minor bigint not null check (to_buyer_minor >= 0),
  created_at timestamptz not null default now(),
  -- Set when accepted, replaced by a newer proposal, or overtaken by events.
  closed_at timestamptz,
  accepted_by uuid references app_user (id),
  check (to_seller_minor + to_buyer_minor > 0)
);
create unique index resolution_proposal_one_open on resolution_proposal (deal_id) where closed_at is null;
create index resolution_proposal_proposed_by_idx on resolution_proposal (proposed_by);
create index resolution_proposal_accepted_by_idx on resolution_proposal (accepted_by);

-- D.6: a reviewer's access to a case is this row and nothing else. Releasing
-- it ends the access. One active reviewer per case and kind.
create table review_assignment (
  id bigint generated always as identity primary key,
  dispute_id uuid not null references dispute (dispute_id),
  reviewer_id uuid not null references app_user (id),
  kind text not null check (kind in ('review', 'appeal')),
  assigned_at timestamptz not null default now(),
  released_at timestamptz
);
create unique index review_assignment_one_active on review_assignment (dispute_id, kind) where released_at is null;
create index review_assignment_reviewer_idx on review_assignment (reviewer_id);

-- B10: the decision as the reviewer wrote it. Never edited; an appeal
-- decision is a new row.
create table review_decision (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references dispute (dispute_id),
  kind text not null check (kind in ('review', 'appeal')),
  reviewer_id uuid not null references app_user (id),
  outcome text not null check (outcome in ('ALLOCATE', 'UNRESOLVED')),
  to_seller_minor bigint not null default 0 check (to_seller_minor >= 0),
  to_buyer_minor bigint not null default 0 check (to_buyer_minor >= 0),
  rule text not null check (length(rule) > 0),
  facts text not null check (length(facts) > 0),
  rejected_inferences text not null default '',
  reasoning text not null check (length(reasoning) > 0),
  appeal_deadline timestamptz,
  created_at timestamptz not null default now()
);
create index review_decision_dispute_idx on review_decision (dispute_id, created_at);
create index review_decision_reviewer_idx on review_decision (reviewer_id);

-- A party giving up the rest of their own appeal window (D.6). Only the party
-- can do this; a reviewer cannot do it for them.
create table decision_waiver (
  decision_id uuid not null references review_decision (id),
  user_id uuid not null references app_user (id),
  waived_at timestamptz not null default now(),
  primary key (decision_id, user_id)
);
create index decision_waiver_user_idx on decision_waiver (user_id);

-- B2 human-from-start: the reviewer who joins the deal before funding.
create table deal_reviewer (
  deal_id uuid primary key references deal (id),
  reviewer_id uuid not null references app_user (id),
  assigned_at timestamptz not null default now()
);
create index deal_reviewer_reviewer_idx on deal_reviewer (reviewer_id);

create trigger review_decision_append_only before update or delete on review_decision
for each row execute function reject_change();
create trigger decision_waiver_append_only before update or delete on decision_waiver
for each row execute function reject_change();

alter table resolution_proposal enable row level security;
alter table review_assignment enable row level security;
alter table review_decision enable row level security;
alter table decision_waiver enable row level security;
alter table deal_reviewer enable row level security;
