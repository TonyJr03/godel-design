-- Consolidated public RPCs.
-- These functions are the controlled public entrypoints used by the app.

create or replace function public.actualizar_estado_pedido(
  p_pedido_id uuid,
  p_nuevo_estado public.pedido_estado
)
returns public.pedidos
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_pedido public.pedidos;
  v_estado_anterior public.pedido_estado;
  v_action public.pedido_historial_action;
  v_task_count integer;
  v_has_tasks boolean;
  v_all_tasks_completed boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not private.current_user_is_active() then
    raise exception 'Usuario inactivo o sin perfil valido';
  end if;

  select *
  into v_pedido
  from public.pedidos
  where id = p_pedido_id;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (
    private.is_admin_or_supervisor()
    or (
      private.current_user_role() = 'trabajador'::public.app_role
      and private.is_assigned_to_pedido(p_pedido_id)
    )
  ) then
    raise exception 'No tienes permiso para cambiar el estado de este pedido';
  end if;

  v_estado_anterior := v_pedido.status;

  if v_estado_anterior = p_nuevo_estado then
    return v_pedido;
  end if;

  if v_estado_anterior in (
    'entregado'::public.pedido_estado,
    'cancelado'::public.pedido_estado
  ) then
    raise exception 'No se puede cambiar el estado de un pedido cerrado.';
  end if;

  if p_nuevo_estado = 'entregado'::public.pedido_estado
    and v_estado_anterior <> 'listo_entrega'::public.pedido_estado then
    raise exception 'Solo se puede marcar como entregado un pedido listo para entrega.';
  end if;

  select
    count(*)::integer,
    coalesce(bool_and(is_completed), false)
  into
    v_task_count,
    v_all_tasks_completed
  from public.pedido_tareas
  where pedido_id = p_pedido_id;

  v_has_tasks := v_task_count > 0;

  if v_estado_anterior = 'solicitud_recibida'::public.pedido_estado then
    if p_nuevo_estado not in (
      'en_revision'::public.pedido_estado,
      'cancelado'::public.pedido_estado
    ) then
      raise exception 'Transición de estado no permitida.';
    end if;
  elsif v_estado_anterior = 'en_revision'::public.pedido_estado then
    if p_nuevo_estado not in (
      'en_produccion'::public.pedido_estado,
      'cancelado'::public.pedido_estado
    ) then
      if p_nuevo_estado = 'entregado'::public.pedido_estado then
        raise exception 'Solo se puede marcar como entregado un pedido listo para entrega.';
      end if;

      raise exception 'Transición de estado no permitida.';
    end if;

    if p_nuevo_estado = 'en_produccion'::public.pedido_estado
      and not v_has_tasks then
      raise exception 'No se puede pasar a producción sin tareas registradas.';
    end if;
  elsif v_estado_anterior = 'en_produccion'::public.pedido_estado then
    if p_nuevo_estado not in (
      'listo_entrega'::public.pedido_estado,
      'cancelado'::public.pedido_estado
    ) then
      if p_nuevo_estado = 'entregado'::public.pedido_estado then
        raise exception 'Solo se puede marcar como entregado un pedido listo para entrega.';
      end if;

      raise exception 'Transición de estado no permitida.';
    end if;

    if p_nuevo_estado = 'listo_entrega'::public.pedido_estado
      and (not v_has_tasks or not v_all_tasks_completed) then
      raise exception 'No se puede marcar como listo para entrega hasta completar todas las tareas.';
    end if;
  elsif v_estado_anterior = 'listo_entrega'::public.pedido_estado then
    if p_nuevo_estado not in (
      'entregado'::public.pedido_estado,
      'en_produccion'::public.pedido_estado,
      'cancelado'::public.pedido_estado
    ) then
      raise exception 'Transición de estado no permitida.';
    end if;
  else
    raise exception 'Transición de estado no permitida.';
  end if;

  if p_nuevo_estado = 'entregado'::public.pedido_estado then
    v_action := 'pedido_entregado'::public.pedido_historial_action;
  elsif p_nuevo_estado = 'cancelado'::public.pedido_estado then
    v_action := 'pedido_cancelado'::public.pedido_historial_action;
  else
    v_action := 'estado_cambiado'::public.pedido_historial_action;
  end if;

  update public.pedidos
  set
    status = p_nuevo_estado,
    actual_delivery_date = case
      when p_nuevo_estado = 'entregado'::public.pedido_estado then current_date
      else actual_delivery_date
    end,
    updated_at = now()
  where id = p_pedido_id
  returning * into v_pedido;

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
    p_pedido_id,
    auth.uid(),
    v_action,
    'Estado cambiado de ' ||
      v_estado_anterior::text ||
      ' a ' ||
      p_nuevo_estado::text,
    v_estado_anterior::text,
    p_nuevo_estado::text,
    jsonb_build_object('source', 'actualizar_estado_pedido')
  );

  return v_pedido;
end;
$$;

revoke all on function public.actualizar_estado_pedido(uuid, public.pedido_estado) from public;
revoke all on function public.actualizar_estado_pedido(uuid, public.pedido_estado) from anon;
grant execute on function public.actualizar_estado_pedido(uuid, public.pedido_estado) to authenticated;

create or replace function public.actualizar_estado_solicitud(
  p_solicitud_id uuid,
  p_estado_nuevo public.solicitud_estado
)
returns public.solicitudes
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_solicitud public.solicitudes;
  v_estado_anterior public.solicitud_estado;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not private.current_user_is_active() then
    raise exception 'Usuario inactivo o sin perfil valido';
  end if;

  if not private.is_admin_or_supervisor() then
    raise exception 'No tienes permiso para cambiar el estado de esta solicitud.';
  end if;

  if p_estado_nuevo = 'convertida'::public.solicitud_estado then
    raise exception 'El estado convertida solo se asigna al convertir la solicitud en pedido.';
  end if;

  select *
  into v_solicitud
  from public.solicitudes
  where id = p_solicitud_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  v_estado_anterior := v_solicitud.status;

  if v_estado_anterior = p_estado_nuevo then
    return v_solicitud;
  end if;

  if v_estado_anterior in (
    'rechazada'::public.solicitud_estado,
    'convertida'::public.solicitud_estado
  ) then
    raise exception 'No se puede cambiar el estado de una solicitud cerrada.';
  end if;

  if v_estado_anterior = 'nueva'::public.solicitud_estado then
    if p_estado_nuevo not in (
      'en_revision'::public.solicitud_estado,
      'rechazada'::public.solicitud_estado
    ) then
      raise exception 'Transición de estado no permitida.';
    end if;
  elsif v_estado_anterior = 'en_revision'::public.solicitud_estado then
    if p_estado_nuevo not in (
      'contactada'::public.solicitud_estado,
      'rechazada'::public.solicitud_estado
    ) then
      raise exception 'Transición de estado no permitida.';
    end if;
  elsif v_estado_anterior = 'contactada'::public.solicitud_estado then
    if p_estado_nuevo not in (
      'aprobada'::public.solicitud_estado,
      'rechazada'::public.solicitud_estado
    ) then
      raise exception 'Transición de estado no permitida.';
    end if;
  elsif v_estado_anterior = 'aprobada'::public.solicitud_estado then
    if p_estado_nuevo <> 'rechazada'::public.solicitud_estado then
      raise exception 'Transición de estado no permitida.';
    end if;
  else
    raise exception 'Transición de estado no permitida.';
  end if;

  update public.solicitudes
  set
    status = p_estado_nuevo,
    reviewed_by = auth.uid()
  where id = p_solicitud_id
  returning * into v_solicitud;

  return v_solicitud;
end;
$$;

revoke all on function public.actualizar_estado_solicitud(uuid, public.solicitud_estado) from public;
revoke all on function public.actualizar_estado_solicitud(uuid, public.solicitud_estado) from anon;
grant execute on function public.actualizar_estado_solicitud(uuid, public.solicitud_estado) to authenticated;

comment on function public.actualizar_estado_solicitud(uuid, public.solicitud_estado) is
  'Actualiza estados de solicitud aplicando transiciones operativas y reservando convertida para la conversión a pedido.';

create or replace function public.listar_pedido_comentarios(
  p_pedido_id uuid
)
returns table (
  id uuid,
  content text,
  created_at timestamptz,
  author_full_name text,
  author_role public.app_role
)
language sql
security definer
set search_path = public, private
stable
as $$
  select
    pc.id,
    pc.content,
    pc.created_at,
    p.full_name as author_full_name,
    p.role as author_role
  from public.pedido_comentarios as pc
  join public.perfiles as p
    on p.id = pc.author_id
  where pc.pedido_id = p_pedido_id
    and (select auth.uid()) is not null
    and private.can_access_pedido(p_pedido_id)
  order by pc.created_at asc, pc.id asc;
$$;

revoke all on function public.listar_pedido_comentarios(uuid) from public;
revoke all on function public.listar_pedido_comentarios(uuid) from anon;
grant execute on function public.listar_pedido_comentarios(uuid) to authenticated;

comment on function public.listar_pedido_comentarios(uuid) is
  'Lista comentarios internos de un pedido accesible con nombre y rol mínimos del autor.';

create or replace function public.listar_pedido_historial(
  p_pedido_id uuid
)
returns table (
  id uuid,
  action public.pedido_historial_action,
  summary text,
  old_value text,
  new_value text,
  metadata jsonb,
  created_at timestamptz,
  actor_full_name text,
  actor_role public.app_role
)
language sql
security definer
set search_path = public, private
stable
as $$
  select
    ph.id,
    ph.action,
    ph.summary,
    ph.old_value,
    ph.new_value,
    ph.metadata,
    ph.created_at,
    p.full_name as actor_full_name,
    p.role as actor_role
  from public.pedido_historial as ph
  left join public.perfiles as p
    on p.id = ph.actor_id
  where ph.pedido_id = p_pedido_id
    and (select auth.uid()) is not null
    and private.current_user_is_active()
    and private.can_access_pedido(p_pedido_id)
  order by ph.created_at desc, ph.id desc;
$$;

revoke all on function public.listar_pedido_historial(uuid) from public;
revoke all on function public.listar_pedido_historial(uuid) from anon;
grant execute on function public.listar_pedido_historial(uuid) to authenticated;

comment on function public.listar_pedido_historial(uuid) is
  'Lista historial interno de un pedido accesible con nombre y rol mínimos del actor.';

create or replace function public.listar_solicitud_comentarios(
  p_solicitud_id uuid
)
returns table (
  id uuid,
  content text,
  created_at timestamptz,
  author_full_name text,
  author_role public.app_role
)
language sql
security definer
set search_path = public, private
stable
as $$
  select
    sc.id,
    sc.content,
    sc.created_at,
    p.full_name as author_full_name,
    p.role as author_role
  from public.solicitud_comentarios as sc
  join public.perfiles as p
    on p.id = sc.author_id
  where sc.solicitud_id = p_solicitud_id
    and (select auth.uid()) is not null
    and private.current_user_is_active()
    and private.is_admin_or_supervisor()
  order by sc.created_at asc, sc.id asc;
$$;

revoke all on function public.listar_solicitud_comentarios(uuid) from public;
revoke all on function public.listar_solicitud_comentarios(uuid) from anon;
grant execute on function public.listar_solicitud_comentarios(uuid) to authenticated;

comment on function public.listar_solicitud_comentarios(uuid) is
  'Lista comentarios internos de una solicitud accesible con nombre y rol mínimos del autor.';

create or replace function public.listar_solicitud_historial(
  p_solicitud_id uuid
)
returns table (
  id uuid,
  action public.solicitud_historial_action,
  summary text,
  old_value text,
  new_value text,
  metadata jsonb,
  created_at timestamptz,
  actor_full_name text,
  actor_role public.app_role
)
language sql
security definer
set search_path = public, private
stable
as $$
  select
    sh.id,
    sh.action,
    sh.summary,
    sh.old_value,
    sh.new_value,
    sh.metadata,
    sh.created_at,
    p.full_name as actor_full_name,
    p.role as actor_role
  from public.solicitud_historial as sh
  left join public.perfiles as p
    on p.id = sh.actor_id
  where sh.solicitud_id = p_solicitud_id
    and (select auth.uid()) is not null
    and private.current_user_is_active()
    and private.is_admin_or_supervisor()
  order by sh.created_at desc, sh.id desc;
$$;

revoke all on function public.listar_solicitud_historial(uuid) from public;
revoke all on function public.listar_solicitud_historial(uuid) from anon;
grant execute on function public.listar_solicitud_historial(uuid) to authenticated;

comment on function public.listar_solicitud_historial(uuid) is
  'Lista historial interno de una solicitud accesible con nombre y rol mínimos del actor.';
