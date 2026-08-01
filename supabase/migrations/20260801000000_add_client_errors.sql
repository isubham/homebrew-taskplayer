create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  source text not null,
  message text not null,
  stack text,
  created_at timestamptz not null default now()
);

alter table public.client_errors enable row level security;

create policy "Enable insert for everyone" on public.client_errors
  for insert
  with check (true);
