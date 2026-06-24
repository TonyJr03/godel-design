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
) from public;

revoke all on function public.crear_pedido_manual(
  public.workflow_type,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) from anon;

grant execute on function public.crear_pedido_manual(
  public.workflow_type,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) to authenticated;

comment on function public.crear_pedido_manual(
  public.workflow_type,
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date,
  numeric
) is
  'Crea un pedido manual y su resumen financiero inicial en pedido_pagos dentro de una unica transaccion.';
