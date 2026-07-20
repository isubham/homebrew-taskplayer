create table if not exists public.lists (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, emoji text, color text, ord bigint,
  updated_at bigint not null default 0,
  deleted_at bigint,
  life_area text,
  life_direction text,
  availability_windows jsonb not null default '[]'::jsonb
);
-- if this table already exists from before the "life areas" feature, run:
-- alter table public.lists add column if not exists life_area text;
-- alter table public.lists add column if not exists life_direction text;
-- "Mental Wellbeing" merged into "Health & Wellbeing" (see migration 010,
-- migrations.rs) — remap any remotely-stored wellbeing tags to match:
-- update public.lists set life_area='health' where life_area='wellbeing';
-- if this table already exists from before the planner feature, run:
-- alter table public.lists add column if not exists availability_windows jsonb not null default '[]'::jsonb;
create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id text not null, name text not null, depth text, ord bigint,
  est bigint, done bigint, descr text, album text,
  updated_at bigint not null default 0,
  deleted_at bigint,
  impact_tier text,
  impact_sign bigint not null default 1,
  deadline_at bigint,
  cadence text,
  daily_windows jsonb not null default '[]'::jsonb,
  min_session_min bigint,
  max_session_min bigint
);
-- if this table already exists from before the "albums" feature, run:
-- alter table public.tasks add column if not exists album text;
-- if this table already exists from before the "impact" feature, run:
-- alter table public.tasks add column if not exists impact_tier text;
-- alter table public.tasks add column if not exists impact_sign bigint not null default 1;
-- if this table already exists from before the "Now section" deadline feature, run:
-- alter table public.tasks add column if not exists deadline_at bigint;
-- if this table already exists from before the "cadence" (repeating tasks) feature, run:
-- alter table public.tasks add column if not exists cadence text;
-- if this table already exists from before the planner feature, run:
-- alter table public.tasks add column if not exists daily_windows jsonb not null default '[]'::jsonb;
-- alter table public.tasks add column if not exists min_session_min bigint;
-- alter table public.tasks add column if not exists max_session_min bigint;
create table if not exists public.sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null, start bigint not null, "end" bigint,
  logical_session_id text,
  session_finished_at bigint,
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

-- Cross-device live session sync (see docs/session-sync-design.md). One row
-- per account, not per device — user_id as the primary key is what enforces
-- "only one active session at a time" at the schema level.
create table if not exists public.run_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text,
  active_task_id text,
  running_start bigint,
  phase text,
  break_start bigint,
  active_session_id text,
  session_work_ms bigint not null default 0,
  pomodoro_work_ms bigint not null default 0,
  last_task_id text,
  cycles_completed bigint not null default 0,
  long_break boolean not null default false,
  updated_at bigint not null default 0,
  deleted_at bigint
);

alter table public.run_state enable row level security;

drop policy if exists "own rows" on public.run_state;
create policy "own rows" on public.run_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists run_state_lww on public.run_state;
create trigger run_state_lww before update on public.run_state for each row execute function public.lww_guard();

-- Cross-device settings sync — pomodoro/target config, same singleton-row
-- shape as run_state above, but no device identity: settings aren't "owned"
-- by whichever device changed them last, it's plain last-write-wins.
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

alter table public.config enable row level security;

drop policy if exists "own rows" on public.config;
create policy "own rows" on public.config for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists config_lww on public.config;
create trigger config_lww before update on public.config for each row execute function public.lww_guard();

-- User-controlled planning precedence for the app's fixed life areas.
create table if not exists public.life_area_priorities (
  user_id uuid not null references auth.users(id) on delete cascade,
  area_key text not null,
  priority_rank bigint not null check (priority_rank > 0),
  updated_at bigint not null default 0,
  primary key (user_id, area_key)
);

alter table public.life_area_priorities enable row level security;

drop policy if exists "own rows" on public.life_area_priorities;
create policy "own rows" on public.life_area_priorities for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists life_area_priorities_lww on public.life_area_priorities;
create trigger life_area_priorities_lww before update on public.life_area_priorities for each row execute function public.lww_guard();

notify pgrst, 'reload schema';
