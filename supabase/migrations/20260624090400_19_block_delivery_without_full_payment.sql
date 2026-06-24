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
  v_payment_status public.pedido_pago_estado;
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
  where id = p_pedido_id
  for update;

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

  perform 1
  from public.pedido_tareas
  where pedido_id = p_pedido_id
  for share;

  select
    count(*)::integer,
    coalesce(bool_and(is_completed), false)
  into
    v_task_count,
    v_all_tasks_completed
  from public.pedido_tareas
  where pedido_id = p_pedido_id;

  v_has_tasks := v_task_count > 0;

  if v_estado_anterior in (
    'creado'::public.pedido_estado,
    'solicitud_recibida'::public.pedido_estado
  ) then
    if p_nuevo_estado not in (
      'en_revision'::public.pedido_estado,
      'cancelado'::public.pedido_estado
    ) then
      raise exception 'Transicion de estado no permitida.';
    end if;
  elsif v_estado_anterior = 'en_revision'::public.pedido_estado then
    if p_nuevo_estado not in (
      'en_produccion'::public.pedido_estado,
      'cancelado'::public.pedido_estado
    ) then
      if p_nuevo_estado = 'entregado'::public.pedido_estado then
        raise exception 'Solo se puede marcar como entregado un pedido listo para entrega.';
      end if;

      raise exception 'Transicion de estado no permitida.';
    end if;

    if v_pedido.workflow_type = 'encargo'::public.workflow_type
      and p_nuevo_estado = 'en_produccion'::public.pedido_estado
      and not v_has_tasks then
      raise exception 'No se puede pasar a produccion sin tareas registradas.';
    end if;
  elsif v_estado_anterior = 'en_produccion'::public.pedido_estado then
    if p_nuevo_estado not in (
      'listo_entrega'::public.pedido_estado,
      'cancelado'::public.pedido_estado
    ) then
      if p_nuevo_estado = 'entregado'::public.pedido_estado then
        raise exception 'Solo se puede marcar como entregado un pedido listo para entrega.';
      end if;

      raise exception 'Transicion de estado no permitida.';
    end if;

    if v_pedido.workflow_type = 'encargo'::public.workflow_type
      and p_nuevo_estado = 'listo_entrega'::public.pedido_estado
      and (not v_has_tasks or not v_all_tasks_completed) then
      raise exception 'No se puede marcar como listo para entrega hasta completar todas las tareas.';
    end if;
  elsif v_estado_anterior = 'listo_entrega'::public.pedido_estado then
    if p_nuevo_estado not in (
      'entregado'::public.pedido_estado,
      'en_produccion'::public.pedido_estado,
      'cancelado'::public.pedido_estado
    ) then
      raise exception 'Transicion de estado no permitida.';
    end if;
  else
    raise exception 'Transicion de estado no permitida.';
  end if;

  if p_nuevo_estado = 'entregado'::public.pedido_estado then
    select pp.payment_status
    into v_payment_status
    from public.pedido_pagos as pp
    where pp.pedido_id = p_pedido_id
    for share;

    if not found then
      raise exception 'No se puede validar el pago del pedido.';
    end if;

    if v_payment_status <> 'pagado'::public.pedido_pago_estado then
      raise exception 'No se puede marcar como entregado un pedido con pago pendiente.';
    end if;
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
      when p_nuevo_estado = 'entregado'::public.pedido_estado
        then private.current_business_date()
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

revoke all on function public.actualizar_estado_pedido(
  uuid,
  public.pedido_estado
) from public;

revoke all on function public.actualizar_estado_pedido(
  uuid,
  public.pedido_estado
) from anon;

grant execute on function public.actualizar_estado_pedido(
  uuid,
  public.pedido_estado
) to authenticated;

comment on function public.actualizar_estado_pedido(uuid, public.pedido_estado) is
  'Actualiza estado de pedido con reglas operativas, tareas, pago completo para entrega e historial.';
