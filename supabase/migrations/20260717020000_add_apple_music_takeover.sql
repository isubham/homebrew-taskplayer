-- Explicit opt-in for controlling Apple Music when focus music takes priority.
alter table public.user_settings
  add column if not exists take_over_apple_music boolean not null default false;

insert into public.app_schema (
  id, schema_version, min_supported_client, capabilities, updated_at
)
values (
  1,
  6,
  '0.5.0',
  array[
    'planner_windows_v1',
    'life_area_priorities_v1',
    'run_state_v1',
    'music_favorites_v1',
    'user_settings_v1',
    'apple_music_takeover_v1'
  ],
  1784233800000
)
on conflict (id) do update set
  schema_version = excluded.schema_version,
  min_supported_client = excluded.min_supported_client,
  capabilities = excluded.capabilities,
  updated_at = excluded.updated_at;

notify pgrst, 'reload schema';
