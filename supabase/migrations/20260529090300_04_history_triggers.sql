-- Consolidated automatic history trigger functions.
-- These functions keep order and request history in sync with domain changes.

create or replace function private.insert_pedido_historial_pedido_creado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.pedido_historial (
    pedido_id,
    user_id,
    action,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    new.creado_por,
    'pedido_creado'::public.pedido_historial_action,
    null,
    new.numero_pedido,
    jsonb_build_object(
      'numero_pedido', new.numero_pedido,
      'titulo', new.titulo,
      'solicitud_id', new.solicitud_id,
      'origen', case
        when new.solicitud_id is null then 'manual'
        else 'solicitud'
      end
    )
  );

  return new;
end;
$$;

create trigger insert_pedido_historial_pedido_creado
after insert on public.pedidos
for each row
execute function private.insert_pedido_historial_pedido_creado();

create or replace function private.insert_pedido_historial_trabajador_asignado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_trabajador_nombre text;
begin
  select p.full_name
  into v_trabajador_nombre
  from public.profiles as p
  where p.id = new.trabajador_id;

  insert into public.pedido_historial (
    pedido_id,
    user_id,
    action,
    old_value,
    new_value,
    metadata
  )
  values (
    new.pedido_id,
    new.assigned_by,
    'trabajador_asignado'::public.pedido_historial_action,
    null,
    coalesce(v_trabajador_nombre, new.trabajador_id::text),
    jsonb_build_object(
      'trabajador_id', new.trabajador_id,
      'assigned_by', new.assigned_by,
      'assigned_at', new.assigned_at
    )
  );

  return new;
end;
$$;

create trigger insert_pedido_historial_trabajador_asignado
after insert on public.pedido_trabajadores
for each row
execute function private.insert_pedido_historial_trabajador_asignado();

create or replace function private.insert_pedido_historial_trabajador_removido()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_trabajador_nombre text;
  v_removed_by uuid;
begin
  select p.full_name
  into v_trabajador_nombre
  from public.profiles as p
  where p.id = old.trabajador_id;

  v_removed_by := auth.uid();

  insert into public.pedido_historial (
    pedido_id,
    user_id,
    action,
    old_value,
    new_value,
    metadata
  )
  values (
    old.pedido_id,
    v_removed_by,
    'trabajador_removido'::public.pedido_historial_action,
    coalesce(v_trabajador_nombre, old.trabajador_id::text),
    null,
    jsonb_build_object(
      'trabajador_id', old.trabajador_id,
      'removed_by', v_removed_by
    )
  );

  return old;
end;
$$;

create trigger insert_pedido_historial_trabajador_removido
after delete on public.pedido_trabajadores
for each row
execute function private.insert_pedido_historial_trabajador_removido();

create or replace function private.insert_pedido_historial_archivo_subido()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.pedido_id is null then
    return new;
  end if;

  if new.visibility not in (
    'interno_pedido'::public.archivo_visibility,
    'avance'::public.archivo_visibility,
    'final_entrega'::public.archivo_visibility
  ) then
    return new;
  end if;

  insert into public.pedido_historial (
    pedido_id,
    user_id,
    action,
    old_value,
    new_value,
    metadata
  )
  values (
    new.pedido_id,
    new.uploaded_by,
    'archivo_subido'::public.pedido_historial_action,
    null,
    new.file_name,
    jsonb_build_object(
      'archivo_id', new.id,
      'file_name', new.file_name,
      'file_type', new.file_type,
      'file_size', new.file_size,
      'visibility', new.visibility
    )
  );

  return new;
end;
$$;

create trigger insert_pedido_historial_archivo_subido
after insert on public.archivos
for each row
execute function private.insert_pedido_historial_archivo_subido();

comment on function private.insert_pedido_historial_pedido_creado() is
  'Registra historial automático cuando se crea un pedido.';

comment on function private.insert_pedido_historial_trabajador_asignado() is
  'Registra historial automático cuando se asigna personal a un pedido.';

comment on function private.insert_pedido_historial_trabajador_removido() is
  'Registra historial automático cuando se remueve personal de un pedido.';

comment on function private.insert_pedido_historial_archivo_subido() is
  'Registra historial automático cuando se sube un archivo propio de pedido.';

create or replace function private.solicitud_estado_label(
  p_estado public.solicitud_estado
)
returns text
language sql
immutable
set search_path = public, private
as $$
  select case p_estado
    when 'nueva'::public.solicitud_estado then 'Nueva'
    when 'en_revision'::public.solicitud_estado then 'En revisión'
    when 'contactada'::public.solicitud_estado then 'Contactada'
    when 'aprobada'::public.solicitud_estado then 'Aprobada'
    when 'rechazada'::public.solicitud_estado then 'Rechazada'
    when 'convertida'::public.solicitud_estado then 'Convertida'
    else p_estado::text
  end;
$$;

create or replace function private.insert_solicitud_historial_solicitud_creada()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    resumen,
    metadata
  )
  values (
    new.id,
    auth.uid(),
    'solicitud_creada'::public.solicitud_historial_action,
    'Solicitud registrada: ' || new.tipo_servicio ||
      coalesce(' (' || new.cantidad::text || ' unidades)', ''),
    jsonb_strip_nulls(
      jsonb_build_object(
        'tipo_servicio', new.tipo_servicio,
        'cantidad', new.cantidad,
        'origen', case
          when auth.uid() is null then 'publica'
          else 'interna'
        end
      )
    )
  );

  return new;
end;
$$;

create trigger insert_solicitud_historial_solicitud_creada
after insert on public.solicitudes
for each row
execute function private.insert_solicitud_historial_solicitud_creada();

create or replace function private.insert_solicitud_historial_archivo_adjuntado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.solicitud_id is null then
    return new;
  end if;

  if new.visibility <> 'cliente_solicitud'::public.archivo_visibility then
    return new;
  end if;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    resumen,
    metadata
  )
  values (
    new.solicitud_id,
    new.uploaded_by,
    'archivos_adjuntados'::public.solicitud_historial_action,
    'Archivo adjuntado a la solicitud: ' || new.file_name,
    jsonb_strip_nulls(
      jsonb_build_object(
        'archivo_id', new.id,
        'file_name', new.file_name,
        'file_type', new.file_type,
        'file_size', new.file_size
      )
    )
  );

  return new;
end;
$$;

create trigger insert_solicitud_historial_archivo_adjuntado
after insert on public.archivos
for each row
execute function private.insert_solicitud_historial_archivo_adjuntado();

create or replace function private.insert_solicitud_historial_estado_cambiado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if old.estado is not distinct from new.estado then
    return new;
  end if;

  if old.converted_order_id is null
    and new.converted_order_id is not null
    and new.estado = 'convertida'::public.solicitud_estado then
    return new;
  end if;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    resumen,
    metadata
  )
  values (
    new.id,
    coalesce(auth.uid(), new.reviewed_by),
    'estado_cambiado'::public.solicitud_historial_action,
    'Estado cambiado de ' ||
      private.solicitud_estado_label(old.estado) ||
      ' a ' ||
      private.solicitud_estado_label(new.estado),
    jsonb_build_object(
      'estado_anterior', old.estado,
      'estado_nuevo', new.estado
    )
  );

  return new;
end;
$$;

create trigger insert_solicitud_historial_estado_cambiado
after update of estado on public.solicitudes
for each row
execute function private.insert_solicitud_historial_estado_cambiado();

create or replace function private.insert_solicitud_historial_cliente_asociado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_cliente_nombre text;
begin
  if old.cliente_id is not distinct from new.cliente_id then
    return new;
  end if;

  if new.cliente_id is null then
    return new;
  end if;

  select c.nombre
  into v_cliente_nombre
  from public.clientes as c
  where c.id = new.cliente_id;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    resumen,
    metadata
  )
  values (
    new.id,
    auth.uid(),
    'cliente_asociado'::public.solicitud_historial_action,
    'Cliente asociado a la solicitud: ' ||
      coalesce(v_cliente_nombre, new.cliente_id::text),
    jsonb_strip_nulls(
      jsonb_build_object(
        'cliente_id', new.cliente_id,
        'cliente_nombre', v_cliente_nombre
      )
    )
  );

  return new;
end;
$$;

create trigger insert_solicitud_historial_cliente_asociado
after update of cliente_id on public.solicitudes
for each row
execute function private.insert_solicitud_historial_cliente_asociado();

create or replace function private.insert_solicitud_historial_convertida_a_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_numero_pedido text;
  v_titulo text;
begin
  if old.converted_order_id is not null
    or new.converted_order_id is null then
    return new;
  end if;

  select p.numero_pedido, p.titulo
  into v_numero_pedido, v_titulo
  from public.pedidos as p
  where p.id = new.converted_order_id;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    resumen,
    metadata
  )
  values (
    new.id,
    coalesce(auth.uid(), new.reviewed_by),
    'convertida_a_pedido'::public.solicitud_historial_action,
    'Solicitud convertida a pedido: ' ||
      coalesce(v_numero_pedido, new.converted_order_id::text),
    jsonb_strip_nulls(
      jsonb_build_object(
        'pedido_id', new.converted_order_id,
        'numero_pedido', v_numero_pedido,
        'titulo', v_titulo,
        'estado', new.estado
      )
    )
  );

  return new;
end;
$$;

create trigger insert_solicitud_historial_convertida_a_pedido
after update of converted_order_id on public.solicitudes
for each row
execute function private.insert_solicitud_historial_convertida_a_pedido();

comment on function private.solicitud_estado_label(public.solicitud_estado) is
  'Devuelve una etiqueta visible para estados técnicos de solicitud.';

comment on function private.insert_solicitud_historial_solicitud_creada() is
  'Registra historial automático cuando se crea una solicitud.';

comment on function private.insert_solicitud_historial_archivo_adjuntado() is
  'Registra historial automático cuando se adjunta un archivo de cliente a una solicitud.';

comment on function private.insert_solicitud_historial_estado_cambiado() is
  'Registra historial automático cuando cambia el estado de una solicitud.';

comment on function private.insert_solicitud_historial_cliente_asociado() is
  'Registra historial automático cuando se asocia un cliente a una solicitud.';

comment on function private.insert_solicitud_historial_convertida_a_pedido() is
  'Registra historial automático cuando una solicitud se convierte en pedido.';
