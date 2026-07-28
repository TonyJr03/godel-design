drop function if exists public.crear_pedido_manual(
  public.workflow_type,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
);

drop function if exists public.convertir_solicitud_a_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
);

create or replace function public.convertir_solicitud_a_pedido(
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

create or replace function public.crear_pedido_manual(
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

do $$
begin
  if to_regprocedure(
    'public.crear_pedido_manual(public.workflow_type, uuid, text, text, public.pedido_prioridad, date, numeric)'
  ) is not null then
    raise exception 'Unexpected legacy crear_pedido_manual(workflow_type, ...) signature.';
  end if;

  if to_regprocedure(
    'public.convertir_solicitud_a_pedido(uuid, text, text, public.pedido_prioridad, date, numeric)'
  ) is not null then
    raise exception 'Unexpected legacy convertir_solicitud_a_pedido(...) signature.';
  end if;

  if to_regprocedure(
    'public.crear_pedido_manual(uuid, uuid, text, text, public.pedido_prioridad, date, numeric)'
  ) is null then
    raise exception 'Missing service_id crear_pedido_manual signature.';
  end if;

  if to_regprocedure(
    'public.convertir_solicitud_a_pedido(uuid, uuid, text, text, public.pedido_prioridad, date, numeric)'
  ) is null then
    raise exception 'Missing service_id convertir_solicitud_a_pedido signature.';
  end if;

  if has_function_privilege(
    'anon',
    'public.crear_pedido_manual(uuid, uuid, text, text, public.pedido_prioridad, date, numeric)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous role must not execute crear_pedido_manual.';
  end if;

  if has_function_privilege(
    'anon',
    'public.convertir_solicitud_a_pedido(uuid, uuid, text, text, public.pedido_prioridad, date, numeric)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous role must not execute convertir_solicitud_a_pedido.';
  end if;
end;
$$;
