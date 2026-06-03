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
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    new.created_by,
    'pedido_creado'::public.pedido_historial_action,
    'Pedido creado en el sistema: ' || new.order_number,
    null,
    new.order_number,
    jsonb_build_object(
      'order_number', new.order_number,
      'title', new.title,
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
  from public.perfiles as p
  where p.id = new.assigned_profile_id;

  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.pedido_id,
    new.assigned_by,
    'trabajador_asignado'::public.pedido_historial_action,
    'Personal asignado al pedido: ' ||
      coalesce(v_trabajador_nombre, new.assigned_profile_id::text),
    null,
    coalesce(v_trabajador_nombre, new.assigned_profile_id::text),
    jsonb_build_object(
      'assigned_profile_id', new.assigned_profile_id,
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
  from public.perfiles as p
  where p.id = old.assigned_profile_id;

  v_removed_by := auth.uid();

  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    old.pedido_id,
    v_removed_by,
    'trabajador_removido'::public.pedido_historial_action,
    'Personal removido del pedido: ' ||
      coalesce(v_trabajador_nombre, old.assigned_profile_id::text),
    coalesce(v_trabajador_nombre, old.assigned_profile_id::text),
    null,
    jsonb_build_object(
      'assigned_profile_id', old.assigned_profile_id,
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
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.pedido_id,
    new.uploaded_by,
    'archivo_subido'::public.pedido_historial_action,
    'Archivo agregado al pedido: ' || new.file_name,
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

create or replace function private.insert_pedido_historial_tarea_creada()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.pedido_id,
    coalesce(new.created_by, auth.uid()),
    'tarea_creada'::public.pedido_historial_action,
    'Tarea creada en el pedido: ' || new.title,
    null,
    new.title,
    jsonb_strip_nulls(
      jsonb_build_object(
        'task_id', new.id,
        'title', new.title,
        'task_type', new.task_type::text,
        'target_quantity', new.target_quantity,
        'completed_quantity', new.completed_quantity,
        'is_completed', new.is_completed,
        'sort_order', new.sort_order
      )
    )
  );

  return new;
end;
$$;

create trigger insert_pedido_historial_tarea_creada
after insert on public.pedido_tareas
for each row
execute function private.insert_pedido_historial_tarea_creada();

create or replace function private.insert_pedido_historial_tarea_actualizada()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor_id uuid;
  v_action public.pedido_historial_action;
  v_summary text;
  v_old_value text;
  v_new_value text;
  v_metadata jsonb;
begin
  if old.is_completed = false and new.is_completed = true then
    v_action := 'tarea_completada'::public.pedido_historial_action;
    v_summary := 'Tarea completada en el pedido: ' || new.title;
    v_old_value := old.title;
    v_new_value := new.title;
  elsif old.is_completed = true and new.is_completed = false then
    v_action := 'tarea_reabierta'::public.pedido_historial_action;
    v_summary := 'Tarea reabierta en el pedido: ' || new.title;
    v_old_value := old.title;
    v_new_value := new.title;
  elsif old.completed_quantity is distinct from new.completed_quantity then
    v_action := 'tarea_progreso_actualizado'::public.pedido_historial_action;
    v_summary := 'Progreso actualizado en tarea del pedido: ' || new.title;
    v_old_value := old.completed_quantity::text;
    v_new_value := new.completed_quantity::text;
  elsif old.title is distinct from new.title
    or old.task_type is distinct from new.task_type
    or old.target_quantity is distinct from new.target_quantity
    or old.sort_order is distinct from new.sort_order then
    v_action := 'tarea_actualizada'::public.pedido_historial_action;
    v_summary := 'Tarea actualizada en el pedido: ' || new.title;
    v_old_value := old.title;
    v_new_value := new.title;
  else
    return new;
  end if;

  v_actor_id := coalesce(new.updated_by, auth.uid());
  v_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'task_id', new.id,
      'title', new.title,
      'previous_title', old.title,
      'task_type', new.task_type::text,
      'previous_task_type', old.task_type::text,
      'target_quantity', new.target_quantity,
      'previous_target_quantity', old.target_quantity,
      'completed_quantity', new.completed_quantity,
      'previous_completed_quantity', old.completed_quantity,
      'is_completed', new.is_completed,
      'previous_is_completed', old.is_completed,
      'sort_order', new.sort_order,
      'previous_sort_order', old.sort_order,
      'completed_at', new.completed_at,
      'completed_by', new.completed_by
    )
  );

  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.pedido_id,
    v_actor_id,
    v_action,
    v_summary,
    v_old_value,
    v_new_value,
    v_metadata
  );

  return new;
end;
$$;

create trigger insert_pedido_historial_tarea_actualizada
after update on public.pedido_tareas
for each row
execute function private.insert_pedido_historial_tarea_actualizada();

create or replace function private.insert_pedido_historial_tarea_eliminada()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    old.pedido_id,
    coalesce(auth.uid(), old.updated_by, old.created_by),
    'tarea_eliminada'::public.pedido_historial_action,
    'Tarea eliminada del pedido: ' || old.title,
    old.title,
    null,
    jsonb_strip_nulls(
      jsonb_build_object(
        'task_id', old.id,
        'title', old.title,
        'task_type', old.task_type::text,
        'target_quantity', old.target_quantity,
        'completed_quantity', old.completed_quantity,
        'is_completed', old.is_completed,
        'sort_order', old.sort_order
      )
    )
  );

  return old;
end;
$$;

create trigger insert_pedido_historial_tarea_eliminada
after delete on public.pedido_tareas
for each row
execute function private.insert_pedido_historial_tarea_eliminada();

comment on function private.insert_pedido_historial_pedido_creado() is
  'Registra historial automático cuando se crea un pedido.';

comment on function private.insert_pedido_historial_trabajador_asignado() is
  'Registra historial automático cuando se asigna personal a un pedido.';

comment on function private.insert_pedido_historial_trabajador_removido() is
  'Registra historial automático cuando se remueve personal de un pedido.';

comment on function private.insert_pedido_historial_archivo_subido() is
  'Registra historial automático cuando se sube un archivo propio de pedido.';

comment on function private.insert_pedido_historial_tarea_creada() is
  'Registra historial automático cuando se crea una tarea de pedido.';

comment on function private.insert_pedido_historial_tarea_actualizada() is
  'Registra historial automático cuando se actualiza una tarea de pedido.';

comment on function private.insert_pedido_historial_tarea_eliminada() is
  'Registra historial automático cuando se elimina una tarea de pedido.';

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
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    auth.uid(),
    'solicitud_creada'::public.solicitud_historial_action,
    'Solicitud registrada: ' || new.service_type,
    null,
    new.service_type,
    jsonb_strip_nulls(
      jsonb_build_object(
        'service_type', new.service_type,
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
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.solicitud_id,
    new.uploaded_by,
    'archivos_adjuntados'::public.solicitud_historial_action,
    'Archivo adjuntado a la solicitud: ' || new.file_name,
    null,
    new.file_name,
    jsonb_strip_nulls(
      jsonb_build_object(
        'archivo_id', new.id,
        'file_name', new.file_name,
        'file_type', new.file_type,
        'file_size', new.file_size,
        'visibility', new.visibility
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
  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.converted_order_id is null
    and new.converted_order_id is not null
    and new.status = 'convertida'::public.solicitud_estado then
    return new;
  end if;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    coalesce(auth.uid(), new.reviewed_by),
    'estado_cambiado'::public.solicitud_historial_action,
    'Estado cambiado de ' ||
      private.solicitud_estado_label(old.status) ||
      ' a ' ||
      private.solicitud_estado_label(new.status),
    old.status::text,
    new.status::text,
    jsonb_build_object('source', 'solicitud_estado_trigger')
  );

  return new;
end;
$$;

create trigger insert_solicitud_historial_estado_cambiado
after update of status on public.solicitudes
for each row
execute function private.insert_solicitud_historial_estado_cambiado();

create or replace function private.insert_solicitud_historial_cliente_asociado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_client_name text;
begin
  if old.cliente_id is not distinct from new.cliente_id then
    return new;
  end if;

  if new.cliente_id is null then
    return new;
  end if;

  select c.name
  into v_client_name
  from public.clientes as c
  where c.id = new.cliente_id;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    auth.uid(),
    'cliente_asociado'::public.solicitud_historial_action,
    'Cliente asociado a la solicitud: ' ||
      coalesce(v_client_name, new.cliente_id::text),
    null,
    coalesce(v_client_name, new.cliente_id::text),
    jsonb_strip_nulls(
      jsonb_build_object(
        'cliente_id', new.cliente_id,
        'client_name', v_client_name
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
  v_order_number text;
  v_order_title text;
begin
  if old.converted_order_id is not null
    or new.converted_order_id is null then
    return new;
  end if;

  select p.order_number, p.title
  into v_order_number, v_order_title
  from public.pedidos as p
  where p.id = new.converted_order_id;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    coalesce(auth.uid(), new.reviewed_by),
    'convertida_a_pedido'::public.solicitud_historial_action,
    'Solicitud convertida a pedido: ' ||
      coalesce(v_order_number, new.converted_order_id::text),
    null,
    coalesce(v_order_number, new.converted_order_id::text),
    jsonb_strip_nulls(
      jsonb_build_object(
        'pedido_id', new.converted_order_id,
        'order_number', v_order_number,
        'title', v_order_title,
        'status', new.status
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

revoke all on function private.insert_pedido_historial_pedido_creado()
from public, anon, authenticated;

revoke all on function private.insert_pedido_historial_trabajador_asignado()
from public, anon, authenticated;

revoke all on function private.insert_pedido_historial_trabajador_removido()
from public, anon, authenticated;

revoke all on function private.insert_pedido_historial_archivo_subido()
from public, anon, authenticated;

revoke all on function private.insert_pedido_historial_tarea_creada()
from public, anon, authenticated;

revoke all on function private.insert_pedido_historial_tarea_actualizada()
from public, anon, authenticated;

revoke all on function private.insert_pedido_historial_tarea_eliminada()
from public, anon, authenticated;

revoke all on function private.solicitud_estado_label(public.solicitud_estado)
from public, anon, authenticated;

revoke all on function private.insert_solicitud_historial_solicitud_creada()
from public, anon, authenticated;

revoke all on function private.insert_solicitud_historial_archivo_adjuntado()
from public, anon, authenticated;

revoke all on function private.insert_solicitud_historial_estado_cambiado()
from public, anon, authenticated;

revoke all on function private.insert_solicitud_historial_cliente_asociado()
from public, anon, authenticated;

revoke all on function private.insert_solicitud_historial_convertida_a_pedido()
from public, anon, authenticated;

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
