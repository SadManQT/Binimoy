-- LP-007: which Matrix room is the deal's secret vault. One per deal, fixed
-- once registered. The room id is metadata; no vault content is stored here.
create table vault_room (
  deal_id uuid primary key references deal (id),
  room_id text not null unique,
  registered_by uuid not null references app_user (id),
  registered_at timestamptz not null default now()
);
create index vault_room_registered_by_idx on vault_room (registered_by);

alter table vault_room enable row level security;
