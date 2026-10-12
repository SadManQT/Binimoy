-- A process that dies mid-transaction must not keep its row locks: an orphaned
-- transaction would hold a deal lock and block every later command on it.
-- This is set on the role because the Supabase pooler drops the equivalent
-- connection option. It takes effect for sessions started after this runs.
do $$
begin
  execute format(
    'alter role %I set idle_in_transaction_session_timeout = %L',
    current_user, '30s'
  );
end
$$;
