-- Supabase SQL (run in Supabase SQL editor)
-- Purpose:
-- - Track per-user PDF save counts by month (YYYY-MM)
-- - Provide an atomic increment RPC for server-side usage logging

-- 1) Table
create table if not exists public.pdf_save_monthly_counts (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

-- Ensure month format is YYYY-MM (basic check)
alter table public.pdf_save_monthly_counts
  drop constraint if exists pdf_save_monthly_counts_month_format;
alter table public.pdf_save_monthly_counts
  add constraint pdf_save_monthly_counts_month_format
  check (month ~ '^[0-9]{4}-[0-9]{2}$');

-- 2) RLS
alter table public.pdf_save_monthly_counts enable row level security;

-- Users can read their own rows
drop policy if exists "pdf_counts_select_own" on public.pdf_save_monthly_counts;
create policy "pdf_counts_select_own"
on public.pdf_save_monthly_counts
for select
using (auth.uid() = user_id);

-- Block direct client writes by default (server uses service role)
drop policy if exists "pdf_counts_no_client_write" on public.pdf_save_monthly_counts;
create policy "pdf_counts_no_client_write"
on public.pdf_save_monthly_counts
for all
to authenticated
using (false)
with check (false);

-- 3) Atomic increment RPC (SECURITY DEFINER)
-- Notes:
-- - Called from server using the Service Role key
-- - Accepts p_user_id and p_month; increments count and returns the updated row
create or replace function public.increment_pdf_save_monthly(p_user_id uuid, p_month text)
returns public.pdf_save_monthly_counts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pdf_save_monthly_counts;
begin
  insert into public.pdf_save_monthly_counts(user_id, month, count, updated_at)
  values (p_user_id, p_month, 1, now())
  on conflict (user_id, month)
  do update set
    count = public.pdf_save_monthly_counts.count + 1,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Allow only service role to execute (default for SECURITY DEFINER is still governed by execute grants)
revoke all on function public.increment_pdf_save_monthly(uuid, text) from public;
revoke all on function public.increment_pdf_save_monthly(uuid, text) from anon;
revoke all on function public.increment_pdf_save_monthly(uuid, text) from authenticated;
grant execute on function public.increment_pdf_save_monthly(uuid, text) to service_role;

