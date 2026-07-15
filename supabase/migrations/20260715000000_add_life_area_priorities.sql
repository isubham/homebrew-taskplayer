create table if not exists public.life_area_priorities (
  user_id uuid not null references auth.users(id) on delete cascade,
  area_key text not null,
  priority_rank bigint not null check (priority_rank > 0),
  updated_at bigint not null default 0,
  primary key (user_id, area_key)
);

alter table public.life_area_priorities enable row level security;

drop policy if exists "own rows" on public.life_area_priorities;
create policy "own rows" on public.life_area_priorities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists life_area_priorities_lww on public.life_area_priorities;
create trigger life_area_priorities_lww
  before update on public.life_area_priorities
  for each row execute function public.lww_guard();

notify pgrst, 'reload schema';
