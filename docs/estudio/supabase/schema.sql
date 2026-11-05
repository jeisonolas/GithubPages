-- Estudio Multi-Traducción: miembros y notas compartidas.
-- Pegar entero en Supabase → SQL Editor → Run. Se puede volver a ejecutar sin romper nada.

-- ---------- Miembros ----------
create table if not exists public.members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  display_name text not null,
  color        text not null default '#3d5a99'
);

-- ¿El usuario actual es uno de los miembros? (security definer para que RLS no se llame a sí misma)
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

alter table public.members enable row level security;

drop policy if exists "members: leer entre miembros" on public.members;
create policy "members: leer entre miembros" on public.members
  for select to authenticated using (public.is_member());

drop policy if exists "members: editar mi perfil" on public.members;
create policy "members: editar mi perfil" on public.members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Notas ----------
create table if not exists public.notes (
  id          uuid primary key,                       -- lo genera la app (funciona sin conexión)
  author_id   uuid not null default auth.uid() references public.members (user_id) on delete cascade,
  book        smallint not null,
  chapter     smallint not null,
  verse       smallint,                               -- null = reflexión del capítulo
  version     text,                                   -- versión de la que se citó
  quote       text,                                   -- frase seleccionada
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,                            -- borrado suave, para que se propague
  synced_at   timestamptz not null default now()      -- hora del servidor: cursor de sincronización
);

create index if not exists notes_chapter_idx on public.notes (book, chapter);
create index if not exists notes_synced_idx on public.notes (synced_at);

-- synced_at lo pone siempre el servidor (no depende del reloj de cada dispositivo).
create or replace function public.notes_touch_synced_at()
returns trigger
language plpgsql
as $$
begin
  new.synced_at := now();
  return new;
end $$;

drop trigger if exists notes_touch_synced_at on public.notes;
create trigger notes_touch_synced_at
  before insert or update on public.notes
  for each row execute function public.notes_touch_synced_at();

alter table public.notes enable row level security;

drop policy if exists "notes: leer entre miembros" on public.notes;
create policy "notes: leer entre miembros" on public.notes
  for select to authenticated using (public.is_member());

drop policy if exists "notes: crear las mías" on public.notes;
create policy "notes: crear las mías" on public.notes
  for insert to authenticated with check (author_id = auth.uid() and public.is_member());

drop policy if exists "notes: editar las mías" on public.notes;
create policy "notes: editar las mías" on public.notes
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

-- Sin política de delete: se borra con deleted_at.

-- ---------- Tiempo real ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;
end $$;
