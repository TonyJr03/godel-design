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
    updated_by = auth.uid()
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
from public;

revoke all on function public.actualizar_pago_pedido(uuid, numeric, numeric)
from anon;

grant execute on function public.actualizar_pago_pedido(uuid, numeric, numeric)
to authenticated;

comment on function public.actualizar_pago_pedido(uuid, numeric, numeric) is
  'Actualiza montos acumulados de pago de un pedido y registra historial en una unica transaccion.';
