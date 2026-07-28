-- Goals organize existing work by life area without changing task rewards.
create table if not exists public.goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  life_area text not null,
  title text not null,
  description text,
  status text not null default 'active',
  is_current_focus boolean not null default false,
  next_task_id text,
  updated_at bigint not null default 0,
  deleted_at bigint
);

create index if not exists goals_user_area_status
  on public.goals(user_id, life_area, status);
create index if not exists goals_user_updated
  on public.goals(user_id, updated_at);

create table if not exists public.goal_task_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id text not null,
  task_id text not null,
  updated_at bigint not null default 0,
  deleted_at bigint,
  primary key (goal_id, task_id)
);

create index if not exists goal_task_links_user_updated
  on public.goal_task_links(user_id, updated_at);

alter table public.goals enable row level security;
alter table public.goal_task_links enable row level security;

drop policy if exists "own rows" on public.goals;
create policy "own rows" on public.goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.goal_task_links;
create policy "own rows" on public.goal_task_links for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists goals_lww on public.goals;
create trigger goals_lww before update on public.goals
  for each row execute function public.lww_guard();

drop trigger if exists goal_task_links_lww on public.goal_task_links;
create trigger goal_task_links_lww before update on public.goal_task_links
  for each row execute function public.lww_guard();

update public.app_schema
set
  schema_version = greatest(schema_version, 11),
  capabilities = case
    when 'goals_v1' = any(capabilities) then capabilities
    else array_append(capabilities, 'goals_v1')
  end,
  updated_at = 1785249000000
where id = 1;

notify pgrst, 'reload schema';
