-- LP-008, LP-017, LP-021: the synthetic provider's records, the objective
-- release challenge window, and milestone numbering.

-- What the fictional provider would answer for one deal. Set by a tester from
-- the Scenario Lab. INV-15: this never describes a real provider.
create table mock_provider_fact (
  deal_id uuid not null references deal (id),
  predicate text not null,
  outcome text not null check (outcome in ('PASSED', 'FAILED', 'UNKNOWN')),
  -- The destination or identifier the provider says the fact is about.
  bound_to text,
  detail text not null default '',
  set_by uuid not null references app_user (id),
  set_at timestamptz not null default now(),
  primary key (deal_id, predicate)
);
create index mock_provider_fact_set_by_idx on mock_provider_fact (set_by);

-- B9 OBJECTIVE_RELEASE: every mandatory item is independently proven, the
-- buyer has been told, and this is how long they have to object.
create table objective_window (
  package_id uuid primary key references delivery_package (package_id),
  opened_at timestamptz not null default now(),
  due_at timestamptz not null
);

-- C14.12: which milestone a package delivers. Null for ordinary deals.
alter table delivery_package add column milestone_no integer check (milestone_no >= 1);

alter table mock_provider_fact enable row level security;
alter table objective_window enable row level security;
