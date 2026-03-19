-- Run this in Supabase SQL Editor for meetmap-desktop.
-- Creates per-user saved events with RLS.

create table if not exists public.saved_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.saved_events enable row level security;

create policy if not exists "saved_events_select_own"
on public.saved_events
for select
to authenticated
using (auth.uid() = user_id);

create policy if not exists "saved_events_insert_own"
on public.saved_events
for insert
to authenticated
with check (auth.uid() = user_id);

create policy if not exists "saved_events_delete_own"
on public.saved_events
for delete
to authenticated
using (auth.uid() = user_id);
