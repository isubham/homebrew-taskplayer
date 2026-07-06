create table if not exists public.lists (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, emoji text, color text, ord bigint,
  updated_at bigint not null default 0,
  deleted_at bigint
);
create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id text not null, name text not null, depth text, ord bigint,
  est bigint, done bigint, descr text, album text,
  updated_at bigint not null default 0,
  deleted_at bigint
);
-- if this table already exists from before the "albums" feature, run:
-- alter table public.tasks add column if not exists album text;
create table if not exists public.sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null, start bigint not null, "end" bigint,
  updated_at bigint not null default 0,
  deleted_at bigint
);

alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "own rows" on public.lists;
create policy "own rows" on public.lists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.tasks;
create policy "own rows" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.sessions;
create policy "own rows" on public.sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.lww_guard() returns trigger as $$
begin
  if new.updated_at <= old.updated_at then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;
drop trigger if exists lists_lww on public.lists;
create trigger lists_lww before update on public.lists for each row execute function public.lww_guard();
drop trigger if exists tasks_lww on public.tasks;
create trigger tasks_lww before update on public.tasks for each row execute function public.lww_guard();
drop trigger if exists sessions_lww on public.sessions;
create trigger sessions_lww before update on public.sessions for each row execute function public.lww_guard();

notify pgrst, 'reload schema';