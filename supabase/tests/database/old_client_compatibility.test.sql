begin;

select plan(3);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'compatibility@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.lists (
  id, user_id, name, emoji, color, ord, updated_at,
  availability_windows
)
values (
  'list-1',
  '00000000-0000-0000-0000-000000000001',
  'Work',
  '💼',
  '#123456',
  1,
  100,
  '[{"days":[1,2,3,4,5],"start":"09:00","end":"17:00"}]'
);

-- This is the column set sent by a client released before planner windows.
insert into public.lists (
  id, user_id, name, emoji, color, ord, updated_at
)
values (
  'list-1',
  '00000000-0000-0000-0000-000000000001',
  'Renamed by old client',
  '💼',
  '#123456',
  1,
  200
)
on conflict (id) do update set
  user_id = excluded.user_id,
  name = excluded.name,
  emoji = excluded.emoji,
  color = excluded.color,
  ord = excluded.ord,
  updated_at = excluded.updated_at;

select is(
  (select availability_windows from public.lists where id = 'list-1'),
  '[{"days":[1,2,3,4,5],"start":"09:00","end":"17:00"}]'::jsonb,
  'an old list update preserves newer availability windows'
);

insert into public.tasks (
  id, user_id, list_id, name, ord, updated_at,
  daily_windows, min_session_min, max_session_min
)
values (
  'task-1',
  '00000000-0000-0000-0000-000000000001',
  'list-1',
  'Plan report',
  1,
  100,
  '[{"days":[1],"start":"10:00","end":"11:00"}]',
  20,
  45
);

insert into public.planned_sessions (
  id, user_id, task_id, start, "end", updated_at
)
values (
  'plan-1',
  '00000000-0000-0000-0000-000000000001',
  'task-1',
  1000,
  2000,
  100
);

-- This is the column set sent by a client released before planner fields.
insert into public.tasks (
  id, user_id, list_id, name, depth, ord, est, done, descr,
  updated_at, deleted_at, album, impact_tier, impact_sign,
  deadline_at, cadence
)
values (
  'task-1',
  '00000000-0000-0000-0000-000000000001',
  'list-1',
  'Renamed task',
  'deep',
  1,
  60,
  null,
  null,
  200,
  null,
  null,
  null,
  1,
  null,
  null
)
on conflict (id) do update set
  user_id = excluded.user_id,
  list_id = excluded.list_id,
  name = excluded.name,
  depth = excluded.depth,
  ord = excluded.ord,
  est = excluded.est,
  done = excluded.done,
  descr = excluded.descr,
  updated_at = excluded.updated_at,
  deleted_at = excluded.deleted_at,
  album = excluded.album,
  impact_tier = excluded.impact_tier,
  impact_sign = excluded.impact_sign,
  deadline_at = excluded.deadline_at,
  cadence = excluded.cadence;

select results_eq(
  $$select daily_windows, min_session_min, max_session_min
    from public.tasks where id = 'task-1'$$,
  $$values (
    '[{"days":[1],"start":"10:00","end":"11:00"}]'::jsonb,
    20::bigint,
    45::bigint
  )$$,
  'an old task update preserves newer planner fields'
);

select results_eq(
  $$select task_id, start, "end" from public.planned_sessions where id = 'plan-1'$$,
  $$values ('task-1'::text, 1000::bigint, 2000::bigint)$$,
  'an old task update preserves its separate planned sessions'
);

select * from finish();

rollback;
