-- Hereda archivos de solicitud al pedido generado sin mover objetos físicos.
-- También permite lectura controlada de objetos bajo solicitudes cuando sus
-- metadatos ya están asociados a un pedido accesible para el usuario.

update public.archivos as a
set pedido_id = s.converted_order_id
from public.solicitudes as s
where a.solicitud_id = s.id
  and s.converted_order_id is not null
  and a.pedido_id is null
  and a.visibility = 'cliente_solicitud'::public.archivo_visibility;

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
        and private.can_access_order(p.id)
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
          and private.can_access_order(a.pedido_id)
      )
    else false
  end;
$$;

comment on function private.can_read_storage_object(text, text)
is 'Valida lectura/listado de objetos del bucket privado godel-files según ruta, pedido, solicitud y archivos heredados por metadatos.';
