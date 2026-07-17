-- General cross-device preferences. This singleton is separate from timer
-- configuration so future UI preferences do not expand the session model.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pause_for_other_audio boolean not null default true,
  updated_at bigint not null default 0
);

alter table public.user_settings enable row level security;

drop policy if exists "own rows" on public.user_settings;
create policy "own rows" on public.user_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.user_settings to authenticated;

drop trigger if exists user_settings_lww on public.user_settings;
create trigger user_settings_lww before update on public.user_settings
  for each row execute function public.lww_guard();

insert into public.app_schema (
  id, schema_version, min_supported_client, capabilities, updated_at
)
values (
  1,
  5,
  '0.5.0',
  array[
    'planner_windows_v1',
    'life_area_priorities_v1',
    'run_state_v1',
    'music_favorites_v1',
    'user_settings_v1'
  ],
  1784230200000
)
on conflict (id) do update set
  schema_version = excluded.schema_version,
  min_supported_client = excluded.min_supported_client,
  capabilities = excluded.capabilities,
  updated_at = excluded.updated_at;

notify pgrst, 'reload schema';
