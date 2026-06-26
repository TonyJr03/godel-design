-- Beta 1 consolidated business RPCs.
-- Scope: final internal business RPCs and the controlled public tracking RPC.

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
      raise exception 'Transicion de estado no permitida.';
    end if;
  elsif v_estado_anterior = 'en_revision'::public.solicitud_estado then
    if p_estado_nuevo not in (
      'contactada'::public.solicitud_estado,
      'rechazada'::public.solicitud_estado
    ) then
      raise exception 'Transicion de estado no permitida.';
    end if;
  elsif v_estado_anterior = 'contactada'::public.solicitud_estado then
    if p_estado_nuevo not in (
      'aprobada'::public.solicitud_estado,
      'rechazada'::public.solicitud_estado
    ) then
      raise exception 'Transicion de estado no permitida.';
    end if;
  elsif v_estado_anterior = 'aprobada'::public.solicitud_estado then
    if p_estado_nuevo <> 'rechazada'::public.solicitud_estado then
      raise exception 'Transicion de estado no permitida.';
    end if;
  else
    raise exception 'Transicion de estado no permitida.';
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

revoke all on function public.actualizar_estado_solicitud(uuid, public.solicitud_estado)
from public, anon, authenticated;

grant execute on function public.actualizar_estado_solicitud(uuid, public.solicitud_estado)
to authenticated;

create or replace function public.crear_cliente_desde_solicitud(
  p_solicitud_id uuid
)
returns public.clientes
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_solicitud public.solicitudes;
  v_cliente public.clientes;
  v_name text;
  v_phone text;
  v_email text;
  v_notes text;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado.';
  end if;

  if not private.current_user_is_active() then
    raise exception 'Usuario inactivo o sin perfil valido.';
  end if;

  if not private.is_admin_or_supervisor() then
    raise exception 'No tienes permiso para crear clientes desde solicitudes.';
  end if;

  select *
  into v_solicitud
  from public.solicitudes
  where id = p_solicitud_id
  for update;

  if not found then
    raise exception 'La solicitud no existe.';
  end if;

  if v_solicitud.cliente_id is not null then
    raise exception 'Esta solicitud ya tiene un cliente asociado.';
  end if;

  v_name := btrim(regexp_replace(v_solicitud.client_name, '[[:space:]]+', ' ', 'g'));
  v_phone := btrim(regexp_replace(v_solicitud.client_phone, '[[:space:]]+', ' ', 'g'));
  v_email := nullif(
    lower(btrim(regexp_replace(coalesce(v_solicitud.client_email, ''), '[[:space:]]+', ' ', 'g'))),
    ''
  );
  v_notes :=
    'Cliente creado desde la solicitud ' ||
    upper(left(v_solicitud.id::text, 8)) ||
    '.';

  if v_name = '' then
    raise exception 'El nombre es obligatorio.';
  end if;

  if char_length(v_name) > 120 then
    raise exception 'El nombre no puede superar 120 caracteres.';
  end if;

  if v_phone = '' then
    raise exception 'El telefono es obligatorio.';
  end if;

  if char_length(v_phone) > 40 then
    raise exception 'El telefono no puede superar 40 caracteres.';
  end if;

  if v_email is not null and char_length(v_email) > 160 then
    raise exception 'El correo electronico no puede superar 160 caracteres.';
  end if;

  if v_email is not null
    and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Ingresa un correo electronico valido.';
  end if;

  insert into public.clientes (
    name,
    phone,
    email,
    notes
  )
  values (
    v_name,
    v_phone,
    v_email,
    v_notes
  )
  returning * into v_cliente;

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
    v_solicitud.id,
    auth.uid(),
    'cliente_creado_desde_solicitud'::public.solicitud_historial_action,
    'Cliente creado desde la solicitud: ' || v_cliente.name,
    null,
    v_cliente.name,
    jsonb_build_object(
      'cliente_id', v_cliente.id,
      'client_name', v_cliente.name
    )
  );

  update public.solicitudes
  set cliente_id = v_cliente.id
  where id = v_solicitud.id;

  return v_cliente;
end;
$$;

revoke all on function public.crear_cliente_desde_solicitud(uuid)
from public, anon, authenticated;

grant execute on function public.crear_cliente_desde_solicitud(uuid)
to authenticated;

create or replace function public.convertir_solicitud_a_pedido(
  p_solicitud_id uuid,
  p_title text,
  p_description text,
  p_priority public.pedido_prioridad,
  p_estimated_delivery_date date,
  p_total_amount numeric
)
returns public.pedidos
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_solicitud public.solicitudes;
  v_pedido public.pedidos;
  v_title text := btrim(p_title);
  v_description text := btrim(p_description);
  v_business_date date := private.current_business_date();
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado.';
  end if;

  if not private.current_user_is_active() then
    raise exception 'Usuario inactivo o sin perfil valido.';
  end if;

  if not private.is_admin_or_supervisor() then
    raise exception 'No tienes permiso para convertir solicitudes en pedidos.';
  end if;

  if p_priority is null then
    raise exception 'Selecciona una prioridad valida.';
  end if;

  if p_estimated_delivery_date is not null
    and p_estimated_delivery_date < v_business_date then
    raise exception 'La fecha estimada de entrega no puede ser anterior al dia actual.';
  end if;

  if p_total_amount is null then
    raise exception 'El precio total es obligatorio.';
  end if;

  if p_total_amount < 0 then
    raise exception 'El precio total no puede ser negativo.';
  end if;

  if p_total_amount <> round(p_total_amount, 2) then
    raise exception 'El precio total no puede tener mas de 2 decimales.';
  end if;

  if p_total_amount > 9999999999.99 then
    raise exception 'El precio total supera el maximo permitido.';
  end if;

  select *
  into v_solicitud
  from public.solicitudes
  where id = p_solicitud_id
  for update;

  if not found then
    raise exception 'La solicitud no existe.';
  end if;

  if v_solicitud.converted_order_id is not null then
    raise exception 'Esta solicitud ya fue convertida en pedido.';
  end if;

  if exists (
    select 1
    from public.pedidos
    where solicitud_id = v_solicitud.id
  ) then
    raise exception 'Esta solicitud ya tiene un pedido asociado.';
  end if;

  if v_solicitud.status <> 'aprobada'::public.solicitud_estado then
    raise exception 'La solicitud debe estar aprobada antes de convertirse en pedido.';
  end if;

  if v_solicitud.cliente_id is null then
    raise exception 'Asocia un cliente antes de convertir esta solicitud en pedido.';
  end if;

  if v_solicitud.workflow_type = 'impresion'::public.workflow_type then
    if v_title is null or v_title = '' then
      v_title := 'Pedido de impresion';
    end if;

    if v_description is null or v_description = '' then
      v_description := btrim(v_solicitud.description);
    end if;
  else
    if v_title is null or v_title = '' then
      raise exception 'El titulo del pedido es obligatorio.';
    end if;

    if v_description is null or v_description = '' then
      raise exception 'La descripcion del pedido es obligatoria.';
    end if;
  end if;

  if v_title is null or v_title = '' then
    raise exception 'El titulo del pedido es obligatorio.';
  end if;

  if char_length(v_title) > 160 then
    raise exception 'El titulo del pedido no puede superar 160 caracteres.';
  end if;

  if v_description is null or v_description = '' then
    raise exception 'La descripcion del pedido es obligatoria.';
  end if;

  if char_length(v_description) > 3000 then
    raise exception 'La descripcion del pedido no puede superar 3000 caracteres.';
  end if;

  insert into public.pedidos (
    cliente_id,
    solicitud_id,
    public_reference,
    workflow_type,
    title,
    description,
    status,
    priority,
    estimated_delivery_date,
    created_by
  )
  values (
    v_solicitud.cliente_id,
    v_solicitud.id,
    v_solicitud.public_reference,
    v_solicitud.workflow_type,
    v_title,
    v_description,
    'solicitud_recibida'::public.pedido_estado,
    p_priority,
    p_estimated_delivery_date,
    auth.uid()
  )
  returning * into v_pedido;

  insert into public.pedido_pagos (
    pedido_id,
    total_amount,
    paid_cash_amount,
    paid_transfer_amount,
    created_by,
    updated_by
  )
  values (
    v_pedido.id,
    p_total_amount,
    0,
    0,
    auth.uid(),
    auth.uid()
  );

  update public.solicitudes
  set
    status = 'convertida'::public.solicitud_estado,
    converted_order_id = v_pedido.id,
    reviewed_by = auth.uid(),
    updated_at = now()
  where id = v_solicitud.id;

  update public.archivos
  set pedido_id = v_pedido.id
  where solicitud_id = v_solicitud.id
    and pedido_id is null
    and visibility = 'cliente_solicitud'::public.archivo_visibility;

  return v_pedido;
end;
$$;

revoke all on function public.convertir_solicitud_a_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) from public, anon, authenticated;

grant execute on function public.convertir_solicitud_a_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) to authenticated;

create or replace function public.crear_pedido_manual(
  p_workflow_type public.workflow_type,
  p_cliente_id uuid,
  p_title text,
  p_description text,
  p_priority public.pedido_prioridad,
  p_estimated_delivery_date date,
  p_total_amount numeric
)
returns table (
  pedido_id uuid,
  order_number text,
  public_reference text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_pedido public.pedidos;
  v_title text := btrim(p_title);
  v_description text := btrim(p_description);
  v_business_date date := private.current_business_date();
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado.';
  end if;

  if not private.current_user_is_active() then
    raise exception 'Usuario inactivo o sin perfil valido.';
  end if;

  if not private.is_admin_or_supervisor() then
    raise exception 'No tienes permiso para crear pedidos.';
  end if;

  if p_workflow_type is null then
    raise exception 'Selecciona si el pedido es un encargo o una impresion.';
  end if;

  if p_cliente_id is not null and not exists (
    select 1
    from public.clientes as c
    where c.id = p_cliente_id
  ) then
    raise exception 'El cliente seleccionado no existe o no esta disponible.';
  end if;

  if v_title is null or v_title = '' then
    raise exception 'El titulo del pedido es obligatorio.';
  end if;

  if char_length(v_title) > 160 then
    raise exception 'El titulo del pedido no puede superar 160 caracteres.';
  end if;

  if v_description is null or v_description = '' then
    raise exception 'La descripcion del pedido es obligatoria.';
  end if;

  if char_length(v_description) > 3000 then
    raise exception 'La descripcion del pedido no puede superar 3000 caracteres.';
  end if;

  if p_priority is null then
    raise exception 'Selecciona una prioridad valida.';
  end if;

  if p_estimated_delivery_date is not null
    and p_estimated_delivery_date < v_business_date then
    raise exception 'La fecha estimada de entrega no puede ser anterior al dia actual.';
  end if;

  if p_total_amount is null then
    raise exception 'El precio total es obligatorio.';
  end if;

  if p_total_amount < 0 then
    raise exception 'El precio total no puede ser negativo.';
  end if;

  if p_total_amount <> round(p_total_amount, 2) then
    raise exception 'El precio total admite como maximo 2 decimales.';
  end if;

  if p_total_amount > 9999999999.99 then
    raise exception 'El precio total supera el maximo permitido.';
  end if;

  insert into public.pedidos (
    workflow_type,
    cliente_id,
    solicitud_id,
    title,
    description,
    status,
    priority,
    estimated_delivery_date,
    created_by
  )
  values (
    p_workflow_type,
    p_cliente_id,
    null,
    v_title,
    v_description,
    'creado'::public.pedido_estado,
    p_priority,
    p_estimated_delivery_date,
    auth.uid()
  )
  returning * into v_pedido;

  insert into public.pedido_pagos (
    pedido_id,
    total_amount,
    paid_cash_amount,
    paid_transfer_amount,
    created_by,
    updated_by
  )
  values (
    v_pedido.id,
    p_total_amount,
    0,
    0,
    auth.uid(),
    auth.uid()
  );

  return query
  select
    v_pedido.id,
    v_pedido.order_number,
    v_pedido.public_reference;
end;
$$;

revoke all on function public.crear_pedido_manual(
  public.workflow_type,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) from public, anon, authenticated;

grant execute on function public.crear_pedido_manual(
  public.workflow_type,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) to authenticated;

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

revoke all on function public.actualizar_estado_pedido(uuid, public.pedido_estado)
from public, anon, authenticated;

grant execute on function public.actualizar_estado_pedido(uuid, public.pedido_estado)
to authenticated;

create or replace function public.aplicar_plantilla_tareas_pedido(
  p_pedido_id uuid,
  p_template_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor_id uuid := auth.uid();
  v_pedido record;
  v_template record;
  v_template_task_count integer;
  v_max_sort_order integer;
  v_inserted_count integer;
begin
  if v_actor_id is null or not private.current_user_is_active() then
    raise exception 'Debes iniciar sesion con un usuario interno activo.';
  end if;

  if p_pedido_id is null then
    raise exception 'El pedido solicitado no existe.';
  end if;

  if p_template_id is null then
    raise exception 'La plantilla seleccionada no existe.';
  end if;

  select p.id, p.workflow_type, p.status
  into v_pedido
  from public.pedidos as p
  where p.id = p_pedido_id
  for update;

  if not found then
    raise exception 'El pedido solicitado no existe.';
  end if;

  if v_pedido.workflow_type <> 'encargo'::public.workflow_type then
    raise exception 'Esta plantilla solo puede aplicarse a pedidos de tipo Encargo.';
  end if;

  if not private.can_manage_pedido_tasks(p_pedido_id) then
    if v_pedido.status not in (
      'creado'::public.pedido_estado,
      'solicitud_recibida'::public.pedido_estado,
      'en_revision'::public.pedido_estado,
      'en_produccion'::public.pedido_estado
    ) then
      raise exception 'No se pueden modificar las tareas de este pedido en su estado actual.';
    end if;

    raise exception 'No tienes permiso para gestionar tareas de este pedido.';
  end if;

  select tp.id, tp.is_active
  into v_template
  from public.trabajo_plantillas as tp
  where tp.id = p_template_id;

  if not found then
    raise exception 'La plantilla seleccionada no existe.';
  end if;

  if not v_template.is_active then
    raise exception 'La plantilla seleccionada no esta activa.';
  end if;

  select count(*)
  into v_template_task_count
  from public.trabajo_plantilla_tareas as tpt
  where tpt.template_id = p_template_id;

  if v_template_task_count = 0 then
    raise exception 'La plantilla seleccionada no tiene tareas para agregar.';
  end if;

  select coalesce(max(pt.sort_order), -1)
  into v_max_sort_order
  from public.pedido_tareas as pt
  where pt.pedido_id = p_pedido_id;

  with ordered_template_tasks as (
    select
      tpt.title,
      tpt.task_type,
      tpt.target_quantity,
      row_number() over (
        order by tpt.sort_order asc, tpt.created_at asc, tpt.id asc
      ) as position
    from public.trabajo_plantilla_tareas as tpt
    where tpt.template_id = p_template_id
  ),
  inserted_tasks as (
    insert into public.pedido_tareas (
      pedido_id,
      title,
      task_type,
      target_quantity,
      completed_quantity,
      is_completed,
      sort_order,
      created_by,
      updated_by,
      completed_by,
      completed_at
    )
    select
      p_pedido_id,
      ott.title,
      ott.task_type,
      ott.target_quantity,
      case
        when ott.task_type = 'cuantificada'::public.pedido_tarea_tipo then 0
        else null
      end,
      false,
      v_max_sort_order + ott.position::integer,
      v_actor_id,
      v_actor_id,
      null::uuid,
      null::timestamptz
    from ordered_template_tasks as ott
    order by ott.position
    returning id
  )
  select count(*)
  into v_inserted_count
  from inserted_tasks;

  return v_inserted_count;
end;
$$;

revoke all on function public.aplicar_plantilla_tareas_pedido(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.aplicar_plantilla_tareas_pedido(uuid, uuid)
to authenticated;

create or replace function public.actualizar_pago_pedido(
  p_pedido_id uuid,
  p_paid_cash_amount numeric,
  p_paid_transfer_amount numeric
)
returns public.pedido_pagos
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_payment public.pedido_pagos;
  v_updated_payment public.pedido_pagos;
  v_paid_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion con un usuario interno activo'
      using errcode = '42501';
  end if;

  if not private.current_user_is_active() then
    raise exception 'Debes iniciar sesion con un usuario interno activo'
      using errcode = '42501';
  end if;

  if not private.is_admin_or_supervisor() then
    raise exception 'No tienes permiso para actualizar pagos de pedidos'
      using errcode = '42501';
  end if;

  if p_pedido_id is null then
    raise exception 'El pedido solicitado no existe'
      using errcode = '22023';
  end if;

  perform 1
  from public.pedidos as p
  where p.id = p_pedido_id
  for update;

  if not found then
    raise exception 'El pedido solicitado no existe'
      using errcode = 'P0002';
  end if;

  select pp.*
  into v_payment
  from public.pedido_pagos as pp
  where pp.pedido_id = p_pedido_id
  for update;

  if not found then
    raise exception 'El pedido no tiene resumen financiero registrado'
      using errcode = 'P0002';
  end if;

  if p_paid_cash_amount is null then
    raise exception 'El monto pagado en efectivo es obligatorio'
      using errcode = '22023';
  end if;

  if p_paid_transfer_amount is null then
    raise exception 'El monto pagado por transferencia es obligatorio'
      using errcode = '22023';
  end if;

  if p_paid_cash_amount < 0 then
    raise exception 'El monto pagado en efectivo no puede ser negativo'
      using errcode = '23514';
  end if;

  if p_paid_transfer_amount < 0 then
    raise exception 'El monto pagado por transferencia no puede ser negativo'
      using errcode = '23514';
  end if;

  if p_paid_cash_amount <> round(p_paid_cash_amount, 2) then
    raise exception 'El monto pagado en efectivo no puede tener mas de 2 decimales'
      using errcode = '23514';
  end if;

  if p_paid_transfer_amount <> round(p_paid_transfer_amount, 2) then
    raise exception 'El monto pagado por transferencia no puede tener mas de 2 decimales'
      using errcode = '23514';
  end if;

  if p_paid_cash_amount > 9999999999.99 then
    raise exception 'El monto pagado en efectivo supera el maximo permitido'
      using errcode = '23514';
  end if;

  if p_paid_transfer_amount > 9999999999.99 then
    raise exception 'El monto pagado por transferencia supera el maximo permitido'
      using errcode = '23514';
  end if;

  v_paid_total := p_paid_cash_amount + p_paid_transfer_amount;

  if v_paid_total > v_payment.total_amount then
    raise exception 'El total pagado no puede superar el total del pedido'
      using errcode = '23514';
  end if;

  update public.pedido_pagos
  set
    paid_cash_amount = p_paid_cash_amount,
    paid_transfer_amount = p_paid_transfer_amount,
    updated_by = auth.uid(),
    updated_at = now()
  where pedido_id = p_pedido_id
  returning *
  into v_updated_payment;

  insert into public.pedido_historial (
    pedido_id,
    action,
    summary,
    old_value,
    new_value,
    metadata,
    actor_id
  )
  values (
    p_pedido_id,
    'pago_actualizado'::public.pedido_historial_action,
    'Pago del pedido actualizado.',
    (v_payment.paid_cash_amount + v_payment.paid_transfer_amount)::text,
    (v_updated_payment.paid_cash_amount + v_updated_payment.paid_transfer_amount)::text,
    jsonb_build_object(
      'total_amount', to_char(v_updated_payment.total_amount, 'FM9999999990.00'),
      'paid_cash_amount', to_char(v_updated_payment.paid_cash_amount, 'FM9999999990.00'),
      'paid_transfer_amount', to_char(v_updated_payment.paid_transfer_amount, 'FM9999999990.00'),
      'payment_status', v_updated_payment.payment_status::text
    ),
    auth.uid()
  );

  return v_updated_payment;
end;
$$;

revoke all on function public.actualizar_pago_pedido(uuid, numeric, numeric)
from public, anon, authenticated;

grant execute on function public.actualizar_pago_pedido(uuid, numeric, numeric)
to authenticated;

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
    and private.current_user_is_active()
    and private.can_access_pedido(p_pedido_id)
  order by pc.created_at asc, pc.id asc;
$$;

revoke all on function public.listar_pedido_comentarios(uuid)
from public, anon, authenticated;

grant execute on function public.listar_pedido_comentarios(uuid)
to authenticated;

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

revoke all on function public.listar_pedido_historial(uuid)
from public, anon, authenticated;

grant execute on function public.listar_pedido_historial(uuid)
to authenticated;

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

revoke all on function public.listar_solicitud_comentarios(uuid)
from public, anon, authenticated;

grant execute on function public.listar_solicitud_comentarios(uuid)
to authenticated;

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

revoke all on function public.listar_solicitud_historial(uuid)
from public, anon, authenticated;

grant execute on function public.listar_solicitud_historial(uuid)
to authenticated;

create or replace function public.consultar_estado_publico(
  p_public_reference text
)
returns table (
  kind text,
  public_reference text,
  workflow_type public.workflow_type,
  status text,
  created_at timestamptz,
  desired_date date,
  estimated_delivery_date date,
  actual_delivery_date date,
  progress_percentage integer,
  progress_label text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_public_reference text := upper(btrim(coalesce(p_public_reference, '')));
  v_pedido public.pedidos;
  v_solicitud public.solicitudes;
  v_task_count integer;
  v_progress_percentage integer;
begin
  if v_public_reference !~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    return;
  end if;

  select *
  into v_pedido
  from public.pedidos as p
  where p.public_reference = v_public_reference
  limit 1;

  if found then
    if v_pedido.workflow_type = 'impresion'::public.workflow_type then
      v_task_count := 0;
      v_progress_percentage := null;
    else
      select
        count(*)::integer,
        round(avg(
          case
            when pt.task_type = 'simple'::public.pedido_tarea_tipo then
              case when pt.is_completed then 100 else 0 end
            when pt.target_quantity is null or pt.target_quantity <= 0 then
              0
            else
              least(
                greatest(
                  ((coalesce(pt.completed_quantity, 0)::numeric / pt.target_quantity::numeric) * 100),
                  0
                ),
                100
              )
          end
        ))::integer
      into v_task_count, v_progress_percentage
      from public.pedido_tareas as pt
      where pt.pedido_id = v_pedido.id;

      v_task_count := coalesce(v_task_count, 0);
      v_progress_percentage := coalesce(v_progress_percentage, 0);
    end if;

    return query
    select
      'pedido'::text,
      v_pedido.public_reference,
      v_pedido.workflow_type,
      v_pedido.status::text,
      v_pedido.created_at,
      null::date,
      v_pedido.estimated_delivery_date,
      v_pedido.actual_delivery_date,
      case
        when v_pedido.workflow_type = 'impresion'::public.workflow_type then null::integer
        else v_progress_percentage
      end,
      case
        when v_pedido.workflow_type = 'impresion'::public.workflow_type then
          'Flujo directo de impresion'
        when v_task_count > 0 then
          'Progreso de produccion'
        else
          'Sin tareas registradas'
      end;

    return;
  end if;

  select *
  into v_solicitud
  from public.solicitudes as s
  where s.public_reference = v_public_reference
  limit 1;

  if not found then
    return;
  end if;

  if v_solicitud.converted_order_id is not null then
    select *
    into v_pedido
    from public.pedidos as p
    where p.id = v_solicitud.converted_order_id
    limit 1;

    if found then
      if v_pedido.workflow_type = 'impresion'::public.workflow_type then
        v_task_count := 0;
        v_progress_percentage := null;
      else
        select
          count(*)::integer,
          round(avg(
            case
              when pt.task_type = 'simple'::public.pedido_tarea_tipo then
                case when pt.is_completed then 100 else 0 end
              when pt.target_quantity is null or pt.target_quantity <= 0 then
                0
              else
                least(
                  greatest(
                    ((coalesce(pt.completed_quantity, 0)::numeric / pt.target_quantity::numeric) * 100),
                    0
                  ),
                  100
                )
            end
          ))::integer
        into v_task_count, v_progress_percentage
        from public.pedido_tareas as pt
        where pt.pedido_id = v_pedido.id;

        v_task_count := coalesce(v_task_count, 0);
        v_progress_percentage := coalesce(v_progress_percentage, 0);
      end if;

      return query
      select
        'pedido'::text,
        v_pedido.public_reference,
        v_pedido.workflow_type,
        v_pedido.status::text,
        v_pedido.created_at,
        null::date,
        v_pedido.estimated_delivery_date,
        v_pedido.actual_delivery_date,
        case
          when v_pedido.workflow_type = 'impresion'::public.workflow_type then null::integer
          else v_progress_percentage
        end,
        case
          when v_pedido.workflow_type = 'impresion'::public.workflow_type then
            'Flujo directo de impresion'
          when v_task_count > 0 then
            'Progreso de produccion'
          else
            'Sin tareas registradas'
        end;

      return;
    end if;
  end if;

  return query
  select
    'solicitud'::text,
    v_solicitud.public_reference,
    v_solicitud.workflow_type,
    v_solicitud.status::text,
    v_solicitud.created_at,
    v_solicitud.desired_date,
    null::date,
    null::date,
    null::integer,
    null::text;
end;
$$;

revoke all on function public.consultar_estado_publico(text)
from public, anon, authenticated;

grant execute on function public.consultar_estado_publico(text)
to anon, authenticated;
