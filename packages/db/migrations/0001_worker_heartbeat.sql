create table worker_heartbeat (
  worker_id text primary key,
  beat_at timestamptz not null
);
