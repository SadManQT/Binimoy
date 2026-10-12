-- No policies on purpose: the application connects as the table owner, which
-- bypasses RLS. Every other role (including Supabase's anon and authenticated
-- Data API roles) is denied.
alter table worker_heartbeat enable row level security;
