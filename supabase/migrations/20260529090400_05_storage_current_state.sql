-- Consolidated current Storage state.
-- Storage is kept as a separate layer so it can be reviewed/refactored later
-- without mixing it with the relational schema and RLS consolidation.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise exception 'La tabla storage.buckets no existe en este entorno de Supabase.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name in ('id', 'name', 'public')
    group by table_schema, table_name
    having count(*) = 3
  ) then
    raise exception 'La tabla storage.buckets no tiene las columnas esperadas: id, name y public.';
  end if;

  if to_regclass('storage.objects') is null then
    raise exception 'La tabla storage.objects no existe en este entorno de Supabase.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'objects'
      and column_name in ('bucket_id', 'name')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'La tabla storage.objects no tiene las columnas esperadas: bucket_id y name.';
  end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('godel-files', 'godel-files', false)
on conflict (id) do update
set
  name = excluded.name,
  public = false;

create or replace function private.storage_path_has_exact_parts(
  object_name text,
  expected_parts integer
)
returns boolean
language sql
immutable
as $$
  select object_name is not null
    and object_name !~ '/{2,}'
    and array_length(string_to_array(object_name, '/'), 1) = expected_parts
    and not exists (
      select 1
      from unnest(string_to_array(object_name, '/')) as part(value)
      where btrim(part.value) = ''
    );
$$;

comment on function private.storage_path_has_exact_parts(text, integer)
is 'Valida que una ruta de Storage tenga la cantidad exacta de segmentos esperada y sin segmentos vacíos.';

create or replace function private.storage_order_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when private.storage_path_has_exact_parts(object_name, 4)
      and split_part(object_name, '/', 1) = 'pedidos'
      and split_part(object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and split_part(object_name, '/', 3) in ('internos', 'avances', 'finales')
    then split_part(object_name, '/', 2)::uuid
    else null
  end;
$$;

comment on function private.storage_order_id(text)
is 'Extrae el pedido_id desde rutas privadas con formato pedidos/{pedido_id}/{categoria}/{archivo}.';

create or replace function private.storage_order_category(object_name text)
returns text
language sql
immutable
as $$
  select case
    when private.storage_order_id(object_name) is not null
    then split_part(object_name, '/', 3)
    else null
  end;
$$;

comment on function private.storage_order_category(text)
is 'Extrae la categoría de una ruta privada de pedido en Storage.';

create or replace function private.storage_request_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when private.storage_path_has_exact_parts(object_name, 4)
      and split_part(object_name, '/', 1) = 'solicitudes'
      and split_part(object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and split_part(object_name, '/', 3) = 'originales'
    then split_part(object_name, '/', 2)::uuid
    else null
  end;
$$;

comment on function private.storage_request_id(text)
is 'Extrae el solicitud_id desde rutas privadas con formato solicitudes/{solicitud_id}/originales/{archivo}.';

create or replace function private.can_read_storage_object(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
set search_path = public, private
stable
as $$
  select case
    when object_bucket_id <> 'godel-files'
      or auth.uid() is null
      or not private.current_user_is_active()
    then false
    when private.storage_order_id(object_name) is not null then exists (
      select 1
      from public.pedidos as p
      where p.id = private.storage_order_id(object_name)
        and private.can_access_pedido(p.id)
    )
    when private.storage_request_id(object_name) is not null then
      (
        private.is_admin_or_supervisor()
        and exists (
          select 1
          from public.solicitudes as s
          where s.id = private.storage_request_id(object_name)
        )
      )
      or exists (
        select 1
        from public.archivos as a
        where a.bucket = object_bucket_id
          and a.file_path = object_name
          and a.solicitud_id = private.storage_request_id(object_name)
          and a.pedido_id is not null
          and a.visibility = 'cliente_solicitud'::public.archivo_visibility
          and private.can_access_pedido(a.pedido_id)
      )
    else false
  end;
$$;

comment on function private.can_read_storage_object(text, text)
is 'Valida lectura/listado de objetos del bucket privado godel-files según ruta, pedido, solicitud y archivos heredados por metadatos.';

create or replace function private.can_insert_storage_object(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
set search_path = public, private
stable
as $$
  select case
    when object_bucket_id <> 'godel-files'
      or auth.uid() is null
      or not private.current_user_is_active()
    then false
    when private.storage_order_id(object_name) is not null then exists (
      select 1
      from public.pedidos as p
      where p.id = private.storage_order_id(object_name)
        and (
          private.is_admin_or_supervisor()
          or (
            private.is_assigned_to_pedido(p.id)
            and private.storage_order_category(object_name) in ('avances', 'finales')
          )
        )
    )
    when private.storage_request_id(object_name) is not null then
      private.is_admin_or_supervisor()
      and exists (
        select 1
        from public.solicitudes as s
        where s.id = private.storage_request_id(object_name)
      )
    else false
  end;
$$;

comment on function private.can_insert_storage_object(text, text)
is 'Valida subidas internas al bucket privado; no habilita subidas públicas anónimas.';

create or replace function private.can_manage_storage_object(
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
    and auth.uid() is not null
    and private.current_user_is_active()
    and private.is_admin_or_supervisor()
    and (
      exists (
        select 1
        from public.pedidos as p
        where p.id = private.storage_order_id(object_name)
      )
      or exists (
        select 1
        from public.solicitudes as s
        where s.id = private.storage_request_id(object_name)
      )
    );
$$;

comment on function private.can_manage_storage_object(text, text)
is 'Limita actualización y eliminación de objetos privados a admin o supervisor sobre rutas válidas.';

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

revoke all on function private.storage_path_has_exact_parts(text, integer)
from public, anon, authenticated;
revoke all on function private.storage_order_id(text)
from public, anon, authenticated;
revoke all on function private.storage_order_category(text)
from public, anon, authenticated;
revoke all on function private.storage_request_id(text)
from public, anon, authenticated;
revoke all on function private.can_read_storage_object(text, text)
from public, anon, authenticated;
revoke all on function private.can_insert_storage_object(text, text)
from public, anon, authenticated;
revoke all on function private.can_manage_storage_object(text, text)
from public, anon, authenticated;
revoke all on function private.can_insert_public_request_storage_object(text, text)
from public, anon, authenticated;
revoke all on function private.can_insert_public_request_file_metadata(
  text,
  text,
  uuid,
  uuid,
  uuid,
  public.archivo_visibility,
  bigint,
  text
)
from public, anon, authenticated;

grant execute on function private.can_read_storage_object(text, text) to authenticated;
grant execute on function private.can_insert_storage_object(text, text) to authenticated;
grant execute on function private.can_manage_storage_object(text, text) to authenticated;
grant execute on function private.can_insert_public_request_storage_object(text, text) to anon;
grant execute on function private.can_insert_public_request_file_metadata(
  text,
  text,
  uuid,
  uuid,
  uuid,
  public.archivo_visibility,
  bigint,
  text
) to anon;

grant insert on table public.archivos to anon;

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

create policy godel_files_select_accessible
on storage.objects
for select
to authenticated
using (
  private.can_read_storage_object(bucket_id, name)
);

create policy godel_files_insert_accessible
on storage.objects
for insert
to authenticated
with check (
  private.can_insert_storage_object(bucket_id, name)
);

create policy godel_files_update_manager
on storage.objects
for update
to authenticated
using (
  private.can_manage_storage_object(bucket_id, name)
)
with check (
  private.can_manage_storage_object(bucket_id, name)
);

create policy godel_files_delete_manager
on storage.objects
for delete
to authenticated
using (
  private.can_manage_storage_object(bucket_id, name)
);

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
