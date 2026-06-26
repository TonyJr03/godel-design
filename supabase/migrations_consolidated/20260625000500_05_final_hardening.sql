-- Beta 1.6 - Final hardening
-- Esta migracion cierra el estado final de seguridad del set consolidado.
-- No crea logica de negocio principal.
-- No reemplaza RLS ni RPCs.
-- Solo fija revokes, grants, comments y checks defensivos.

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

grant usage on schema public to anon, authenticated;
grant usage on schema private to authenticated;
grant usage on schema private to anon;

comment on schema private is
  'Schema interno. anon conserva USAGE solo para evaluacion de helpers especificos de Storage publico; no recibe execute amplio.';

revoke all on table
  public.perfiles,
  public.clientes,
  public.solicitudes,
  public.pedidos,
  public.pedido_contadores,
  public.pedido_trabajadores,
  public.pedido_tareas,
  public.archivos,
  public.pedido_comentarios,
  public.pedido_historial,
  public.solicitud_comentarios,
  public.solicitud_historial,
  public.trabajo_plantillas,
  public.trabajo_plantilla_tareas,
  public.pedido_pagos
from public, anon, authenticated;

revoke all on type public.app_role from public, anon;
revoke all on type public.workflow_type from public, anon;
revoke all on type public.solicitud_estado from public, anon;
revoke all on type public.pedido_estado from public, anon;
revoke all on type public.pedido_pago_estado from public, anon;
revoke all on type public.pedido_prioridad from public, anon;
revoke all on type public.pedido_tarea_tipo from public, anon;
revoke all on type public.archivo_visibility from public, anon;
revoke all on type public.pedido_historial_action from public, anon;
revoke all on type public.solicitud_historial_action from public, anon;

grant usage on type public.workflow_type to anon;
grant usage on type public.solicitud_estado to anon;
grant usage on type public.archivo_visibility to anon;

grant usage on type
  public.app_role,
  public.workflow_type,
  public.solicitud_estado,
  public.pedido_estado,
  public.pedido_pago_estado,
  public.pedido_prioridad,
  public.pedido_tarea_tipo,
  public.archivo_visibility,
  public.pedido_historial_action,
  public.solicitud_historial_action
to authenticated;

grant insert on table public.solicitudes to anon;
grant insert on table public.archivos to anon;

grant select, insert, update on table public.perfiles to authenticated;
grant select, insert, update on table public.clientes to authenticated;
grant select, insert, update, delete on table public.solicitudes to authenticated;
grant select, insert, update, delete on table public.pedidos to authenticated;
grant select, insert, update, delete on table public.pedido_trabajadores to authenticated;
grant select, insert, update, delete on table public.pedido_tareas to authenticated;
grant select, insert, update, delete on table public.archivos to authenticated;
grant select, insert on table public.pedido_comentarios to authenticated;
grant select on table public.pedido_historial to authenticated;
grant select, insert on table public.solicitud_comentarios to authenticated;
grant select on table public.solicitud_historial to authenticated;
grant select, insert, update, delete on table public.trabajo_plantillas to authenticated;
grant select, insert, update, delete on table public.trabajo_plantilla_tareas to authenticated;
grant select, insert, update, delete on table public.pedido_pagos to authenticated;

revoke all on schema storage from public;
revoke all on schema storage from anon;
revoke all on schema storage from authenticated;

grant usage on schema storage to anon, authenticated;

revoke all on table storage.objects from public, anon, authenticated;

grant insert on table storage.objects to anon;
grant select, insert, update, delete on table storage.objects to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;

revoke all on function public.actualizar_estado_solicitud(uuid, public.solicitud_estado)
from public, anon, authenticated;
grant execute on function public.actualizar_estado_solicitud(uuid, public.solicitud_estado)
to authenticated;

revoke all on function public.crear_cliente_desde_solicitud(uuid)
from public, anon, authenticated;
grant execute on function public.crear_cliente_desde_solicitud(uuid)
to authenticated;

revoke all on function public.convertir_solicitud_a_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
)
from public, anon, authenticated;
grant execute on function public.convertir_solicitud_a_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
)
to authenticated;

revoke all on function public.crear_pedido_manual(
  public.workflow_type,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
)
from public, anon, authenticated;
grant execute on function public.crear_pedido_manual(
  public.workflow_type,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
)
to authenticated;

revoke all on function public.actualizar_estado_pedido(uuid, public.pedido_estado)
from public, anon, authenticated;
grant execute on function public.actualizar_estado_pedido(uuid, public.pedido_estado)
to authenticated;

revoke all on function public.aplicar_plantilla_tareas_pedido(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.aplicar_plantilla_tareas_pedido(uuid, uuid)
to authenticated;

revoke all on function public.actualizar_pago_pedido(uuid, numeric, numeric)
from public, anon, authenticated;
grant execute on function public.actualizar_pago_pedido(uuid, numeric, numeric)
to authenticated;

revoke all on function public.listar_pedido_comentarios(uuid)
from public, anon, authenticated;
grant execute on function public.listar_pedido_comentarios(uuid)
to authenticated;

revoke all on function public.listar_pedido_historial(uuid)
from public, anon, authenticated;
grant execute on function public.listar_pedido_historial(uuid)
to authenticated;

revoke all on function public.listar_solicitud_comentarios(uuid)
from public, anon, authenticated;
grant execute on function public.listar_solicitud_comentarios(uuid)
to authenticated;

revoke all on function public.listar_solicitud_historial(uuid)
from public, anon, authenticated;
grant execute on function public.listar_solicitud_historial(uuid)
to authenticated;

revoke all on function public.consultar_estado_publico(text)
from public, anon, authenticated;
grant execute on function public.consultar_estado_publico(text)
to anon, authenticated;

comment on function public.consultar_estado_publico(text) is
  'Consulta publica minima por referencia publica; conserva datos internos fuera de la respuesta.';
comment on function public.convertir_solicitud_a_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) is
  'Convierte solicitudes a pedidos bajo control de roles internos y validaciones de estado.';
comment on function public.actualizar_estado_pedido(uuid, public.pedido_estado) is
  'Actualiza estado de pedido con validaciones de flujo, asignacion y pago.';
comment on function public.crear_pedido_manual(
  public.workflow_type,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) is
  'Crea pedidos internos; requiere rol autenticado autorizado por la funcion.';
comment on function public.actualizar_pago_pedido(uuid, numeric, numeric) is
  'Registra cambios de pago de pedido y mantiene el estado derivado de pago.';

revoke all on all functions in schema private from public, anon, authenticated;

grant execute on function private.current_user_role() to authenticated;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_supervisor() to authenticated;
grant execute on function private.is_admin_or_supervisor() to authenticated;
grant execute on function private.is_assigned_to_pedido(uuid) to authenticated;
grant execute on function private.can_access_pedido(uuid) to authenticated;
grant execute on function private.solicitud_has_accessible_pedido(uuid) to authenticated;
grant execute on function private.can_access_solicitud(uuid) to authenticated;
grant execute on function private.can_manage_pedido_tasks(uuid) to authenticated;
grant execute on function private.pedido_file_visibility_for_status(public.pedido_estado)
to authenticated;
grant execute on function private.pedido_file_path_matches(
  text,
  uuid,
  public.archivo_visibility
)
to authenticated;
grant execute on function private.can_insert_pedido_file_metadata(
  text,
  text,
  uuid,
  uuid,
  uuid,
  public.archivo_visibility,
  text,
  bigint,
  text
)
to authenticated;
grant execute on function private.can_read_storage_object(text, text) to authenticated;
grant execute on function private.can_insert_storage_object(text, text) to authenticated;
grant execute on function private.can_manage_storage_object(text, text) to authenticated;

grant execute on function private.can_insert_public_request_storage_object(text, text, jsonb)
to anon;
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
)
to anon;

comment on function private.can_insert_public_request_storage_object(text, text, jsonb) is
  'Valida subida anonima de objetos para solicitudes publicas en el bucket privado oficial.';
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
) is
  'Valida metadata anonima de archivos publicos contra objeto, bucket y solicitud esperados.';

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'public.perfiles',
    'public.clientes',
    'public.pedidos',
    'public.pedido_pagos',
    'public.archivos',
    'public.pedido_historial',
    'public.solicitud_historial'
  ]
  loop
    if has_table_privilege('anon', v_table, 'SELECT') then
      raise exception 'Hardening failed: anon has SELECT on %.', v_table;
    end if;
  end loop;
end
$$;

do $$
declare
  v_table text;
  v_privilege text;
begin
  foreach v_table in array array[
    'public.perfiles',
    'public.clientes',
    'public.solicitudes',
    'public.pedidos',
    'public.pedido_contadores',
    'public.pedido_trabajadores',
    'public.pedido_tareas',
    'public.archivos',
    'public.pedido_comentarios',
    'public.pedido_historial',
    'public.solicitud_comentarios',
    'public.solicitud_historial',
    'public.trabajo_plantillas',
    'public.trabajo_plantilla_tareas',
    'public.pedido_pagos'
  ]
  loop
    foreach v_privilege in array array['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    loop
      if has_table_privilege('anon', v_table, v_privilege) then
        raise exception 'Hardening failed: anon has % on %.', v_privilege, v_table;
      end if;
    end loop;
  end loop;
end
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'public.actualizar_estado_solicitud(uuid, public.solicitud_estado)',
    'public.crear_cliente_desde_solicitud(uuid)',
    'public.convertir_solicitud_a_pedido(uuid, text, text, public.pedido_prioridad, date, numeric)',
    'public.crear_pedido_manual(public.workflow_type, uuid, text, text, public.pedido_prioridad, date, numeric)',
    'public.actualizar_estado_pedido(uuid, public.pedido_estado)',
    'public.aplicar_plantilla_tareas_pedido(uuid, uuid)',
    'public.actualizar_pago_pedido(uuid, numeric, numeric)',
    'public.listar_pedido_comentarios(uuid)',
    'public.listar_pedido_historial(uuid)',
    'public.listar_solicitud_comentarios(uuid)',
    'public.listar_solicitud_historial(uuid)'
  ]
  loop
    if has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'Hardening failed: anon can execute internal RPC %.', v_function;
    end if;
  end loop;

  if not has_function_privilege('anon', 'public.consultar_estado_publico(text)', 'EXECUTE') then
    raise exception 'Hardening failed: anon cannot execute public tracking RPC.';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_policies as p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.cmd in ('SELECT', 'UPDATE', 'DELETE')
      and exists (
        select 1
        from unnest(p.roles) as policy_role(role_name)
        where policy_role.role_name in ('anon', 'public')
      )
  ) then
    raise exception 'Hardening failed: storage.objects has anonymous read or mutation policy.';
  end if;

  if not exists (
    select 1
    from pg_class as cls
    join pg_namespace as nsp
      on nsp.oid = cls.relnamespace
    where nsp.nspname = 'storage'
      and cls.relname = 'objects'
      and cls.relrowsecurity
  ) then
    raise exception 'Hardening failed: storage.objects RLS is not enabled.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from storage.buckets as b
    where b.id = 'godel-files'
      and b.name = 'godel-files'
      and b.public is false
  ) then
    raise exception 'Hardening failed: godel-files bucket is missing or not private.';
  end if;
end
$$;

do $$
declare
  v_privilege text;
begin
  foreach v_privilege in array array[
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER'
  ]
  loop
    if has_table_privilege('anon', 'public.pedido_pagos', v_privilege) then
      raise exception 'Hardening failed: anon has % on public.pedido_pagos.', v_privilege;
    end if;
  end loop;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint as c
    join pg_class as cls
      on cls.oid = c.conrelid
    join pg_namespace as nsp
      on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'archivos'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%godel-files%'
  ) then
    raise exception 'Hardening failed: public.archivos.bucket is not constrained to godel-files.';
  end if;
end
$$;
