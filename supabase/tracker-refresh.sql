-- Run in the Supabase SQL editor for the Page Review Tracker project.
begin;

create table if not exists public.tracker_refresh (
  id boolean primary key default true check (id),
  revision integer not null default 0
);
insert into public.tracker_refresh (id) values (true) on conflict (id) do nothing;

alter table public.tracker_refresh enable row level security;
revoke all on public.tracker_refresh from public, anon, authenticated;
grant select on public.tracker_refresh to authenticated;

drop policy if exists "Members read tracker refresh" on public.tracker_refresh;
create policy "Members read tracker refresh" on public.tracker_refresh
  for select to authenticated
  using (exists (
    select 1 from public.members m where lower(m.email) = lower(auth.jwt() ->> 'email')
  ));

create or replace function public.request_tracker_refresh()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  next_revision integer;
begin
  if not exists (
    select 1 from public.members m
    where lower(m.email) = lower(auth.jwt() ->> 'email') and m.role = 'admin'
  ) then
    raise exception 'Only a tracker admin can request a refresh';
  end if;
  update public.tracker_refresh set revision = revision + 1
  where id = true returning revision into next_revision;
  if next_revision is null then
    raise exception 'Tracker refresh configuration is missing';
  end if;
  return next_revision;
end;
$$;
revoke all on function public.request_tracker_refresh() from public, anon, authenticated;
grant execute on function public.request_tracker_refresh() to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'The supabase_realtime publication does not exist';
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables)
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tracker_refresh'
     ) then
    alter publication supabase_realtime add table public.tracker_refresh;
  end if;
end;
$$;
commit;
