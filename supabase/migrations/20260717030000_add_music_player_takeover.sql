-- Explicit combined consent for exact Apple Music and Spotify control. Keep
-- the Apple-only v1 field during the compatibility window for older clients.
alter table public.user_settings
  add column if not exists take_over_music_players boolean not null default false;

insert into public.app_schema (
  id, schema_version, min_supported_client, capabilities, updated_at
)
values (
  1,
  7,
  '0.5.0',
  array[
    'planner_windows_v1',
    'life_area_priorities_v1',
    'run_state_v1',
    'music_favorites_v1',
    'user_settings_v1',
    'apple_music_takeover_v1',
    'music_player_takeover_v2'
  ],
  1784237400000
)
on conflict (id) do update set
  schema_version = excluded.schema_version,
  min_supported_client = excluded.min_supported_client,
  capabilities = excluded.capabilities,
  updated_at = excluded.updated_at;

notify pgrst, 'reload schema';
