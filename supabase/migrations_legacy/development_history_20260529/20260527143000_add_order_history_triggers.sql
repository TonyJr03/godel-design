-- Automatic order history events for creations, assignments and order files.
-- Status changes are intentionally excluded because actualizar_estado_pedido
-- already records them.

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

drop trigger if exists insert_pedido_historial_pedido_creado
on public.pedidos;

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

drop trigger if exists insert_pedido_historial_trabajador_asignado
on public.pedido_trabajadores;

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

drop trigger if exists insert_pedido_historial_trabajador_removido
on public.pedido_trabajadores;

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

drop trigger if exists insert_pedido_historial_archivo_subido
on public.archivos;

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
