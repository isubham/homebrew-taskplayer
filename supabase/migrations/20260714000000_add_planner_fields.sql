alter table public.lists
  add column if not exists availability_windows jsonb
  not null default '[]'::jsonb;

alter table public.tasks
  add column if not exists daily_windows jsonb
  not null default '[]'::jsonb;

alter table public.tasks
  add column if not exists min_session_min bigint;

alter table public.tasks
  add column if not exists max_session_min bigint;

notify pgrst, 'reload schema';
