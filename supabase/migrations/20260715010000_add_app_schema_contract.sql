-- A stable, read-only contract that lets clients verify the backend before
-- using fields introduced by newer releases. Older clients never query this
-- table, so adding it does not change their behavior.
create table if not exists public.app_schema (
  id smallint primary key default 1 check (id = 1),
  schema_version bigint not null,
  min_supported_client text not null,
  capabilities text[] not null default '{}',
  updated_at bigint not null default 0
);

alter table public.app_schema enable row level security;

drop policy if exists "authenticated clients can read app schema" on public.app_schema;
create policy "authenticated clients can read app schema"
  on public.app_schema
  for select
  to authenticated
  using (true);

grant select on public.app_schema to authenticated;

insert into public.app_schema (
  id,
  schema_version,
  min_supported_client,
  capabilities,
  updated_at
)
values (
  1,
  3,
  '0.5.0',
  array[
    'planner_windows_v1',
    'life_area_priorities_v1',
    'run_state_v1'
  ],
  1784073600000
)
on conflict (id) do update set
  schema_version = excluded.schema_version,
  min_supported_client = excluded.min_supported_client,
  capabilities = excluded.capabilities,
  updated_at = excluded.updated_at;

notify pgrst, 'reload schema';
