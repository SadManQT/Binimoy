-- LP-008 and LP-009: delivery packages, inspections, authorizations and
-- adapter operations. Synthetic money only.

-- Set when funding is confirmed. Deadlines live in the database and are
-- compared with the database clock (D.3).
create table deal_deadline (
  deal_id uuid primary key references deal (id),
  delivery_due_at timestamptz not null,
  inspection_due_at timestamptz
);

-- INV-07: every submission is a new immutable version.
create table delivery_package (
  package_id uuid primary key references aggregate (id),
  deal_id uuid not null references deal (id),
  version_no integer not null check (version_no >= 1),
  agreement_id uuid not null,
  agreement_version_no integer not null,
  terms_hash text not null,
  submitted_by uuid not null references app_user (id),
  submitted_at timestamptz not null default now(),
  unique (deal_id, version_no),
  foreign key (agreement_id, agreement_version_no)
    references agreement_version (agreement_id, version_no)
);
create index delivery_package_submitted_by_idx on delivery_package (submitted_by);
create index delivery_package_agreement_idx on delivery_package (agreement_id, agreement_version_no);

-- What the seller handed over for each item: a reference to an encrypted
-- vault event, or a statement. Never the secret itself.
create table delivery_item (
  package_id uuid not null references delivery_package (package_id),
  item_id text not null,
  vault_event_id text,
  seller_declared boolean not null default false,
  primary key (package_id, item_id)
);

create table inspection_item (
  inspection_id uuid primary key references aggregate (id),
  deal_id uuid not null references deal (id),
  package_id uuid not null references delivery_package (package_id),
  item_id text not null,
  mandatory boolean not null,
  unique (package_id, item_id)
);
create index inspection_item_deal_id_idx on inspection_item (deal_id);

-- INV-06: each recorded result is kept; a retest adds a row.
create table inspection_result (
  id bigint generated always as identity primary key,
  inspection_id uuid not null references inspection_item (inspection_id),
  outcome text not null check (outcome in ('PASSED', 'FAILED', 'UNKNOWN')),
  proof_type text not null check (proof_type in (
    'seller_statement', 'buyer_observation', 'independent_fact'
  )),
  note text not null default '',
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);
create index inspection_result_inspection_idx on inspection_result (inspection_id);

-- The buyer's acceptance of one exact package version.
create table delivery_acceptance (
  package_id uuid primary key references delivery_package (package_id),
  accepted_by uuid not null references app_user (id),
  accepted_at timestamptz not null default now()
);
create index delivery_acceptance_accepted_by_idx on delivery_acceptance (accepted_by);

-- B9: one row per authorization, with its typed path and exact allocation.
create table settlement_authorization (
  authorization_id uuid primary key references aggregate (id),
  deal_id uuid not null references deal (id),
  path text not null check (path in (
    'ACCEPTED_RELEASE', 'OBJECTIVE_RELEASE', 'MUTUAL_RESOLUTION',
    'REVIEWED_RESOLUTION', 'NO_DELIVERY_REFUND'
  )),
  to_seller_minor bigint not null check (to_seller_minor >= 0),
  to_buyer_minor bigint not null check (to_buyer_minor >= 0),
  package_id uuid references delivery_package (package_id),
  created_at timestamptz not null default now(),
  check (to_seller_minor + to_buyer_minor > 0)
);
create index settlement_authorization_deal_idx on settlement_authorization (deal_id);
create index settlement_authorization_package_idx on settlement_authorization (package_id);

-- D.5: one logical transfer. `adapter_key` is the stable idempotency key sent
-- to the adapter; it never changes, so a retry cannot become a second payment.
create table adapter_operation (
  operation_id uuid primary key references aggregate (id),
  authorization_id uuid not null references settlement_authorization (authorization_id),
  deal_id uuid not null references deal (id),
  kind text not null check (kind in ('payout', 'refund')),
  amount_minor bigint not null check (amount_minor > 0),
  destination uuid not null references app_user (id),
  adapter_key text not null unique,
  unique (authorization_id, kind)
);
create index adapter_operation_deal_idx on adapter_operation (deal_id);
create index adapter_operation_destination_idx on adapter_operation (destination);

create table dispute (
  dispute_id uuid primary key references aggregate (id),
  deal_id uuid not null references deal (id),
  opened_by uuid not null references app_user (id),
  claim text not null check (claim in (
    'NOT_RECEIVED', 'CANNOT_ACCESS', 'WRONG_PRODUCT', 'INCOMPLETE',
    'LOST_ACCESS_LATER', 'COMPROMISED', 'OTHER'
  )),
  detail text not null default '',
  -- True when money for this deal had already been committed to the adapter:
  -- the dispute is then a post-dispatch claim, not a hold (D.5 step 3).
  after_dispatch boolean not null,
  opened_at timestamptz not null default now()
);
create index dispute_deal_idx on dispute (deal_id);
create index dispute_opened_by_idx on dispute (opened_by);

-- The synthetic payout provider's own record, keyed by the adapter key so a
-- replay returns the first result instead of paying twice.
create table mock_transfer (
  adapter_key text primary key,
  kind text not null,
  amount_minor bigint not null,
  destination uuid not null,
  status text not null check (status in ('SUCCEEDED', 'PENDING', 'FAILED_FINAL')),
  created_at timestamptz not null default now()
);

create trigger delivery_item_append_only before update or delete on delivery_item
for each row execute function reject_change();
create trigger inspection_result_append_only before update or delete on inspection_result
for each row execute function reject_change();
create trigger delivery_acceptance_append_only before update or delete on delivery_acceptance
for each row execute function reject_change();

alter table deal_deadline enable row level security;
alter table delivery_package enable row level security;
alter table delivery_item enable row level security;
alter table inspection_item enable row level security;
alter table inspection_result enable row level security;
alter table delivery_acceptance enable row level security;
alter table settlement_authorization enable row level security;
alter table adapter_operation enable row level security;
alter table dispute enable row level security;
alter table mock_transfer enable row level security;
