-- Permite subida anónima controlada de archivos de solicitudes públicas.
-- No abre lectura, listado, actualización ni eliminación pública.

create or replace function private.can_insert_public_request_storage_object(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
set search_path = public, private
stable
as $$
  select object_bucket_id = 'godel-files'
    and private.storage_request_id(object_name) is not null
    and exists (
      select 1
      from public.solicitudes as s
      where s.id = private.storage_request_id(object_name)
    );
$$;

comment on function private.can_insert_public_request_storage_object(text, text)
is 'Valida subidas anónimas controladas al bucket privado para archivos originales de solicitudes públicas.';

create or replace function private.can_insert_public_request_file_metadata(
  file_bucket text,
  file_path text,
  file_pedido_id uuid,
  file_solicitud_id uuid,
  file_uploaded_by uuid,
  file_visibility public.archivo_visibility,
  file_size bigint,
  file_type text
)
returns boolean
language sql
security definer
set search_path = public, private
stable
as $$
  select file_bucket = 'godel-files'
    and file_pedido_id is null
    and file_solicitud_id is not null
    and file_uploaded_by is null
    and file_visibility = 'cliente_solicitud'::public.archivo_visibility
    and private.storage_request_id(file_path) = file_solicitud_id
    and file_size > 0
    and file_size <= 20971520
    and file_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/x-zip-compressed'
    )
    and exists (
      select 1
      from public.solicitudes as s
      where s.id = file_solicitud_id
    );
$$;

comment on function private.can_insert_public_request_file_metadata(
  text,
  text,
  uuid,
  uuid,
  uuid,
  public.archivo_visibility,
  bigint,
  text
)
is 'Valida metadatos anónimos para archivos originales de solicitudes públicas.';

grant execute on function private.can_insert_public_request_storage_object(text, text) to anon, authenticated;
grant execute on function private.can_insert_public_request_file_metadata(
  text,
  text,
  uuid,
  uuid,
  uuid,
  public.archivo_visibility,
  bigint,
  text
) to anon, authenticated;

grant insert on table public.archivos to anon;

drop policy if exists archivos_insert_public_request_files on public.archivos;
create policy archivos_insert_public_request_files
on public.archivos
for insert
to anon
with check (
  private.can_insert_public_request_file_metadata(
    bucket,
    file_path,
    pedido_id,
    solicitud_id,
    uploaded_by,
    visibility,
    file_size,
    file_type
  )
);

drop policy if exists godel_files_insert_public_request_files on storage.objects;
create policy godel_files_insert_public_request_files
on storage.objects
for insert
to anon
with check (
  private.can_insert_public_request_storage_object(bucket_id, name)
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) then
    update storage.buckets
    set file_size_limit = 20971520
    where id = 'godel-files';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'allowed_mime_types'
  ) then
    update storage.buckets
    set allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/x-zip-compressed'
    ]
    where id = 'godel-files';
  end if;
end;
$$;
