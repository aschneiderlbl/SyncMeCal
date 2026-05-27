-- SyncMeCal initial schema
-- Run this in the Supabase SQL editor (or via supabase db push).

-- ============================================================================
-- profiles
-- One row per signed-in user. Stores the Google tokens we need to call
-- Google Calendar APIs on the user's behalf.
-- ============================================================================
create table public.profiles (
  id                          uuid primary key references auth.users(id) on delete cascade,
  email                       text not null,
  display_name                text,
  avatar_url                  text,
  google_access_token         text,
  google_refresh_token        text,
  google_token_expires_at     timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ============================================================================
-- requests
-- A scheduling request like "find coffee with Tony this summer".
-- share_token is the public path component for /invite/<token>.
-- ============================================================================
create table public.requests (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  prompt              text not null,
  parsed              jsonb,                                    -- structured rules from Claude
  status              text not null default 'open',             -- 'open' | 'anchor_dropped' | 'cancelled'
  share_token         text not null unique default encode(gen_random_bytes(16), 'hex'),
  scheduled_option_id uuid,                                     -- set when anchor drops
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index requests_user_id_idx on public.requests(user_id);
create index requests_share_token_idx on public.requests(share_token);

-- ============================================================================
-- options
-- The 3 (or more) proposed time slots Cap'n Cal generated for a request.
-- ============================================================================
create table public.options (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  label       text,                              -- human-readable e.g. "Fri morning before standup"
  position    int not null,                      -- 1..N for display order
  created_at  timestamptz not null default now()
);

create index options_request_id_idx on public.options(request_id);

-- ============================================================================
-- votes
-- A matey's vote on one option. We capture name/email so the captain can see
-- who anchored what. (Mateys are anonymous to the database — no auth required.)
-- ============================================================================
create table public.votes (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests(id) on delete cascade,
  option_id   uuid not null references public.options(id) on delete cascade,
  voter_name  text not null,
  voter_email text,
  choice      text not null,                     -- 'aye' | 'rough_seas'
  created_at  timestamptz not null default now()
);

create index votes_request_id_idx on public.votes(request_id);
create index votes_option_id_idx on public.votes(option_id);

-- ============================================================================
-- updated_at trigger
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger requests_touch_updated before update on public.requests
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- RLS
-- The signed-in user (their JWT's auth.uid()) can see their own rows.
-- The public invite page reads through a server-side route that uses the
-- service-role key, so we don't need a public-read policy.
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.options  enable row level security;
alter table public.votes    enable row level security;

create policy "profile self select" on public.profiles
  for select using (auth.uid() = id);
create policy "profile self upsert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profile self update" on public.profiles
  for update using (auth.uid() = id);

create policy "request self all" on public.requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "options of own requests" on public.options
  for all using (
    exists (select 1 from public.requests r where r.id = options.request_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.requests r where r.id = options.request_id and r.user_id = auth.uid())
  );

create policy "votes of own requests" on public.votes
  for select using (
    exists (select 1 from public.requests r where r.id = votes.request_id and r.user_id = auth.uid())
  );
-- Note: vote INSERTs from the public invite page go through the service-role
-- API route, which bypasses RLS. We deliberately don't add a public insert
-- policy here to keep the surface area small.
