-- LP-005: funding invoices, a double-entry journal, provider events and
-- outbox leases. All money is synthetic; amounts are minor units (D.4).

create table funding_invoice (
  invoice_id uuid primary key references aggregate (id),
  deal_id uuid not null references deal (id),
  agreement_id uuid not null,
  agreement_version_no integer not null,
  terms_hash text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = 'BDT'),
  payer_id uuid not null references app_user (id),
  provider_payment_ref text unique,
  -- False once the invoice is expired or cancelled, so a new one may exist.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (agreement_id, agreement_version_no)
    references agreement_version (agreement_id, version_no)
);
create unique index funding_invoice_one_active on funding_invoice (deal_id) where active;
create index funding_invoice_payer_id_idx on funding_invoice (payer_id);
create index funding_invoice_agreement_idx on funding_invoice (agreement_id, agreement_version_no);

-- One journal entry per economic fact. `ref` is the stable key of that fact,
-- so recording it twice is impossible (INV-04).
create table journal_entry (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deal (id),
  kind text not null,
  ref text not null unique,
  created_at timestamptz not null default now()
);
create index journal_entry_deal_id_idx on journal_entry (deal_id);

create table journal_line (
  entry_id uuid not null references journal_entry (id),
  line_no integer not null,
  account text not null check (account in (
    'mock_clearing', 'held', 'reserved', 'seller_paid',
    'buyer_refunded', 'fee_collected', 'unapplied'
  )),
  debit_minor bigint not null default 0 check (debit_minor >= 0),
  credit_minor bigint not null default 0 check (credit_minor >= 0),
  currency text not null default 'BDT' check (currency = 'BDT'),
  primary key (entry_id, line_no),
  -- Exactly one side is non-zero.
  check ((debit_minor = 0) <> (credit_minor = 0))
);

-- Checked at commit, when all lines of the entry exist.
create function journal_entry_balanced() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  difference numeric;
begin
  execute format(
    'select coalesce(sum(debit_minor), 0) - coalesce(sum(credit_minor), 0) from %I.journal_line where entry_id = $1',
    tg_table_schema
  ) using new.entry_id into difference;
  if difference <> 0 then
    raise exception 'journal entry % is not balanced (difference %)', new.entry_id, difference;
  end if;
  return null;
end
$$;

create constraint trigger journal_line_balanced
after insert on journal_line
deferrable initially deferred
for each row execute function journal_entry_balanced();

-- Corrections are new linked entries, never edits (D.4, INV-14).
create trigger journal_entry_append_only
before update or delete on journal_entry
for each row execute function reject_change();

create trigger journal_line_append_only
before update or delete on journal_line
for each row execute function reject_change();

-- Every authenticated provider event is stored before it is processed (D.4).
create table provider_event (
  provider text not null,
  event_id text not null,
  payment_ref text not null,
  type text not null,
  amount_minor bigint not null,
  currency text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  primary key (provider, event_id)
);
create index provider_event_payment_ref_idx on provider_event (payment_ref);
create index provider_event_unprocessed_idx on provider_event (received_at) where processed_at is null;

-- The synthetic payment provider's own record. Not a real provider.
create table mock_payment (
  payment_ref text primary key,
  invoice_id uuid not null references funding_invoice (invoice_id),
  expected_minor bigint not null,
  currency text not null,
  created_at timestamptz not null default now()
);
create index mock_payment_invoice_id_idx on mock_payment (invoice_id);

-- D.5 step 6: leases with a fencing generation, bounded attempts, dead letter.
alter table outbox
  add column attempts integer not null default 0,
  add column lease_owner text,
  add column lease_generation bigint not null default 0,
  add column lease_until timestamptz,
  add column dead_at timestamptz,
  add column last_error text;

alter table funding_invoice enable row level security;
alter table journal_entry enable row level security;
alter table journal_line enable row level security;
alter table provider_event enable row level security;
alter table mock_payment enable row level security;
