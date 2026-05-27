-- Improve request history details for future events.
-- This replaces private trigger functions only; it does not change public schema.

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

comment on function private.solicitud_estado_label(public.solicitud_estado) is
  'Devuelve una etiqueta visible para estados técnicos de solicitud.';
