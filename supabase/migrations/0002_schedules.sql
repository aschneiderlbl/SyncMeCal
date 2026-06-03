-- SyncMeCal — recurring schedules
-- Adds: schedules table, schedule_id FK on requests, RLS.
-- Idempotent-ish: uses IF NOT EXISTS where Postgres allows it.

-- ============================================================================
-- schedules
-- A saved recurrence — re-runs the prompt every week/month/quarter, emails the
-- user a fresh batch of proposed slots, and rolls the date range forward.
-- ============================================================================
create table if not exists public.schedules (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  prompt             text not null,
  parsed             jsonb not null,                      -- snapshot of the parsed rules
  cadence            text not null check (cadence in ('weekly','monthly','quarterly')),
  next_run_at        timestamptz not null,
  last_run_at        timestamptz,
  enabled            boolean not null default true,
  origin_request_id  uuid references public.requests(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists schedules_user_id_idx on public.schedules(user_id);
-- Partial index lets the cron find due, enabled schedules fast.
create index if not exists schedules_due_idx on public.schedules(next_run_at) where enabled;

-- Each request optionally points back at the schedule that spawned it.
alter table public.requests
  add column if not exists schedule_id uuid references public.schedules(id) on delete set null;
create index if not exists requests_schedule_id_idx on public.requests(schedule_id);

-- Reuse the existing touch_updated_at() from 0001_init.sql.
drop trigger if exists schedules_touch_updated on public.schedules;
create trigger schedules_touch_updated before update on public.schedules
  for each row execute function public.touch_updated_at();

-- RLS — owner-only access.
alter table public.schedules enable row level security;

drop policy if exists "schedule self all" on public.schedules;
create policy "schedule self all" on public.schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
