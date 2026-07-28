-- Albums are first-class rows so empty albums persist independently of tasks.
-- The legacy tasks.album text remains unchanged for supported older clients.
create table if not exists public.albums (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id text not null,
  name text not null,
  ord bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint
);

create index if not exists albums_user_list_order
  on public.albums(user_id, list_id, ord);
create index if not exists albums_user_updated
  on public.albums(user_id, updated_at);

insert into public.albums (id, user_id, list_id, name, ord, updated_at)
select
  'album:' || list_id || ':' || btrim(album),
  user_id,
  list_id,
  btrim(album),
  min(ord),
  max(updated_at)
from public.tasks
where deleted_at is null and album is not null and btrim(album) <> ''
group by user_id, list_id, btrim(album)
on conflict (id) do nothing;

alter table public.albums enable row level security;

drop policy if exists "own rows" on public.albums;
create policy "own rows" on public.albums for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists albums_lww on public.albums;
create trigger albums_lww before update on public.albums
  for each row execute function public.lww_guard();

update public.app_schema
set
  schema_version = greatest(schema_version, 10),
  capabilities = case
    when 'albums_v1' = any(capabilities) then capabilities
    else array_append(capabilities, 'albums_v1')
  end,
  updated_at = 1785162600000
where id = 1;

notify pgrst, 'reload schema';
