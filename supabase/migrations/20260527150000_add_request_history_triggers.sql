-- Automatic request history events.
-- Pedido history is intentionally out of scope for this migration.

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
    'Solicitud registrada',
    jsonb_build_object(
      'tipo_servicio', new.tipo_servicio,
      'cantidad', new.cantidad,
      'origen', case
        when auth.uid() is null then 'publica'
        else 'interna'
      end
    )
  );

  return new;
end;
$$;

drop trigger if exists insert_solicitud_historial_solicitud_creada
on public.solicitudes;

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
    'Archivo adjuntado a la solicitud',
    jsonb_build_object(
      'archivo_id', new.id,
      'file_name', new.file_name,
      'file_type', new.file_type,
      'file_size', new.file_size
    )
  );

  return new;
end;
$$;

drop trigger if exists insert_solicitud_historial_archivo_adjuntado
on public.archivos;

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
    'Estado de la solicitud actualizado',
    jsonb_build_object(
      'estado_anterior', old.estado,
      'estado_nuevo', new.estado
    )
  );

  return new;
end;
$$;

drop trigger if exists insert_solicitud_historial_estado_cambiado
on public.solicitudes;

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
begin
  if old.cliente_id is not distinct from new.cliente_id then
    return new;
  end if;

  if new.cliente_id is null then
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
    auth.uid(),
    'cliente_asociado'::public.solicitud_historial_action,
    'Cliente asociado a la solicitud',
    jsonb_build_object(
      'cliente_id', new.cliente_id
    )
  );

  return new;
end;
$$;

drop trigger if exists insert_solicitud_historial_cliente_asociado
on public.solicitudes;

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
begin
  if old.converted_order_id is not null
    or new.converted_order_id is null then
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
    'convertida_a_pedido'::public.solicitud_historial_action,
    'Solicitud convertida a pedido',
    jsonb_build_object(
      'pedido_id', new.converted_order_id,
      'estado', new.estado
    )
  );

  return new;
end;
$$;

drop trigger if exists insert_solicitud_historial_convertida_a_pedido
on public.solicitudes;

create trigger insert_solicitud_historial_convertida_a_pedido
after update of converted_order_id on public.solicitudes
for each row
execute function private.insert_solicitud_historial_convertida_a_pedido();

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
