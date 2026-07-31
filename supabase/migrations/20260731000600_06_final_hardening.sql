-- Baseline final 06 - Final hardening and assertions.
-- ACTIVO: migracion consolidada para reconstruccion limpia del proyecto.
-- Closes grants and verifies the final contract created by 01-05 without business functionality.

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
  public.tipos_servicio,
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

grant select on table public.tipos_servicio to anon;
grant insert on table public.solicitudes to anon;
grant insert on table public.archivos to anon;
grant select on table public.perfiles to authenticated;
grant update (full_name, phone, avatar_url, role, is_active)
on table public.perfiles to authenticated;
grant select, insert, update on table public.tipos_servicio to authenticated;
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

grant usage on schema storage to anon, authenticated;
grant insert on table storage.objects to anon;
grant select, insert, update, delete on table storage.objects to authenticated;

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
grant execute on function private.pedido_file_visibility_for_status(public.pedido_estado) to authenticated;
grant execute on function private.pedido_file_path_matches(text, uuid, public.archivo_visibility) to authenticated;
grant execute on function private.can_insert_pedido_file_metadata(text, text, uuid, uuid, uuid, public.archivo_visibility, text, bigint, text) to authenticated;
grant execute on function private.can_read_storage_object(text, text) to authenticated;
grant execute on function private.can_insert_storage_object(text, text) to authenticated;
grant execute on function private.can_manage_storage_object(text, text) to authenticated;
grant execute on function private.can_insert_public_request_storage_object(text, text, jsonb) to anon;
grant execute on function private.can_insert_public_request_file_metadata(text, text, text, uuid, uuid, uuid, public.archivo_visibility, bigint, text) to anon;
grant execute on function private.provision_internal_profile_from_auth_user() to supabase_auth_admin;

revoke all on function public.complete_initial_password_change(uuid) from public, anon, authenticated;
grant execute on function public.complete_initial_password_change(uuid) to service_role;

do $$
declare
  v_table text;
  v_signature text;
  v_missing text[] := array[]::text[];
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'service_type') then
    raise exception 'Hardening failed: legacy solicitudes.service_type still exists.';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'perfiles' and policyname = 'perfiles_insert_admin') then
    raise exception 'Hardening failed: legacy perfiles_insert_admin still exists.';
  end if;

  if to_regprocedure('private.generate_public_reference()') is not null then
    raise exception 'Hardening failed: unused private.generate_public_reference() still exists.';
  end if;

  if to_regprocedure('private.generate_public_reference_candidate()') is null then
    raise exception 'Hardening failed: missing private.generate_public_reference_candidate().';
  end if;

  if pg_get_functiondef('private.generate_public_reference_candidate()'::regprocedure) ilike ('%v_index ' || 'integer%') then
    raise exception 'Hardening failed: explicit loop-index declaration remains in reference candidate.';
  end if;

  foreach v_table in array array[
    'perfiles', 'clientes', 'tipos_servicio', 'solicitudes', 'pedidos',
    'pedido_contadores', 'pedido_trabajadores', 'pedido_tareas', 'archivos',
    'pedido_comentarios', 'pedido_historial', 'solicitud_comentarios',
    'solicitud_historial', 'trabajo_plantillas', 'trabajo_plantilla_tareas',
    'pedido_pagos'
  ] loop
    if not exists (
      select 1
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relrowsecurity
    ) then
      raise exception 'Hardening failed: RLS is not enabled on public.%', v_table;
    end if;
  end loop;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'solicitudes' and column_name = 'service_id' and is_nullable = 'NO') then
    raise exception 'Hardening failed: solicitudes.service_id is not NOT NULL.';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pedidos' and column_name = 'service_id' and is_nullable = 'NO') then
    raise exception 'Hardening failed: pedidos.service_id is not NOT NULL.';
  end if;

  if (select count(*) from public.tipos_servicio) <> 2 then
    raise exception 'Hardening failed: expected exactly two initial services.';
  end if;

  if not exists (
    select 1
    from public.tipos_servicio as ts
    where ts.name = 'Impresión'
      and ts.description = 'Impresión de documentos y materiales proporcionados por el cliente.'
      and ts.workflow_type = 'impresion'::public.workflow_type
      and ts.is_publicly_available = true
  ) then
    raise exception 'Hardening failed: missing initial print service.';
  end if;

  if not exists (
    select 1
    from public.tipos_servicio as ts
    where ts.name = 'Otro'
      and ts.description = 'Otros encargos personalizados no incluidos en los servicios configurados.'
      and ts.workflow_type = 'encargo'::public.workflow_type
      and ts.is_publicly_available = true
  ) then
    raise exception 'Hardening failed: missing initial generic service.';
  end if;

  if exists (
    select 1
    from public.tipos_servicio as ts
    where ts.name in ('Diseño gráfico', 'Personalización', 'Rotulación')
  ) then
    raise exception 'Hardening failed: removed configurable services were inserted as initial data.';
  end if;

  if (select count(*) from public.tipos_servicio where workflow_type = 'impresion'::public.workflow_type) <> 1 then
    raise exception 'Hardening failed: expected exactly one print service.';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'tipos_servicio'
      and indexname = 'tipos_servicio_single_print_service'
  ) then
    raise exception 'Hardening failed: missing tipos_servicio_single_print_service.';
  end if;

  foreach v_signature in array array[
    'public.actualizar_estado_solicitud(uuid, public.solicitud_estado)',
    'public.crear_cliente_desde_solicitud(uuid)',
    'public.convertir_solicitud_a_pedido(uuid, uuid, text, text, public.pedido_prioridad, date, numeric)',
    'public.crear_pedido_manual(uuid, uuid, text, text, public.pedido_prioridad, date, numeric)',
    'public.actualizar_estado_pedido(uuid, public.pedido_estado)',
    'public.actualizar_datos_pedido(uuid, uuid, text, text, public.pedido_prioridad, date, numeric)',
    'public.actualizar_pago_pedido(uuid, numeric, numeric)',
    'public.aplicar_plantilla_tareas_pedido(uuid, uuid)',
    'public.listar_pedido_comentarios(uuid)',
    'public.listar_pedido_historial(uuid)',
    'public.listar_solicitud_comentarios(uuid)',
    'public.listar_solicitud_historial(uuid)',
    'public.consultar_estado_publico(text)',
    'public.begin_internal_user_creation_attempt(public.app_role)',
    'public.complete_internal_user_creation_attempt(uuid, text, text, uuid)',
    'public.complete_initial_password_change(uuid)',
    'public.begin_internal_user_password_reset(uuid, uuid)',
    'public.get_internal_user_password_reset_state(uuid)',
    'public.complete_internal_user_password_reset(uuid, text, text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      v_missing := array_append(v_missing, v_signature);
    end if;
  end loop;

  if array_length(v_missing, 1) is not null then
    raise exception 'Hardening failed: missing final RPC signatures: %', array_to_string(v_missing, ', ');
  end if;

  if to_regprocedure('private.pedido_file_path_matches(text, uuid, public.archivo_visibility)') is null then
    raise exception 'Hardening failed: missing final pedido_file_path_matches signature.';
  end if;

  if to_regprocedure('private.can_insert_pedido_file_metadata(text, text, uuid, uuid, uuid, public.archivo_visibility, text, bigint, text)') is null then
    raise exception 'Hardening failed: missing final can_insert_pedido_file_metadata signature.';
  end if;

  foreach v_signature in array array[
    'public.convertir_solicitud_a_pedido(uuid, text, text, public.pedido_prioridad, date, numeric)',
    'public.crear_pedido_manual(public.workflow_type, uuid, text, text, public.pedido_prioridad, date, numeric)',
    'public.actualizar_datos_pedido(uuid, text, text, public.pedido_prioridad, date, numeric)',
    'public.begin_internal_user_password_reset(uuid)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      raise exception 'Hardening failed: legacy RPC signature still exists: %', v_signature;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.perfiles', 'INSERT') then
    raise exception 'Hardening failed: authenticated has legacy direct profile creation privilege.';
  end if;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = 'perfiles'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
  ) then
    raise exception 'Hardening failed: authenticated has full UPDATE on perfiles.';
  end if;

  if has_function_privilege('authenticated', 'public.complete_initial_password_change(uuid)', 'EXECUTE') then
    raise exception 'Hardening failed: authenticated can execute complete_initial_password_change.';
  end if;

  if not has_function_privilege('service_role', 'public.complete_initial_password_change(uuid)', 'EXECUTE') then
    raise exception 'Hardening failed: service_role cannot execute complete_initial_password_change.';
  end if;

  if not has_function_privilege('supabase_auth_admin', 'private.provision_internal_profile_from_auth_user()', 'EXECUTE') then
    raise exception 'Hardening failed: supabase_auth_admin cannot execute provisioning function.';
  end if;

  if exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg like 'search_path=%'
      )
  ) then
    raise exception 'Hardening failed: SECURITY DEFINER function without fixed search_path.';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'godel-files' and name = 'godel-files' and public = false) then
    raise exception 'Hardening failed: godel-files bucket is missing or public.';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and roles::text ilike '%anon%' and cmd in ('SELECT', 'UPDATE', 'DELETE')) then
    raise exception 'Hardening failed: storage.objects exposes anon read or mutation policy.';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created_provision_internal_profile' and tgrelid = 'auth.users'::regclass and not tgisinternal) then
    raise exception 'Hardening failed: missing Auth insert provisioning trigger.';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_app_metadata_provision_internal_profile' and tgrelid = 'auth.users'::regclass and not tgisinternal) then
    raise exception 'Hardening failed: missing Auth metadata provisioning trigger.';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'private'
      and table_name in ('internal_user_creation_audit', 'internal_user_password_reset_audit')
      and grantee in ('anon', 'authenticated', 'service_role', 'supabase_auth_admin')
  ) then
    raise exception 'Hardening failed: private Auth audit tables have direct app grants.';
  end if;
end;
$$;
