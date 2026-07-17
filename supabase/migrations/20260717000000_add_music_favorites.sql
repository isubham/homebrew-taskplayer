-- Synced focus-music favorites. This is additive: older clients do not know
-- the table exists and continue syncing their existing content unchanged.
create table if not exists public.music_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null,
  title text not null,
  artist text not null,
  artwork_urls jsonb not null default '[]'::jsonb,
  permalink text,
  source_type text not null,
  updated_at bigint not null default 0,
  deleted_at bigint,
  primary key (user_id, track_id)
);

alter table public.music_favorites enable row level security;

drop policy if exists "own rows" on public.music_favorites;
create policy "own rows" on public.music_favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.music_favorites to authenticated;

drop trigger if exists music_favorites_lww on public.music_favorites;
create trigger music_favorites_lww before update on public.music_favorites
  for each row execute function public.lww_guard();

insert into public.app_schema (
  id, schema_version, min_supported_client, capabilities, updated_at
)
values (
  1,
  4,
  '0.5.0',
  array[
    'planner_windows_v1',
    'life_area_priorities_v1',
    'run_state_v1',
    'music_favorites_v1'
  ],
  1784226600000
)
on conflict (id) do update set
  schema_version = excluded.schema_version,
  min_supported_client = excluded.min_supported_client,
  capabilities = excluded.capabilities,
  updated_at = excluded.updated_at;

notify pgrst, 'reload schema';
