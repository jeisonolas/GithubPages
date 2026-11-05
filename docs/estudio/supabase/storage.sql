-- Copia privada de los textos: bucket "biblia" que solo pueden leer los miembros.
-- Requiere schema.sql (función is_member). Pegar en SQL Editor → Run. Se puede repetir.

insert into storage.buckets (id, name, public)
values ('biblia', 'biblia', false)
on conflict (id) do update set public = false;

drop policy if exists "biblia: leer miembros" on storage.objects;
create policy "biblia: leer miembros" on storage.objects
  for select to authenticated
  using (bucket_id = 'biblia' and public.is_member());

-- Sin políticas de escritura: los archivos se suben desde el dashboard (Storage → biblia → Upload).
