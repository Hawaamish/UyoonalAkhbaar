-- Run in the Supabase SQL editor for the Page Review Tracker project.
begin;

create table if not exists public.tracker_notifications (
  id bigint generated always as identity primary key,
  note_id text not null,
  page_id text not null,
  item_id text not null,
  recipient text not null,
  sender text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (note_id, recipient)
);

create index if not exists tracker_notifications_recipient_created_idx
  on public.tracker_notifications (recipient, created_at desc, id desc);

alter table public.tracker_notifications enable row level security;
revoke all on public.tracker_notifications from public, anon, authenticated;
grant select on public.tracker_notifications to authenticated;
grant update (read_at) on public.tracker_notifications to authenticated;

drop policy if exists "Members read their notifications" on public.tracker_notifications;
create policy "Members read their notifications" on public.tracker_notifications
  for select to authenticated
  using (
    recipient = lower(auth.jwt() ->> 'email')
    and exists (select 1 from public.members m where lower(m.email) = recipient)
  );

drop policy if exists "Members mark their notifications read" on public.tracker_notifications;
create policy "Members mark their notifications read" on public.tracker_notifications
  for update to authenticated
  using (
    recipient = lower(auth.jwt() ->> 'email')
    and exists (select 1 from public.members m where lower(m.email) = recipient)
  )
  with check (
    recipient = lower(auth.jwt() ->> 'email')
    and exists (select 1 from public.members m where lower(m.email) = recipient)
  );

create or replace function public.tracker_create_mention_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  sender_email text := lower(auth.jwt() ->> 'email');
begin
  if new.body is null or new.body !~ '@\[([^]]+)\]' then
    return new;
  end if;
  if sender_email is null or lower(new.author::text) is distinct from sender_email
     or not exists (select 1 from public.members m where lower(m.email) = sender_email) then
    raise exception 'Only a tracker member can send mentions as themselves';
  end if;

  insert into public.tracker_notifications (note_id, page_id, item_id, recipient, sender)
  select distinct new.id::text, new.page_id::text, new.item_id::text, lower(m.email), sender_email
  from regexp_matches(new.body, '@\[([^]]+)\]', 'g') as mention(parts)
  join public.members m on lower(m.email) = lower((mention.parts)[1])
  where lower(m.email) <> sender_email
  on conflict (note_id, recipient) do nothing;
  return new;
end;
$$;
revoke all on function public.tracker_create_mention_notifications() from public, anon, authenticated;
drop trigger if exists tracker_create_mention_notifications on public.notes;
create trigger tracker_create_mention_notifications
  after insert on public.notes
  for each row execute function public.tracker_create_mention_notifications();

create or replace function public.tracker_delete_mention_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.tracker_notifications where note_id = old.id::text;
  return old;
end;
$$;
revoke all on function public.tracker_delete_mention_notifications() from public, anon, authenticated;
drop trigger if exists tracker_delete_mention_notifications on public.notes;
create trigger tracker_delete_mention_notifications
  after delete on public.notes
  for each row execute function public.tracker_delete_mention_notifications();

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'The supabase_realtime publication does not exist';
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables)
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tracker_notifications'
     ) then
    alter publication supabase_realtime add table public.tracker_notifications;
  end if;
end;
$$;

commit;
