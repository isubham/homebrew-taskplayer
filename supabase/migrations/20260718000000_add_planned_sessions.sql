-- Future one-time-task commitments. Recorded sessions remain actual work only,
-- so older clients continue calculating history and rewards without seeing
-- planned rows.
create table if not exists public.planned_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  start bigint not null,
  "end" bigint not null,
  updated_at bigint not null default 0,
  deleted_at bigint,
  constraint planned_sessions_positive_range check ("end" > start)
);

create index if not exists planned_sessions_user_start
  on public.planned_sessions(user_id, start);

alter table public.planned_sessions enable row level security;

drop policy if exists "own rows" on public.planned_sessions;
create policy "own rows" on public.planned_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.planned_sessions to authenticated;

drop trigger if exists planned_sessions_lww on public.planned_sessions;
create trigger planned_sessions_lww before update on public.planned_sessions
  for each row execute function public.lww_guard();

insert into public.app_schema (
  id, schema_version, min_supported_client, capabilities, updated_at
)
values (
  1,
  8,
  '0.5.0',
  array[
    'planner_windows_v1',
    'life_area_priorities_v1',
    'run_state_v1',
    'music_favorites_v1',
    'user_settings_v1',
    'apple_music_takeover_v1',
    'music_player_takeover_v2',
    'planned_sessions_v1'
  ],
  1784332800000
)
on conflict (id) do update set
  schema_version = excluded.schema_version,
  min_supported_client = excluded.min_supported_client,
  capabilities = excluded.capabilities,
  updated_at = excluded.updated_at;

notify pgrst, 'reload schema';
