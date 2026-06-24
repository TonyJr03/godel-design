create type public.pedido_pago_estado as enum (
  'sin_pago',
  'parcial',
  'pagado'
);

create or replace function private.calculate_pedido_payment_status(
  p_total_amount numeric,
  p_paid_cash_amount numeric,
  p_paid_transfer_amount numeric
)
returns public.pedido_pago_estado
language sql
immutable
set search_path = public
as $$
  select case
    when p_total_amount = 0
      then 'pagado'::public.pedido_pago_estado
    when p_paid_cash_amount + p_paid_transfer_amount = 0
      then 'sin_pago'::public.pedido_pago_estado
    when p_paid_cash_amount + p_paid_transfer_amount < p_total_amount
      then 'parcial'::public.pedido_pago_estado
    else 'pagado'::public.pedido_pago_estado
  end;
$$;

revoke all on function private.calculate_pedido_payment_status(
  numeric,
  numeric,
  numeric
)
from public, anon, authenticated;

grant execute on function private.calculate_pedido_payment_status(
  numeric,
  numeric,
  numeric
) to authenticated;

comment on function private.calculate_pedido_payment_status(
  numeric,
  numeric,
  numeric
) is
  'Calcula el estado financiero resumido de un pedido a partir de total, efectivo y transferencia.';

create or replace function private.set_pedido_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  new.total_amount := coalesce(new.total_amount, 0);
  new.paid_cash_amount := coalesce(new.paid_cash_amount, 0);
  new.paid_transfer_amount := coalesce(new.paid_transfer_amount, 0);

  new.payment_status := private.calculate_pedido_payment_status(
    new.total_amount,
    new.paid_cash_amount,
    new.paid_transfer_amount
  );

  if new.payment_status = 'pagado'::public.pedido_pago_estado then
    new.paid_at := coalesce(new.paid_at, now());
  else
    new.paid_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.set_pedido_payment_status()
from public, anon, authenticated;

comment on function private.set_pedido_payment_status() is
  'Normaliza montos, calcula payment_status y mantiene paid_at coherente antes de insertar o actualizar pedido_pagos.';

create table public.pedido_pagos (
  pedido_id uuid primary key references public.pedidos(id) on delete cascade,
  total_amount numeric(12,2) not null default 0,
  paid_cash_amount numeric(12,2) not null default 0,
  paid_transfer_amount numeric(12,2) not null default 0,
  payment_status public.pedido_pago_estado not null default 'pagado',
  paid_at timestamptz,
  created_by uuid references public.perfiles(id) on delete set null,
  updated_by uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedido_pagos_total_amount_non_negative
    check (total_amount >= 0),
  constraint pedido_pagos_paid_cash_amount_non_negative
    check (paid_cash_amount >= 0),
  constraint pedido_pagos_paid_transfer_amount_non_negative
    check (paid_transfer_amount >= 0),
  constraint pedido_pagos_paid_amount_not_over_total
    check (paid_cash_amount + paid_transfer_amount <= total_amount),
  constraint pedido_pagos_payment_status_consistent check (
    payment_status = private.calculate_pedido_payment_status(
      total_amount,
      paid_cash_amount,
      paid_transfer_amount
    )
  ),
  constraint pedido_pagos_paid_at_consistent check (
    (
      payment_status = 'pagado'::public.pedido_pago_estado
      and paid_at is not null
    )
    or (
      payment_status <> 'pagado'::public.pedido_pago_estado
      and paid_at is null
    )
  )
);

create trigger set_pedido_pagos_payment_status
before insert or update of total_amount, paid_cash_amount, paid_transfer_amount, payment_status, paid_at
on public.pedido_pagos
for each row
execute function private.set_pedido_payment_status();

create trigger set_pedido_pagos_updated_at
before update on public.pedido_pagos
for each row
execute function public.set_updated_at();

create index pedido_pagos_payment_status_idx
on public.pedido_pagos(payment_status);

alter table public.pedido_pagos enable row level security;

grant select, insert, update, delete on table public.pedido_pagos
to authenticated;

revoke all on table public.pedido_pagos
from anon;

revoke all on type public.pedido_pago_estado from public, anon;
grant usage on type public.pedido_pago_estado to authenticated;

create policy pedido_pagos_select_accessible
on public.pedido_pagos
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.can_access_pedido(pedido_id)
);

create policy pedido_pagos_insert_manager
on public.pedido_pagos
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin_or_supervisor()
);

create policy pedido_pagos_update_manager
on public.pedido_pagos
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin_or_supervisor()
)
with check (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin_or_supervisor()
);

create policy pedido_pagos_delete_manager
on public.pedido_pagos
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin_or_supervisor()
);

insert into public.pedido_pagos (
  pedido_id,
  total_amount,
  paid_cash_amount,
  paid_transfer_amount,
  payment_status,
  paid_at,
  created_at,
  updated_at
)
select
  p.id,
  0,
  0,
  0,
  'pagado'::public.pedido_pago_estado,
  now(),
  now(),
  now()
from public.pedidos as p
where not exists (
  select 1
  from public.pedido_pagos as pp
  where pp.pedido_id = p.id
);
