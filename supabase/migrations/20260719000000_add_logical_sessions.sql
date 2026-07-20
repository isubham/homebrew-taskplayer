-- One user-visible session can contain several persisted focus intervals.
-- Existing clients continue reading each interval as an ordinary session,
-- while current clients group them and derive breaks from the gaps.
alter table public.sessions
  add column if not exists logical_session_id text;

alter table public.sessions
  add column if not exists session_finished_at bigint;

create index if not exists sessions_user_logical_session
  on public.sessions(user_id, logical_session_id);

-- Runtime-only grouping and elapsed-focus fields let pause/resume retain the
-- same logical session and Pomodoro block without introducing a new phase
-- value that older clients would misinterpret.
alter table public.run_state
  add column if not exists active_session_id text;

alter table public.run_state
  add column if not exists session_work_ms bigint not null default 0;

alter table public.run_state
  add column if not exists pomodoro_work_ms bigint not null default 0;

insert into public.app_schema (
  id, schema_version, min_supported_client, capabilities, updated_at
)
values (
  1,
  9,
  '0.5.0',
  array[
    'planner_windows_v1',
    'life_area_priorities_v1',
    'run_state_v1',
    'music_favorites_v1',
    'user_settings_v1',
    'apple_music_takeover_v1',
    'music_player_takeover_v2',
    'planned_sessions_v1',
    'logical_sessions_v1'
  ],
  1784428200000
)
on conflict (id) do update set
  schema_version = excluded.schema_version,
  min_supported_client = excluded.min_supported_client,
  capabilities = excluded.capabilities,
  updated_at = excluded.updated_at;

notify pgrst, 'reload schema';
