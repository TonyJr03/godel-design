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
      and column_name in ('bucket_id', 'name', 'metadata')
    group by table_schema, table_name
    having count(*) = 3
  ) then
    raise exception 'La tabla storage.objects no tiene las columnas esperadas: bucket_id, name y metadata.';
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

create or replace function private.is_allowed_public_request_file_type(
  file_name text,
  file_type text
)
returns boolean
language sql
immutable
as $$
  select coalesce(
    file_name is not null
      and btrim(file_name) <> ''
      and (
        (lower(file_name) ~ '\.pdf$' and file_type = 'application/pdf')
        or (
          lower(file_name) ~ '\.(jpg|jpeg)$'
          and file_type = 'image/jpeg'
        )
        or (lower(file_name) ~ '\.png$' and file_type = 'image/png')
        or (lower(file_name) ~ '\.webp$' and file_type = 'image/webp')
        or (
          lower(file_name) ~ '\.doc$'
          and file_type = 'application/msword'
        )
        or (
          lower(file_name) ~ '\.docx$'
          and file_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        or (
          lower(file_name) ~ '\.zip$'
          and file_type in ('application/zip', 'application/x-zip-compressed')
        )
      ),
    false
  );
$$;

comment on function private.is_allowed_public_request_file_type(text, text)
is 'Valida combinaciones permitidas de extensión y MIME para archivos públicos de solicitud.';

create or replace function private.is_allowed_public_request_file(
  file_name text,
  file_size bigint,
  file_type text
)
returns boolean
language sql
immutable
as $$
  select coalesce(
    file_size > 0
      and file_size <= 20971520
      and private.is_allowed_public_request_file_type(file_name, file_type),
    false
  );
$$;

comment on function private.is_allowed_public_request_file(text, bigint, text)
is 'Valida de forma compartida extensión, MIME y tamaño máximo de archivos públicos de solicitud.';

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
        and private.can_access_pedido(p.id)
        and private.storage_order_category(object_name) = case
          private.pedido_file_visibility_for_status(p.status)
          when 'interno_pedido'::public.archivo_visibility then 'internos'
          when 'avance'::public.archivo_visibility then 'avances'
          when 'final_entrega'::public.archivo_visibility then 'finales'
          else null
        end
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
  object_name text,
  object_metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_solicitud_id uuid;
  v_existing_objects integer;
begin
  v_solicitud_id := private.storage_request_id(object_name);

  if object_bucket_id <> 'godel-files'
    or v_solicitud_id is null
    or object_metadata is null
    or not private.is_allowed_public_request_file_type(
      split_part(object_name, '/', 4),
      object_metadata->>'mimetype'
    ) then
    return false;
  end if;

  perform 1
  from public.solicitudes as s
  where s.id = v_solicitud_id
  for update;

  if not found then
    return false;
  end if;

  select count(*)
  into v_existing_objects
  from storage.objects as o
  where o.bucket_id = object_bucket_id
    and o.name like format(
      'solicitudes/%s/originales/%%',
      v_solicitud_id
    );

  return v_existing_objects < 5;
end;
$$;

comment on function private.can_insert_public_request_storage_object(text, text, jsonb)
is 'Valida ruta, archivo y cupo secuencial de cinco objetos anónimos por solicitud, bloqueando la solicitud durante la evaluación.';

create or replace function private.can_insert_public_request_file_metadata(
  p_file_bucket text,
  p_file_path text,
  p_file_name text,
  p_file_pedido_id uuid,
  p_file_solicitud_id uuid,
  p_file_uploaded_by uuid,
  p_file_visibility public.archivo_visibility,
  p_file_size bigint,
  p_file_type text
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_existing_files integer;
begin
  if p_file_bucket <> 'godel-files'
    or p_file_pedido_id is not null
    or p_file_solicitud_id is null
    or p_file_uploaded_by is not null
    or p_file_visibility <> 'cliente_solicitud'::public.archivo_visibility
    or private.storage_request_id(p_file_path) <> p_file_solicitud_id
    or not private.is_allowed_public_request_file(
      p_file_name,
      p_file_size,
      p_file_type
    )
    or not private.is_allowed_public_request_file(
      split_part(p_file_path, '/', 4),
      p_file_size,
      p_file_type
    ) then
    return false;
  end if;

  perform 1
  from public.solicitudes as s
  where s.id = p_file_solicitud_id
  for update;

  if not found then
    return false;
  end if;

  if not exists (
    select 1
    from storage.objects as o
    where o.bucket_id = p_file_bucket
      and o.name = p_file_path
  ) then
    return false;
  end if;

  select count(*)
  into v_existing_files
  from public.archivos as a
  where a.solicitud_id = p_file_solicitud_id
    and a.visibility = 'cliente_solicitud'::public.archivo_visibility;

  return v_existing_files < 5
    and not exists (
      select 1
      from public.archivos as a
      where a.bucket = p_file_bucket
        and a.file_path = p_file_path
    );
end;
$$;

comment on function private.can_insert_public_request_file_metadata(
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  public.archivo_visibility,
  bigint,
  text
)
is 'Valida metadatos anónimos contra un objeto existente y limita a cinco archivos por solicitud con conteo serializado.';

revoke all on function private.storage_path_has_exact_parts(text, integer)
from public, anon, authenticated;
revoke all on function private.storage_order_id(text)
from public, anon, authenticated;
revoke all on function private.storage_order_category(text)
from public, anon, authenticated;
revoke all on function private.storage_request_id(text)
from public, anon, authenticated;
revoke all on function private.is_allowed_public_request_file_type(text, text)
from public, anon, authenticated;
revoke all on function private.is_allowed_public_request_file(text, bigint, text)
from public, anon, authenticated;
revoke all on function private.can_read_storage_object(text, text)
from public, anon, authenticated;
revoke all on function private.can_insert_storage_object(text, text)
from public, anon, authenticated;
revoke all on function private.can_manage_storage_object(text, text)
from public, anon, authenticated;
revoke all on function private.can_insert_public_request_storage_object(text, text, jsonb)
from public, anon, authenticated;
revoke all on function private.can_insert_public_request_file_metadata(
  text,
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
grant execute on function private.can_insert_public_request_storage_object(text, text, jsonb) to anon;
grant execute on function private.can_insert_public_request_file_metadata(
  text,
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
    file_name,
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
  private.can_insert_public_request_storage_object(bucket_id, name, metadata)
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
