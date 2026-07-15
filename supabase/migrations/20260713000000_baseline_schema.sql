-- Idempotent baseline for Supabase projects that were originally configured
-- manually. Keeping it in migration history makes a fresh database and CI
-- reproduce the same pre-planner backend without manual steps.
create table if not exists public.lists (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text,
  color text,
  ord bigint,
  updated_at bigint not null default 0,
  deleted_at bigint,
  life_area text,
  life_direction text
);

create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id text not null,
  name text not null,
  depth text,
  ord bigint,
  est bigint,
  done bigint,
  descr text,
  album text,
  updated_at bigint not null default 0,
  deleted_at bigint,
  impact_tier text,
  impact_sign bigint not null default 1,
  deadline_at bigint,
  cadence text
);

create table if not exists public.sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  start bigint not null,
  "end" bigint,
  updated_at bigint not null default 0,
  deleted_at bigint
);

create table if not exists public.run_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text,
  active_task_id text,
  running_start bigint,
  phase text,
  break_start bigint,
  last_task_id text,
  cycles_completed bigint not null default 0,
  long_break boolean not null default false,
  updated_at bigint not null default 0,
  deleted_at bigint
);

create table if not exists public.config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'open',
  target_min bigint not null default 45,
  work_min bigint not null default 25,
  break_min bigint not null default 5,
  break_sound text not null default 'Glass',
  work_sound text not null default 'Ping',
  cycles_before_long_break bigint not null default 4,
  long_break_min bigint not null default 20,
  updated_at bigint not null default 0
);

-- Projects created manually may already have these tables but not every
-- additive field. Repair that shape without renaming or removing anything.
alter table public.lists add column if not exists updated_at bigint not null default 0;
alter table public.lists add column if not exists deleted_at bigint;
alter table public.lists add column if not exists life_area text;
alter table public.lists add column if not exists life_direction text;

alter table public.tasks add column if not exists album text;
alter table public.tasks add column if not exists updated_at bigint not null default 0;
alter table public.tasks add column if not exists deleted_at bigint;
alter table public.tasks add column if not exists impact_tier text;
alter table public.tasks add column if not exists impact_sign bigint not null default 1;
alter table public.tasks add column if not exists deadline_at bigint;
alter table public.tasks add column if not exists cadence text;

alter table public.sessions add column if not exists updated_at bigint not null default 0;
alter table public.sessions add column if not exists deleted_at bigint;

alter table public.run_state add column if not exists device_name text;
alter table public.run_state add column if not exists last_task_id text;
alter table public.run_state add column if not exists cycles_completed bigint not null default 0;
alter table public.run_state add column if not exists long_break boolean not null default false;
alter table public.run_state add column if not exists updated_at bigint not null default 0;
alter table public.run_state add column if not exists deleted_at bigint;

alter table public.config add column if not exists break_sound text not null default 'Glass';
alter table public.config add column if not exists work_sound text not null default 'Ping';
alter table public.config add column if not exists cycles_before_long_break bigint not null default 4;
alter table public.config add column if not exists long_break_min bigint not null default 20;
alter table public.config add column if not exists updated_at bigint not null default 0;

create or replace function public.lww_guard() returns trigger as $$
begin
  if new.updated_at <= old.updated_at then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.sessions enable row level security;
alter table public.run_state enable row level security;
alter table public.config enable row level security;

drop policy if exists "own rows" on public.lists;
create policy "own rows" on public.lists for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.tasks;
create policy "own rows" on public.tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.sessions;
create policy "own rows" on public.sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.run_state;
create policy "own rows" on public.run_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.config;
create policy "own rows" on public.config for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists lists_lww on public.lists;
create trigger lists_lww before update on public.lists
  for each row execute function public.lww_guard();
drop trigger if exists tasks_lww on public.tasks;
create trigger tasks_lww before update on public.tasks
  for each row execute function public.lww_guard();
drop trigger if exists sessions_lww on public.sessions;
create trigger sessions_lww before update on public.sessions
  for each row execute function public.lww_guard();
drop trigger if exists run_state_lww on public.run_state;
create trigger run_state_lww before update on public.run_state
  for each row execute function public.lww_guard();
drop trigger if exists config_lww on public.config;
create trigger config_lww before update on public.config
  for each row execute function public.lww_guard();

notify pgrst, 'reload schema';
