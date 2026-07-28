drop function if exists public.actualizar_datos_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
);

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
