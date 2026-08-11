-- Baseline final 03 - Business RPCs.
-- Contains final business RPCs, public tracking and the upload control plane.

create function public.actualizar_estado_solicitud(
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

create function public.crear_cliente_desde_solicitud(
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


create function public.convertir_solicitud_a_pedido(
  p_solicitud_id uuid,
  p_service_id uuid,
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
  v_service public.tipos_servicio;
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

  if p_service_id is null then
    raise exception 'El servicio seleccionado no existe.';
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

  select *
  into v_service
  from public.tipos_servicio
  where id = p_service_id;

  if not found then
    raise exception 'El servicio seleccionado no existe.';
  end if;

  if v_service.workflow_type <> v_solicitud.workflow_type then
    raise exception 'El servicio seleccionado no corresponde al tipo de trabajo de la solicitud.';
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
    service_id,
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
    v_service.id,
    v_service.workflow_type,
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
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) from public, anon, authenticated;

grant execute on function public.convertir_solicitud_a_pedido(
  uuid,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) to authenticated;

create function public.crear_pedido_manual(
  p_service_id uuid,
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
  v_service public.tipos_servicio;
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

  if p_service_id is null then
    raise exception 'El servicio seleccionado no existe.';
  end if;

  select *
  into v_service
  from public.tipos_servicio
  where id = p_service_id;

  if not found then
    raise exception 'El servicio seleccionado no existe.';
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
    service_id,
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
    v_service.id,
    v_service.workflow_type,
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
  uuid,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) from public, anon, authenticated;

grant execute on function public.crear_pedido_manual(
  uuid,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) to authenticated;

comment on function public.convertir_solicitud_a_pedido(
  uuid,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) is 'Convierte una solicitud aprobada en pedido usando un tipo de servicio interno del mismo workflow.';

comment on function public.crear_pedido_manual(
  uuid,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) is 'Crea pedidos manuales con service_id; el workflow operativo se sincroniza desde tipos_servicio.';

create function public.actualizar_estado_pedido(
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


create function public.actualizar_datos_pedido(
  p_pedido_id uuid,
  p_service_id uuid,
  p_title text,
  p_description text,
  p_priority public.pedido_prioridad,
  p_estimated_delivery_date date,
  p_total_amount numeric
)
returns table (
  pedido_id uuid,
  service_id uuid,
  workflow_type public.workflow_type,
  title text,
  description text,
  priority public.pedido_prioridad,
  estimated_delivery_date date,
  total_amount numeric(12,2),
  payment_status public.pedido_pago_estado,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_pedido public.pedidos;
  v_service public.tipos_servicio;
  v_payment public.pedido_pagos;
  v_updated_payment public.pedido_pagos;
  v_title text := btrim(p_title);
  v_description text := btrim(p_description);
  v_business_date date := private.current_business_date();
  v_paid_total numeric;
  v_changed_fields text[] := array[]::text[];
  v_changed_labels text[] := array[]::text[];
  v_metadata jsonb := jsonb_build_object('source', 'actualizar_datos_pedido');
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
    raise exception 'No tienes permiso para actualizar datos de pedidos'
      using errcode = '42501';
  end if;

  if p_service_id is null then
    raise exception 'El servicio seleccionado no existe'
      using errcode = '22023';
  end if;

  if v_title is null or v_title = '' then
    raise exception 'El titulo del pedido es obligatorio'
      using errcode = '22023';
  end if;

  if char_length(v_title) > 160 then
    raise exception 'El titulo del pedido no puede superar 160 caracteres'
      using errcode = '23514';
  end if;

  if v_description is null or v_description = '' then
    raise exception 'La descripcion del pedido es obligatoria'
      using errcode = '22023';
  end if;

  if char_length(v_description) > 3000 then
    raise exception 'La descripcion del pedido no puede superar 3000 caracteres'
      using errcode = '23514';
  end if;

  if p_priority is null then
    raise exception 'Selecciona una prioridad valida'
      using errcode = '22023';
  end if;

  if p_total_amount is null then
    raise exception 'El precio total es obligatorio'
      using errcode = '22023';
  end if;

  if p_total_amount < 0 then
    raise exception 'El precio total no puede ser negativo'
      using errcode = '23514';
  end if;

  if p_total_amount <> round(p_total_amount, 2) then
    raise exception 'El precio total no puede tener mas de 2 decimales'
      using errcode = '23514';
  end if;

  if p_total_amount > 9999999999.99 then
    raise exception 'El precio total supera el maximo permitido'
      using errcode = '23514';
  end if;

  select p.*
  into v_pedido
  from public.pedidos as p
  where p.id = p_pedido_id
  for update;

  if not found then
    raise exception 'El pedido solicitado no existe'
      using errcode = 'P0002';
  end if;

  select ts.*
  into v_service
  from public.tipos_servicio as ts
  where ts.id = p_service_id;

  if not found then
    raise exception 'El servicio seleccionado no existe'
      using errcode = 'P0002';
  end if;

  if v_service.workflow_type is distinct from v_pedido.workflow_type then
    raise exception 'El servicio seleccionado no corresponde al tipo de trabajo del pedido'
      using errcode = '23514';
  end if;

  select pp.*
  into v_payment
  from public.pedido_pagos as pp
  where pp.pedido_id = v_pedido.id
  for update;

  if not found then
    raise exception 'El pedido no tiene resumen financiero registrado'
      using errcode = 'P0002';
  end if;

  if v_pedido.status in (
    'entregado'::public.pedido_estado,
    'cancelado'::public.pedido_estado
  ) then
    raise exception 'No se pueden editar datos de un pedido cerrado'
      using errcode = '23514';
  end if;

  if p_estimated_delivery_date is distinct from v_pedido.estimated_delivery_date
    and p_estimated_delivery_date is not null
    and p_estimated_delivery_date < v_business_date then
    raise exception 'La fecha estimada de entrega no puede ser anterior al dia actual'
      using errcode = '23514';
  end if;

  v_paid_total := v_payment.paid_cash_amount + v_payment.paid_transfer_amount;

  if p_total_amount < v_paid_total then
    raise exception 'El precio total no puede ser menor que el total pagado'
      using errcode = '23514';
  end if;

  if p_service_id is distinct from v_pedido.service_id then
    v_changed_fields := array_append(v_changed_fields, 'service_id');
    v_changed_labels := array_append(v_changed_labels, 'servicio');
    v_metadata := v_metadata || jsonb_build_object(
      'service',
      jsonb_build_object(
        'old_id', v_pedido.service_id,
        'old_name', (
          select old_service.name
          from public.tipos_servicio as old_service
          where old_service.id = v_pedido.service_id
        ),
        'new_id', v_service.id,
        'new_name', v_service.name
      )
    );
  end if;

  if v_title is distinct from v_pedido.title then
    v_changed_fields := array_append(v_changed_fields, 'title');
    v_changed_labels := array_append(v_changed_labels, 'titulo');
    v_metadata := v_metadata || jsonb_build_object(
      'title',
      jsonb_build_object('old', v_pedido.title, 'new', v_title)
    );
  end if;

  if v_description is distinct from v_pedido.description then
    v_changed_fields := array_append(v_changed_fields, 'description');
    v_changed_labels := array_append(v_changed_labels, 'descripcion');
    v_metadata := v_metadata || jsonb_build_object(
      'description',
      jsonb_build_object('changed', true)
    );
  end if;

  if p_priority is distinct from v_pedido.priority then
    v_changed_fields := array_append(v_changed_fields, 'priority');
    v_changed_labels := array_append(v_changed_labels, 'prioridad');
    v_metadata := v_metadata || jsonb_build_object(
      'priority',
      jsonb_build_object(
        'old', v_pedido.priority::text,
        'new', p_priority::text
      )
    );
  end if;

  if p_estimated_delivery_date is distinct from v_pedido.estimated_delivery_date then
    v_changed_fields := array_append(v_changed_fields, 'estimated_delivery_date');
    v_changed_labels := array_append(v_changed_labels, 'fecha estimada');
    v_metadata := v_metadata || jsonb_build_object(
      'estimated_delivery_date',
      jsonb_build_object(
        'old', v_pedido.estimated_delivery_date,
        'new', p_estimated_delivery_date
      )
    );
  end if;

  if p_total_amount is distinct from v_payment.total_amount then
    v_changed_fields := array_append(v_changed_fields, 'total_amount');
    v_changed_labels := array_append(v_changed_labels, 'precio');
    v_metadata := v_metadata || jsonb_build_object(
      'total_amount',
      jsonb_build_object(
        'old', v_payment.total_amount,
        'new', p_total_amount
      )
    );
  end if;

  if array_length(v_changed_fields, 1) is null then
    return query
    select
      v_pedido.id,
      v_pedido.service_id,
      v_pedido.workflow_type,
      v_pedido.title,
      v_pedido.description,
      v_pedido.priority,
      v_pedido.estimated_delivery_date,
      v_payment.total_amount,
      v_payment.payment_status,
      v_payment.paid_at;

    return;
  end if;

  update public.pedidos as p
  set
    service_id = p_service_id,
    title = v_title,
    description = v_description,
    priority = p_priority,
    estimated_delivery_date = p_estimated_delivery_date
  where p.id = v_pedido.id
  returning p.*
  into v_pedido;

  if p_total_amount is distinct from v_payment.total_amount then
    update public.pedido_pagos as pp
    set
      total_amount = p_total_amount,
      updated_by = auth.uid()
    where pp.pedido_id = v_pedido.id
    returning pp.*
    into v_updated_payment;
  else
    v_updated_payment := v_payment;
  end if;

  v_metadata := v_metadata || jsonb_build_object(
    'changed_fields',
    to_jsonb(v_changed_fields)
  );

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
    v_pedido.id,
    'pedido_actualizado'::public.pedido_historial_action,
    'Datos del pedido actualizados: ' || array_to_string(v_changed_labels, ', ') || '.',
    null,
    null,
    v_metadata,
    auth.uid()
  );

  return query
  select
    v_pedido.id,
    v_pedido.service_id,
    v_pedido.workflow_type,
    v_pedido.title,
    v_pedido.description,
    v_pedido.priority,
    v_pedido.estimated_delivery_date,
    v_updated_payment.total_amount,
    v_updated_payment.payment_status,
    v_updated_payment.paid_at;
end;
$$;

revoke all on function public.actualizar_datos_pedido(
  uuid,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
)
from public, anon, authenticated;

grant execute on function public.actualizar_datos_pedido(
  uuid,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
)
to authenticated;

comment on function public.actualizar_datos_pedido(
  uuid,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) is
  'Actualiza servicio, datos basicos de pedido y total financiero con auditoria transaccional.';

create function public.aplicar_plantilla_tareas_pedido(
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

create function public.actualizar_pago_pedido(
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

create function public.listar_pedido_comentarios(
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

create function public.listar_pedido_historial(
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

create function public.listar_solicitud_comentarios(
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

create function public.listar_solicitud_historial(
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

create function public.consultar_estado_publico(
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

create function private.upload_public_token_hash(p_public_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_public_token ~ '^[A-Za-z0-9_-]{43}$'
      then lower(pg_catalog.encode(extensions.digest(p_public_token, 'sha256'), 'hex'))
    else null
  end;
$$;

create function private.is_valid_upload_safe_name(
  p_safe_name text,
  p_original_name text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_safe_name is not null
    and p_safe_name ~ '^[a-z0-9][a-z0-9_-]{0,118}\.(pdf|jpg|jpeg|png|webp|doc|docx|zip|rar|cdr)$'
    and p_safe_name !~ '[[:cntrl:]]'
    and p_safe_name !~ E'[/\\\\]'
    and lower(regexp_replace(p_safe_name, '^.*\.', '')) =
      lower(regexp_replace(p_original_name, '^.*\.', ''));
$$;

create function private.validate_upload_reservation_items(p_items jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_original_name text;
  v_safe_name text;
  v_normalized_mime text;
  v_expected_size bigint;
begin
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'invalid_upload_items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or (select count(*) from jsonb_object_keys(v_item)) <> 4
      or not (v_item ?& array['original_name', 'safe_name', 'normalized_mime', 'expected_size'])
      or exists (
        select 1 from jsonb_object_keys(v_item) as key_name
        where key_name not in ('original_name', 'safe_name', 'normalized_mime', 'expected_size')
      )
      or jsonb_typeof(v_item -> 'original_name') <> 'string'
      or jsonb_typeof(v_item -> 'safe_name') <> 'string'
      or jsonb_typeof(v_item -> 'normalized_mime') <> 'string'
      or jsonb_typeof(v_item -> 'expected_size') <> 'number'
      or (v_item ->> 'expected_size') !~ '^[0-9]+$' then
      raise exception 'invalid_upload_items' using errcode = '22023';
    end if;

    v_original_name := v_item ->> 'original_name';
    v_safe_name := v_item ->> 'safe_name';
    v_normalized_mime := v_item ->> 'normalized_mime';
    v_expected_size := (v_item ->> 'expected_size')::bigint;
    if not private.is_valid_upload_file_descriptor(v_original_name, v_normalized_mime, v_expected_size)
      or not private.is_valid_upload_safe_name(v_safe_name, v_original_name) then
      raise exception 'invalid_upload_items' using errcode = '22023';
    end if;
  end loop;
end;
$$;

create function private.insert_upload_reservation_items(
  p_session_id uuid,
  p_items jsonb,
  p_visibility public.archivo_visibility
)
returns table (
  sort_order smallint,
  item_id uuid,
  object_path text,
  original_name text,
  normalized_mime text,
  expected_size bigint,
  visibility public.archivo_visibility
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_item_id uuid;
  v_sort_order smallint := 0;
  v_safe_name text;
  v_nonce text;
begin
  perform private.validate_upload_reservation_items(p_items);
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := gen_random_uuid();
    v_safe_name := v_item ->> 'safe_name';
    v_nonce := replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '');

    insert into public.archivo_carga_items (
      id, session_id, sort_order, object_path, original_name,
      normalized_mime, expected_size, visibility
    ) values (
      v_item_id, p_session_id, v_sort_order,
      'cargas/v1/' || p_session_id::text || '/' || v_item_id::text || '/' ||
        v_nonce || '-' || v_safe_name,
      v_item ->> 'original_name', v_item ->> 'normalized_mime',
      (v_item ->> 'expected_size')::bigint, p_visibility
    );

    sort_order := v_sort_order;
    item_id := v_item_id;
    object_path := 'cargas/v1/' || p_session_id::text || '/' || v_item_id::text ||
      '/' || v_nonce || '-' || v_safe_name;
    original_name := v_item ->> 'original_name';
    normalized_mime := v_item ->> 'normalized_mime';
    expected_size := (v_item ->> 'expected_size')::bigint;
    visibility := p_visibility;
    return next;
    v_sort_order := v_sort_order + 1;
  end loop;
end;
$$;

create function private.assert_upload_storage_object(
  p_object_path text,
  p_expected_size bigint,
  p_normalized_mime text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_metadata jsonb;
  v_size_text text;
  v_mime text;
begin
  select o.metadata into v_metadata
  from storage.objects as o
  where o.bucket_id = 'godel-files' and o.name = p_object_path;
  if not found then raise exception 'object_not_ready' using errcode = 'P0001'; end if;

  v_size_text := v_metadata ->> 'size';
  v_mime := v_metadata ->> 'mimetype';
  if v_size_text is null or v_size_text !~ '^[0-9]+$'
    or v_size_text::bigint <> p_expected_size
    or (v_mime is not null and v_mime <> p_normalized_mime) then
    raise exception 'object_mismatch' using errcode = 'P0001';
  end if;
end;
$$;

create function private.refresh_upload_session_completion(p_session_id uuid)
returns public.archivo_carga_sesion_estado
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_all_committed boolean;
  v_status public.archivo_carga_sesion_estado;
begin
  select not exists (
    select 1 from public.archivo_carga_items as i
    where i.session_id = p_session_id
      and i.status <> 'committed'::public.archivo_carga_item_estado
  ) into v_all_committed;

  update public.archivo_carga_sesiones as s
  set status = case when v_all_committed then 'completed'::public.archivo_carga_sesion_estado
                    else 'open'::public.archivo_carga_sesion_estado end,
      completed_at = case when v_all_committed then now() else null end
  where s.id = p_session_id
  returning s.status into v_status;
  return v_status;
end;
$$;

create function public.crear_solicitud_publica_con_reserva_carga(
  p_public_reference text,
  p_service_id uuid,
  p_client_name text,
  p_client_phone text,
  p_public_token_hash text,
  p_items jsonb,
  p_client_email text default null,
  p_description text default null,
  p_desired_date date default null,
  p_notes text default null,
  p_print_copies integer default null,
  p_print_color_mode text default null,
  p_print_paper_size text default null,
  p_print_sides text default null
)
returns table (
  solicitud_id uuid,
  public_reference text,
  session_id uuid,
  expires_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow public.workflow_type;
  v_service_name text;
  v_description text;
  v_solicitud_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '4 hours';
begin
  if auth.uid() is not null
    or p_public_reference is null
    or p_public_reference !~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$'
    or p_public_token_hash is null or p_public_token_hash !~ '^[0-9a-f]{64}$'
    or p_client_name is null
    or char_length(btrim(p_client_name)) not between 1 and 120
    or p_client_phone is null
    or char_length(btrim(p_client_phone)) not between 1 and 40
    or (p_client_email is not null and (
      char_length(btrim(p_client_email)) not between 3 and 254
      or btrim(p_client_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
    or (p_notes is not null and char_length(btrim(p_notes)) > 1000) then
    raise exception 'invalid_public_request' using errcode = '22023';
  end if;
  perform private.validate_upload_reservation_items(p_items);

  select ts.workflow_type, ts.name into v_workflow, v_service_name
  from public.tipos_servicio as ts
  where ts.id = p_service_id and ts.is_publicly_available = true;
  if not found then raise exception 'invalid_public_request' using errcode = '22023'; end if;

  if v_workflow = 'encargo'::public.workflow_type then
    if p_description is null
      or char_length(btrim(p_description)) not between 1 and 2000
      or (p_desired_date is not null and p_desired_date < private.current_business_date())
      or p_print_copies is not null or p_print_color_mode is not null
      or p_print_paper_size is not null or p_print_sides is not null then
      raise exception 'invalid_public_request' using errcode = '22023';
    end if;
    v_description := btrim(p_description);
  else
    if p_description is not null or p_desired_date is not null
      or p_print_copies is null or p_print_copies not between 1 and 10000
      or p_print_color_mode is null or p_print_color_mode not in ('blanco_negro', 'color')
      or p_print_paper_size is null or p_print_paper_size not in ('carta', 'a4', 'oficio', 'otro')
      or p_print_sides is null or p_print_sides not in ('una_cara', 'doble_cara') then
      raise exception 'invalid_public_request' using errcode = '22023';
    end if;
    v_description := 'Tipo de trabajo: ' || v_service_name || E'\n\n' ||
      'Cantidad de copias: ' || p_print_copies::text || E'\n' ||
      'Modo de color: ' || case p_print_color_mode
        when 'blanco_negro' then 'Blanco y negro' else 'Color' end || E'\n' ||
      'Tamaño de papel: ' || case p_print_paper_size
        when 'carta' then 'Carta' when 'a4' then 'A4'
        when 'oficio' then 'Oficio' else 'Otro' end || E'\n' ||
      'Caras: ' || case p_print_sides
        when 'una_cara' then 'Una cara' else 'Doble cara' end ||
      E'\n\nObservaciones:\n' || coalesce(nullif(btrim(p_notes), ''), 'Sin observaciones.');
  end if;

  insert into public.solicitudes (
    public_reference, service_id, client_name, client_phone, client_email,
    description, desired_date, notes, workflow_type
  ) values (
    p_public_reference, p_service_id, btrim(p_client_name), btrim(p_client_phone),
    nullif(btrim(p_client_email), ''), v_description,
    case when v_workflow = 'impresion'::public.workflow_type then null else p_desired_date end,
    nullif(btrim(p_notes), ''), v_workflow
  ) returning id into v_solicitud_id;

  insert into public.archivo_carga_sesiones (id, solicitud_id, public_token_hash, expires_at)
  values (v_session_id, v_solicitud_id, p_public_token_hash, v_expires_at);

  select coalesce(jsonb_agg(jsonb_build_object(
    'sort_order', r.sort_order, 'item_id', r.item_id, 'object_path', r.object_path,
    'original_name', r.original_name, 'normalized_mime', r.normalized_mime,
    'expected_size', r.expected_size
  ) order by r.sort_order), '[]'::jsonb)
  into items
  from private.insert_upload_reservation_items(
    v_session_id, p_items, 'cliente_solicitud'::public.archivo_visibility
  ) as r;

  solicitud_id := v_solicitud_id;
  public_reference := p_public_reference;
  session_id := v_session_id;
  expires_at := v_expires_at;
  return next;
end;
$$;

create function public.reservar_carga_pedido(p_pedido_id uuid, p_items jsonb)
returns table (session_id uuid, expires_at timestamptz, items jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_session_id uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '4 hours';
  v_visibility public.archivo_visibility;
begin
  if auth.uid() is null or not private.current_user_is_active() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform private.validate_upload_reservation_items(p_items);
  select p.* into v_pedido from public.pedidos as p where p.id = p_pedido_id for update;
  if not found or not private.can_access_pedido(p_pedido_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_visibility := private.pedido_file_visibility_for_status(v_pedido.status);
  if v_visibility is null then raise exception 'pedido_not_uploadable' using errcode = '22023'; end if;

  insert into public.archivo_carga_sesiones (id, pedido_id, created_by, expires_at)
  values (v_session_id, p_pedido_id, auth.uid(), v_expires_at);
  select coalesce(jsonb_agg(jsonb_build_object(
    'sort_order', r.sort_order, 'item_id', r.item_id, 'object_path', r.object_path,
    'original_name', r.original_name, 'normalized_mime', r.normalized_mime,
    'expected_size', r.expected_size, 'visibility', r.visibility
  ) order by r.sort_order), '[]'::jsonb)
  into items
  from private.insert_upload_reservation_items(v_session_id, p_items, v_visibility) as r;

  session_id := v_session_id;
  expires_at := v_expires_at;
  return next;
end;
$$;

create function public.autorizar_firma_carga_publica(
  p_session_id uuid,
  p_item_id uuid,
  p_public_token text
)
returns table (object_path text, normalized_mime text, expected_size bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_presented_hash text := private.upload_public_token_hash(p_public_token);
begin
  if auth.uid() is not null then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  select i.object_path, i.normalized_mime, i.expected_size
  from public.archivo_carga_sesiones as s
  join public.solicitudes as q on q.id = s.solicitud_id
  join public.archivo_carga_items as i on i.id = p_item_id and i.session_id = s.id
  where s.id = p_session_id and s.solicitud_id is not null and s.pedido_id is null
    and s.created_by is null and s.status = 'open'::public.archivo_carga_sesion_estado
    and s.expires_at > now() and s.public_token_hash = v_presented_hash
    and i.status = 'reserved'::public.archivo_carga_item_estado
    and q.status in ('nueva'::public.solicitud_estado, 'en_revision'::public.solicitud_estado,
      'contactada'::public.solicitud_estado, 'aprobada'::public.solicitud_estado);
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
end;
$$;

create function public.finalizar_carga_publica(
  p_session_id uuid,
  p_item_id uuid,
  p_public_token text
)
returns table (
  result text,
  archivo_id uuid,
  item_status public.archivo_carga_item_estado,
  session_status public.archivo_carga_sesion_estado
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.archivo_carga_sesiones%rowtype;
  v_item public.archivo_carga_items%rowtype;
  v_archivo_id uuid;
  v_presented_hash text := private.upload_public_token_hash(p_public_token);
begin
  if auth.uid() is not null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select s.* into v_session from public.archivo_carga_sesiones as s where s.id = p_session_id for update;
  if not found or v_session.solicitud_id is null or v_session.pedido_id is not null
    or v_session.created_by is not null or v_session.public_token_hash <> v_presented_hash
    or v_session.expires_at <= now() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select i.* into v_item from public.archivo_carga_items as i
  where i.id = p_item_id and i.session_id = v_session.id for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;

  if v_item.status = 'committed'::public.archivo_carga_item_estado then
    result := 'already_committed'; archivo_id := v_item.archivo_id;
    item_status := v_item.status; session_status := v_session.status;
    return next; return;
  end if;
  if v_session.status <> 'open'::public.archivo_carga_sesion_estado
    or v_item.status <> 'reserved'::public.archivo_carga_item_estado
    or not exists (
      select 1 from public.solicitudes as q
      where q.id = v_session.solicitud_id and q.status in (
        'nueva'::public.solicitud_estado, 'en_revision'::public.solicitud_estado,
        'contactada'::public.solicitud_estado, 'aprobada'::public.solicitud_estado
      )
    ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform private.assert_upload_storage_object(v_item.object_path, v_item.expected_size, v_item.normalized_mime);
  insert into public.archivos (solicitud_id, file_name, file_path, file_type, file_size, bucket, visibility)
  values (v_session.solicitud_id, v_item.original_name, v_item.object_path,
    v_item.normalized_mime, v_item.expected_size, 'godel-files', v_item.visibility)
  returning id into v_archivo_id;
  update public.archivo_carga_items set status = 'committed'::public.archivo_carga_item_estado,
    committed_at = now(), archivo_id = v_archivo_id where id = v_item.id;
  result := 'committed'; archivo_id := v_archivo_id;
  item_status := 'committed'::public.archivo_carga_item_estado;
  session_status := private.refresh_upload_session_completion(v_session.id);
  return next;
end;
$$;

create function public.finalizar_carga_pedido(p_session_id uuid, p_item_id uuid)
returns table (
  result text,
  archivo_id uuid,
  item_status public.archivo_carga_item_estado,
  session_status public.archivo_carga_sesion_estado
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.archivo_carga_sesiones%rowtype;
  v_item public.archivo_carga_items%rowtype;
  v_pedido public.pedidos%rowtype;
  v_archivo_id uuid;
  v_visibility public.archivo_visibility;
begin
  if auth.uid() is null or not private.current_user_is_active() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select s.* into v_session from public.archivo_carga_sesiones as s where s.id = p_session_id for update;
  if not found or v_session.pedido_id is null or v_session.solicitud_id is not null
    or v_session.created_by <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select p.* into v_pedido from public.pedidos as p where p.id = v_session.pedido_id for update;
  if not found or not private.can_access_pedido(v_session.pedido_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select i.* into v_item from public.archivo_carga_items as i
  where i.id = p_item_id and i.session_id = v_session.id for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;

  if v_item.status = 'committed'::public.archivo_carga_item_estado then
    result := 'already_committed'; archivo_id := v_item.archivo_id;
    item_status := v_item.status; session_status := v_session.status;
    return next; return;
  end if;
  v_visibility := private.pedido_file_visibility_for_status(v_pedido.status);
  if v_session.status <> 'open'::public.archivo_carga_sesion_estado
    or v_session.expires_at <= now()
    or v_item.status <> 'reserved'::public.archivo_carga_item_estado
    or v_visibility is null or v_item.visibility <> v_visibility then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform private.assert_upload_storage_object(v_item.object_path, v_item.expected_size, v_item.normalized_mime);
  insert into public.archivos (
    pedido_id, file_name, file_path, file_type, file_size, bucket, visibility, uploaded_by
  ) values (
    v_session.pedido_id, v_item.original_name, v_item.object_path,
    v_item.normalized_mime, v_item.expected_size, 'godel-files', v_item.visibility, auth.uid()
  ) returning id into v_archivo_id;
  update public.archivo_carga_items set status = 'committed'::public.archivo_carga_item_estado,
    committed_at = now(), archivo_id = v_archivo_id where id = v_item.id;
  result := 'committed'; archivo_id := v_archivo_id;
  item_status := 'committed'::public.archivo_carga_item_estado;
  session_status := private.refresh_upload_session_completion(v_session.id);
  return next;
end;
$$;

revoke all on function private.upload_public_token_hash(text) from public, anon, authenticated, service_role;
revoke all on function private.is_valid_upload_safe_name(text, text) from public, anon, authenticated, service_role;
revoke all on function private.validate_upload_reservation_items(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.insert_upload_reservation_items(uuid, jsonb, public.archivo_visibility) from public, anon, authenticated, service_role;
revoke all on function private.assert_upload_storage_object(text, bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.refresh_upload_session_completion(uuid) from public, anon, authenticated, service_role;

revoke all on function public.crear_solicitud_publica_con_reserva_carga(text, uuid, text, text, text, jsonb, text, text, date, text, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reservar_carga_pedido(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.autorizar_firma_carga_publica(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.finalizar_carga_publica(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.finalizar_carga_pedido(uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function public.crear_solicitud_publica_con_reserva_carga(text, uuid, text, text, text, jsonb, text, text, date, text, integer, text, text, text) to anon;
grant execute on function public.autorizar_firma_carga_publica(uuid, uuid, text) to anon;
grant execute on function public.finalizar_carga_publica(uuid, uuid, text) to anon;
grant execute on function public.reservar_carga_pedido(uuid, jsonb) to authenticated;
grant execute on function public.finalizar_carga_pedido(uuid, uuid) to authenticated;
