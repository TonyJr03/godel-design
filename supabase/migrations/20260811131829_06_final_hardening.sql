-- Baseline final 06 - Final hardening and assertions.
-- Verifies the final security contract after migrations 01-05.

-- A. Final schema, enum and table privileges.
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
grant select on table public.perfiles to authenticated;
grant update (full_name, phone, avatar_url, role, is_active)
on table public.perfiles to authenticated;
grant select, insert, update on table public.tipos_servicio to authenticated;
grant select, insert, update on table public.clientes to authenticated;
grant select, insert, update, delete on table public.solicitudes to authenticated;
grant select, insert, update, delete on table public.pedidos to authenticated;
grant select, insert, update, delete on table public.pedido_trabajadores to authenticated;
grant select, insert, update, delete on table public.pedido_tareas to authenticated;
grant select on table public.archivos to authenticated;
grant select, insert on table public.pedido_comentarios to authenticated;
grant select on table public.pedido_historial to authenticated;
grant select, insert on table public.solicitud_comentarios to authenticated;
grant select on table public.solicitud_historial to authenticated;
grant select, insert, update, delete on table public.trabajo_plantillas to authenticated;
grant select, insert, update, delete on table public.trabajo_plantilla_tareas to authenticated;
grant select, insert, update, delete on table public.pedido_pagos to authenticated;

revoke all on type public.archivo_carga_sesion_estado from public, anon, authenticated;
revoke all on type public.archivo_carga_item_estado from public, anon, authenticated;
grant usage on type public.archivo_carga_sesion_estado to anon, authenticated;
grant usage on type public.archivo_carga_item_estado to anon, authenticated;

revoke all on table public.archivo_carga_sesiones from public, anon, authenticated, service_role;
revoke all on table public.archivo_carga_items from public, anon, authenticated, service_role;

-- B. Private authorization helpers.
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

-- C. Auth Admin final permissions.
grant execute on function private.provision_internal_profile_from_auth_user() to supabase_auth_admin;

revoke all on function public.complete_initial_password_change(uuid) from public, anon, authenticated;
grant execute on function public.complete_initial_password_change(uuid) to service_role;

-- D. Core schema and business assertions.
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

-- E. Auth Admin and platform safety assertions.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'godel-files' and name = 'godel-files' and public = false) then
    raise exception 'Hardening failed: godel-files bucket is missing or public.';
  end if;

  if not exists (
    select 1
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and pg_get_userbyid(c.relowner) = 'supabase_storage_admin'
  ) then
    raise exception 'Hardening failed: storage.objects is missing or is not owned by supabase_storage_admin.';
  end if;

  if not exists (
    select 1
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and c.relrowsecurity
  ) then
    raise exception 'Hardening failed: RLS is not enabled on storage.objects.';
  end if;

  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and roles @> array['anon']::name[] and cmd in ('SELECT', 'UPDATE', 'DELETE')) <> 0 then
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

-- F. Storage policy helper privileges.
grant execute on function private.can_sign_public_upload(text, text) to anon;
grant execute on function private.can_create_internal_upload(text, text) to authenticated;
grant execute on function private.can_read_committed_storage_object(text, text) to authenticated;
grant execute on function private.can_manage_upload_storage_object(text, text) to authenticated;

-- G. Upload control-plane assertions.
do $$
declare
  v_signature text;
  v_table text;
  v_required_upload_policies text[] := array[
    'godel_files_insert_reserved_internal_tus',
    'godel_files_insert_reserved_public_sign',
    'godel_files_select_committed',
    'godel_files_delete_managed'
  ];
  v_legacy_helpers text[] := array[
    'storage_path_has_exact_parts',
    'storage_order_id',
    'storage_order_category',
    'storage_request_id',
    'is_allowed_public_request_file_type',
    'is_allowed_public_request_file',
    'can_read_storage_object',
    'can_insert_storage_object',
    'can_manage_storage_object',
    'can_insert_public_request_storage_object',
    'can_insert_public_request_file_metadata',
    'pedido_file_path_matches',
    'can_insert_pedido_file_metadata'
  ];
begin
  if (select count(*) from pg_type where typnamespace = 'public'::regnamespace and typtype = 'e') <> 12 then
    raise exception 'Hardening failed: expected exactly twelve public enums.';
  end if;

  if (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')) <> 18 then
    raise exception 'Hardening failed: expected exactly eighteen public tables.';
  end if;

  foreach v_table in array array['archivo_carga_sesiones', 'archivo_carga_items'] loop
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

  if has_table_privilege('authenticated', 'public.archivos', 'INSERT')
    or has_table_privilege('authenticated', 'public.archivos', 'UPDATE')
    or has_table_privilege('authenticated', 'public.archivos', 'DELETE')
    or not has_table_privilege('authenticated', 'public.archivos', 'SELECT')
    or has_table_privilege('anon', 'public.archivos', 'INSERT')
    or has_table_privilege('anon', 'public.solicitudes', 'INSERT') then
    raise exception 'Hardening failed: direct public metadata or solicitud writes do not match the final contract.';
  end if;

  if has_table_privilege('anon', 'public.archivo_carga_sesiones', 'SELECT')
    or has_table_privilege('anon', 'public.archivo_carga_sesiones', 'INSERT')
    or has_table_privilege('anon', 'public.archivo_carga_sesiones', 'UPDATE')
    or has_table_privilege('anon', 'public.archivo_carga_sesiones', 'DELETE')
    or has_table_privilege('authenticated', 'public.archivo_carga_sesiones', 'SELECT')
    or has_table_privilege('authenticated', 'public.archivo_carga_sesiones', 'INSERT')
    or has_table_privilege('authenticated', 'public.archivo_carga_sesiones', 'UPDATE')
    or has_table_privilege('authenticated', 'public.archivo_carga_sesiones', 'DELETE')
    or has_table_privilege('service_role', 'public.archivo_carga_sesiones', 'SELECT')
    or has_table_privilege('service_role', 'public.archivo_carga_sesiones', 'INSERT')
    or has_table_privilege('service_role', 'public.archivo_carga_sesiones', 'UPDATE')
    or has_table_privilege('service_role', 'public.archivo_carga_sesiones', 'DELETE')
    or has_table_privilege('anon', 'public.archivo_carga_items', 'SELECT')
    or has_table_privilege('anon', 'public.archivo_carga_items', 'INSERT')
    or has_table_privilege('anon', 'public.archivo_carga_items', 'UPDATE')
    or has_table_privilege('anon', 'public.archivo_carga_items', 'DELETE')
    or has_table_privilege('authenticated', 'public.archivo_carga_items', 'SELECT')
    or has_table_privilege('authenticated', 'public.archivo_carga_items', 'INSERT')
    or has_table_privilege('authenticated', 'public.archivo_carga_items', 'UPDATE')
    or has_table_privilege('authenticated', 'public.archivo_carga_items', 'DELETE')
    or has_table_privilege('service_role', 'public.archivo_carga_items', 'SELECT')
    or has_table_privilege('service_role', 'public.archivo_carga_items', 'INSERT')
    or has_table_privilege('service_role', 'public.archivo_carga_items', 'UPDATE')
    or has_table_privilege('service_role', 'public.archivo_carga_items', 'DELETE') then
    raise exception 'Hardening failed: upload control plane exposes direct CRUD.';
  end if;

  if not has_type_privilege('anon', 'public.archivo_carga_sesion_estado', 'USAGE')
    or not has_type_privilege('authenticated', 'public.archivo_carga_sesion_estado', 'USAGE')
    or not has_type_privilege('anon', 'public.archivo_carga_item_estado', 'USAGE')
    or not has_type_privilege('authenticated', 'public.archivo_carga_item_estado', 'USAGE') then
    raise exception 'Hardening failed: upload enum USAGE grants are incomplete.';
  end if;

  if exists (
    select 1
    from pg_type as t
    cross join lateral aclexplode(coalesce(t.typacl, acldefault('T', t.typowner))) as acl
    where t.oid in ('public.archivo_carga_sesion_estado'::regtype, 'public.archivo_carga_item_estado'::regtype)
      and acl.grantee = 0
      and acl.privilege_type = 'USAGE'
  ) then
    raise exception 'Hardening failed: PUBLIC retains USAGE on an upload enum.';
  end if;

  foreach v_signature in array array[
    'public.crear_solicitud_publica_con_reserva_carga(text, uuid, text, text, text, jsonb, text, text, date, text, integer, text, text, text)',
    'public.reservar_carga_pedido(uuid, jsonb)',
    'public.autorizar_firma_carga_publica(uuid, uuid, text)',
    'public.finalizar_carga_publica(uuid, uuid, text)',
    'public.finalizar_carga_pedido(uuid, uuid)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Hardening failed: missing upload RPC %.', v_signature;
    end if;
  end loop;

  if not has_function_privilege('anon', 'public.crear_solicitud_publica_con_reserva_carga(text, uuid, text, text, text, jsonb, text, text, date, text, integer, text, text, text)', 'EXECUTE')
    or not has_function_privilege('anon', 'public.autorizar_firma_carga_publica(uuid, uuid, text)', 'EXECUTE')
    or not has_function_privilege('anon', 'public.finalizar_carga_publica(uuid, uuid, text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.reservar_carga_pedido(uuid, jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.finalizar_carga_pedido(uuid, uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.reservar_carga_pedido(uuid, jsonb)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.finalizar_carga_pedido(uuid, uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.crear_solicitud_publica_con_reserva_carga(text, uuid, text, text, text, jsonb, text, text, date, text, integer, text, text, text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.autorizar_firma_carga_publica(uuid, uuid, text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.finalizar_carga_publica(uuid, uuid, text)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.crear_solicitud_publica_con_reserva_carga(text, uuid, text, text, text, jsonb, text, text, date, text, integer, text, text, text)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.reservar_carga_pedido(uuid, jsonb)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.autorizar_firma_carga_publica(uuid, uuid, text)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.finalizar_carga_publica(uuid, uuid, text)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.finalizar_carga_pedido(uuid, uuid)', 'EXECUTE') then
    raise exception 'Hardening failed: upload RPC grants do not match the final contract.';
  end if;

  foreach v_signature in array array[
    'public.crear_solicitud_publica_con_reserva_carga(text, uuid, text, text, text, jsonb, text, text, date, text, integer, text, text, text)',
    'public.reservar_carga_pedido(uuid, jsonb)',
    'public.autorizar_firma_carga_publica(uuid, uuid, text)',
    'public.finalizar_carga_publica(uuid, uuid, text)',
    'public.finalizar_carga_pedido(uuid, uuid)'
  ] loop
    if exists (
      select 1
      from pg_proc as p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where p.oid = to_regprocedure(v_signature)
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'Hardening failed: PUBLIC can execute upload RPC %.', v_signature;
    end if;
  end loop;

  if to_regprocedure('private.create_public_solicitud_record(text, uuid, text, text, text, text, date, text, integer, text, text, text)') is null
    or to_regprocedure('public.crear_solicitud_publica_sin_archivos(text, uuid, text, text, text, text, date, text)') is null then
    raise exception 'Hardening failed: missing public solicitud without-upload contract.';
  end if;

  if not has_function_privilege('anon', 'public.crear_solicitud_publica_sin_archivos(text, uuid, text, text, text, text, date, text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.crear_solicitud_publica_sin_archivos(text, uuid, text, text, text, text, date, text)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.crear_solicitud_publica_sin_archivos(text, uuid, text, text, text, text, date, text)', 'EXECUTE')
    or has_function_privilege('anon', 'private.create_public_solicitud_record(text, uuid, text, text, text, text, date, text, integer, text, text, text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.create_public_solicitud_record(text, uuid, text, text, text, text, date, text, integer, text, text, text)', 'EXECUTE')
    or has_function_privilege('service_role', 'private.create_public_solicitud_record(text, uuid, text, text, text, text, date, text, integer, text, text, text)', 'EXECUTE') then
    raise exception 'Hardening failed: public solicitud without-upload grants do not match the final contract.';
  end if;

  if exists (
    select 1
    from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid in (
      'private.create_public_solicitud_record(text, uuid, text, text, text, text, date, text, integer, text, text, text)'::regprocedure,
      'public.crear_solicitud_publica_sin_archivos(text, uuid, text, text, text, text, date, text)'::regprocedure
    )
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'Hardening failed: PUBLIC can execute a public solicitud without-upload function.';
  end if;

  if not has_function_privilege('anon', 'private.can_sign_public_upload(text, text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.can_create_internal_upload(text, text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.can_read_committed_storage_object(text, text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.can_manage_upload_storage_object(text, text)', 'EXECUTE') then
    raise exception 'Hardening failed: storage helper grants are incomplete.';
  end if;

  if to_regprocedure('extensions.digest(bytea,text)') is null
    or to_regprocedure('extensions.digest(text,text)') is null
    or not exists (
      select 1 from pg_extension as e join pg_namespace as n on n.oid = e.extnamespace
      where e.extname = 'pgcrypto' and n.nspname = 'extensions'
    ) then
    raise exception 'Hardening failed: pgcrypto is not available from extensions.';
  end if;

  if not exists (
    select 1
    from storage.buckets as b
    where b.id = 'godel-files'
      and b.name = 'godel-files'
      and b.public = false
      and b.file_size_limit = 20971520
      and cardinality(b.allowed_mime_types) = 10
      and b.allowed_mime_types @> array[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip',
        'application/x-zip-compressed',
        'application/vnd.rar',
        'application/vnd.corel-draw'
      ]::text[]
      and b.allowed_mime_types <@ array[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip',
        'application/x-zip-compressed',
        'application/vnd.rar',
        'application/vnd.corel-draw'
      ]::text[]
  ) then
    raise exception 'Hardening failed: godel-files does not match the required private MIME contract.';
  end if;

  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects') <> 4
    or (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = any(v_required_upload_policies)) <> 4
    or not exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'godel_files_insert_reserved_public_sign'
        and cmd = 'INSERT'
        and roles @> array['anon']::name[]
    )
    or not exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'godel_files_insert_reserved_internal_tus'
        and cmd = 'INSERT'
        and roles @> array['authenticated']::name[]
    )
    or not exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'godel_files_select_committed'
        and cmd = 'SELECT'
        and roles @> array['authenticated']::name[]
    )
    or not exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'godel_files_delete_managed'
        and cmd = 'DELETE'
        and roles @> array['authenticated']::name[]
    ) then
    raise exception 'Hardening failed: upload storage policy matrix does not match the final contract.';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'archivos' and policyname in ('archivos_insert_internal', 'archivos_update_manager', 'archivos_delete_manager'))
    or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitudes' and policyname = 'solicitudes_insert_public')
    or exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('godel_files_select_accessible', 'godel_files_insert_accessible', 'godel_files_update_manager', 'godel_files_delete_manager', 'godel_files_insert_public_request_files')) then
    raise exception 'Hardening failed: a legacy write policy remains.';
  end if;

  if exists (
    select 1 from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = any(v_legacy_helpers)
  ) then
    raise exception 'Hardening failed: a legacy helper remains.';
  end if;

  if exists (
    select 1 from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.proname ~ 'ppo[_0-9]'
  ) or exists (
    select 1 from pg_policies where policyname ~ 'ppo[_0-9]'
  ) then
    raise exception 'Hardening failed: a phase-specific persistent object remains.';
  end if;

  if exists (
    select 1 from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where case
      when n.nspname in ('public', 'private')
        and p.prokind = 'f'
      then
        pg_get_functiondef(p.oid) ~ '(solicitudes/.*/originales/|pedidos/.*/(internos|avances|finales)/)'
      else false
    end
  ) or exists (
    select 1
    from pg_policy as p
    where coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ '(solicitudes/.*/originales/|pedidos/.*/(internos|avances|finales)/)'
      or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ '(solicitudes/.*/originales/|pedidos/.*/(internos|avances|finales)/)'
  ) then
    raise exception 'Hardening failed: a legacy storage path builder remains.';
  end if;

  if exists (
    select 1 from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where case
      when n.nspname in ('public', 'private')
        and p.prokind = 'f'
      then
        pg_get_functiondef(p.oid) ~ 'cargas/(?!v1/)'
      else false
    end
  ) or exists (
    select 1
    from pg_policy as p
    where coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~ 'cargas/(?!v1/)'
      or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ 'cargas/(?!v1/)'
  ) then
    raise exception 'Hardening failed: a noncanonical upload path remains.';
  end if;
end;
$$;
