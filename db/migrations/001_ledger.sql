-- The ledger stores no name, phone or email. Staff trace an event by appointment id.
create table ledger (
  id bigserial primary key,
  workspace text not null,
  run_id text not null,
  received_at timestamptz not null default now(),
  location text,
  appointment_id text,
  appointment_category text,
  appointment_starts_at timestamptz,
  appointment_status text,
  event_type text,
  idempotency_key text,
  outcome text not null check (outcome in ('applied','ignored','duplicate','needs_review','rejected','failed')),
  match_method text,
  ghl_contact_id text,
  ghl_opportunity_id text,
  pipeline text,
  actions jsonb not null default '[]',
  reason text,
  dropped_fields text[] not null default '{}'
);
create index ledger_workspace_idx on ledger (workspace, id desc);
create index ledger_received_idx on ledger (received_at);

-- A delivery claims its key inside the same transaction as its work, so a failure frees it for a retry.
create table processed_events (
  run_id text not null,
  idempotency_key text not null,
  appointment_id text not null,
  created_at timestamptz not null default now(),
  primary key (run_id, idempotency_key)
);

-- What the sync remembers per appointment, so cancels and reschedules never re-match.
create table appointments (
  run_id text not null,
  location text not null,
  appointment_id text not null,
  status text not null check (status in ('booked','cancelled')),
  starts_at timestamptz,
  ghl_contact_id text,
  ghl_opportunity_id text,
  pipeline text,
  last_event_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (run_id, location, appointment_id)
);
create index appointments_opportunity_idx on appointments (run_id, ghl_opportunity_id);
