\set ON_ERROR_STOP on
\set VERBOSITY terse

begin;

create temp table e2e_cleanup_settings
as
select
  :'scope'::text as scope,
  :'run_id'::text as run_id,
  :'ownership_prefix'::text as ownership_prefix,
  (:'ownership_prefix' || ' Pedido manual')::text as expected_title,
  (:'ownership_prefix' || ' Encargo manual aislado')::text as expected_description;

do $$
declare
  v_scope text;
  v_run_id text;
  v_ownership_prefix text;
begin
  select scope, run_id, ownership_prefix
  into v_scope, v_run_id, v_ownership_prefix
  from e2e_cleanup_settings;

  if v_scope <> 'pedidos' then
    raise exception 'Invalid cleanup scope.'
      using errcode = 'P0001';
  end if;

  if v_run_id !~ '^[0-9]{14}-[0-9a-f]{8}$' then
    raise exception 'Invalid cleanup run id.'
      using errcode = 'P0001';
  end if;

  if v_ownership_prefix <> ('E2E-pedidos-' || v_run_id) then
    raise exception 'Invalid cleanup ownership prefix.'
      using errcode = 'P0001';
  end if;
end;
$$;

create temp table e2e_pedido_candidates
on commit drop
as
select
  p.id,
  p.order_number,
  p.public_reference,
  p.cliente_id,
  p.solicitud_id,
  p.service_id,
  p.title,
  p.description,
  p.status,
  p.workflow_type,
  p.priority,
  p.estimated_delivery_date,
  p.actual_delivery_date,
  p.created_by
from public.pedidos as p
cross join e2e_cleanup_settings as settings
where p.title = settings.expected_title;

do $$
declare
  v_expected_description text;
  v_unexpected_count integer;
  v_expected_count integer;
  v_dependent_count integer;
begin
  select expected_description
  into v_expected_description
  from e2e_cleanup_settings;

  if exists (
    select 1
    from e2e_pedido_candidates as c
    where c.description <> v_expected_description
      or c.workflow_type <> 'encargo'::public.workflow_type
      or c.status <> 'creado'::public.pedido_estado
      or c.priority <> 'normal'::public.pedido_prioridad
      or c.cliente_id is not null
      or c.solicitud_id is not null
      or c.estimated_delivery_date is not null
      or c.actual_delivery_date is not null
      or c.order_number !~ '^P-[0-9]{2}-[0-9]{4}$'
      or c.public_reference !~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$'
      or not exists (
        select 1
        from public.tipos_servicio as ts
        where ts.id = c.service_id
          and ts.name = 'Otro'
          and ts.workflow_type = 'encargo'::public.workflow_type
      )
      or not exists (
        select 1
        from public.perfiles as profile
        where profile.id = c.created_by
          and profile.role = 'admin'::public.app_role
          and profile.is_active
      )
  ) then
    raise exception 'Cleanup refused: pedido ownership contract mismatch.'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_unexpected_count
  from pg_constraint as constraint_info
  join pg_class as table_info
    on table_info.oid = constraint_info.conrelid
  join pg_namespace as schema_info
    on schema_info.oid = table_info.relnamespace
  join lateral unnest(constraint_info.conkey) as key_info(attnum)
    on true
  join pg_attribute as attribute_info
    on attribute_info.attrelid = constraint_info.conrelid
    and attribute_info.attnum = key_info.attnum
  where constraint_info.contype = 'f'
    and constraint_info.confrelid = 'public.pedidos'::regclass
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'solicitudes'
      and attribute_info.attname = 'converted_order_id'
    )
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'pedido_trabajadores'
      and attribute_info.attname = 'pedido_id'
    )
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'pedido_tareas'
      and attribute_info.attname = 'pedido_id'
    )
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'archivos'
      and attribute_info.attname = 'pedido_id'
    )
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'pedido_comentarios'
      and attribute_info.attname = 'pedido_id'
    )
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'pedido_historial'
      and attribute_info.attname = 'pedido_id'
    )
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'pedido_pagos'
      and attribute_info.attname = 'pedido_id'
    );

  if v_unexpected_count <> 0 then
    raise exception 'Cleanup refused: unexpected pedido relationship detected.'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_expected_count
  from pg_constraint as constraint_info
  join pg_class as table_info
    on table_info.oid = constraint_info.conrelid
  join pg_namespace as schema_info
    on schema_info.oid = table_info.relnamespace
  join lateral unnest(constraint_info.conkey) as key_info(attnum)
    on true
  join pg_attribute as attribute_info
    on attribute_info.attrelid = constraint_info.conrelid
    and attribute_info.attnum = key_info.attnum
  where constraint_info.contype = 'f'
    and constraint_info.confrelid = 'public.pedidos'::regclass
    and (
      (
        schema_info.nspname = 'public'
        and table_info.relname = 'solicitudes'
        and attribute_info.attname = 'converted_order_id'
      )
      or (
        schema_info.nspname = 'public'
        and table_info.relname = 'pedido_trabajadores'
        and attribute_info.attname = 'pedido_id'
      )
      or (
        schema_info.nspname = 'public'
        and table_info.relname = 'pedido_tareas'
        and attribute_info.attname = 'pedido_id'
      )
      or (
        schema_info.nspname = 'public'
        and table_info.relname = 'archivos'
        and attribute_info.attname = 'pedido_id'
      )
      or (
        schema_info.nspname = 'public'
        and table_info.relname = 'pedido_comentarios'
        and attribute_info.attname = 'pedido_id'
      )
      or (
        schema_info.nspname = 'public'
        and table_info.relname = 'pedido_historial'
        and attribute_info.attname = 'pedido_id'
      )
      or (
        schema_info.nspname = 'public'
        and table_info.relname = 'pedido_pagos'
        and attribute_info.attname = 'pedido_id'
      )
    );

  if v_expected_count <> 7 then
    raise exception 'Cleanup refused: expected pedido relationships changed.'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_dependent_count
  from e2e_pedido_candidates as c
  where exists (
      select 1
      from public.solicitudes as s
      where s.converted_order_id = c.id
    )
    or exists (
      select 1
      from public.pedido_trabajadores as pt
      where pt.pedido_id = c.id
    )
    or exists (
      select 1
      from public.pedido_tareas as task
      where task.pedido_id = c.id
    )
    or exists (
      select 1
      from public.archivos as a
      where a.pedido_id = c.id
    )
    or exists (
      select 1
      from public.pedido_comentarios as pc
      where pc.pedido_id = c.id
    );

  if v_dependent_count <> 0 then
    raise exception 'Cleanup refused: candidate has dependent rows.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from e2e_pedido_candidates as c
    where (
      select count(*)
      from public.pedido_pagos as payment
      where payment.pedido_id = c.id
    ) <> 1
  ) then
    raise exception 'Cleanup refused: candidate payment contract changed.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from e2e_pedido_candidates as c
    join public.pedido_pagos as payment
      on payment.pedido_id = c.id
    where payment.total_amount <> 100.00
      or payment.paid_cash_amount <> 0
      or payment.paid_transfer_amount <> 0
      or payment.payment_status <> 'sin_pago'::public.pedido_pago_estado
      or payment.paid_at is not null
      or payment.created_by is distinct from c.created_by
      or payment.updated_by is distinct from c.created_by
  ) then
    raise exception 'Cleanup refused: candidate payment contract changed.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from e2e_pedido_candidates as c
    where (
      select count(*)
      from public.pedido_historial as history
      where history.pedido_id = c.id
    ) <> 1
  ) then
    raise exception 'Cleanup refused: candidate history contract changed.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from e2e_pedido_candidates as c
    join public.pedido_historial as history
      on history.pedido_id = c.id
    where history.action <> 'pedido_creado'::public.pedido_historial_action
      or history.actor_id is distinct from c.created_by
      or history.summary <> ('Pedido creado en el sistema: ' || c.order_number)
      or history.old_value is not null
      or history.new_value is distinct from c.order_number
      or history.metadata <> jsonb_build_object(
        'order_number', c.order_number,
        'title', c.title,
        'solicitud_id', c.solicitud_id,
        'origen', 'manual'
      )
  ) then
    raise exception 'Cleanup refused: candidate has operational history.'
      using errcode = 'P0001';
  end if;

  if to_regclass('storage.objects') is null then
    raise exception 'Cleanup refused: storage objects table is missing.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from e2e_pedido_candidates as c
    join storage.objects as o
      on o.bucket_id = 'godel-files'
      and left(o.name, length('pedidos/' || c.id::text || '/')) =
        'pedidos/' || c.id::text || '/'
  ) then
    raise exception 'Cleanup refused: candidate has storage objects.'
      using errcode = 'P0001';
  end if;
end;
$$;

create temp table e2e_cleanup_result (
  deleted_count integer not null
);

with deleted as (
  delete from public.pedidos as p
  using e2e_pedido_candidates as candidate
  where p.id = candidate.id
  returning 1
)
insert into e2e_cleanup_result (deleted_count)
select count(*)
from deleted;

do $$
declare
  v_expected_title text;
begin
  select expected_title
  into v_expected_title
  from e2e_cleanup_settings;

  if exists (
    select 1
    from public.pedidos as p
    where p.title = v_expected_title
  ) then
    raise exception 'Cleanup verification failed: run pedidos remain.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.pedido_pagos as payment
    join e2e_pedido_candidates as c
      on c.id = payment.pedido_id
  ) then
    raise exception 'Cleanup verification failed: run pedido payment remains.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.pedido_historial as history
    join e2e_pedido_candidates as c
      on c.id = history.pedido_id
  ) then
    raise exception 'Cleanup verification failed: run pedido history remains.'
      using errcode = 'P0001';
  end if;
end;
$$;

commit;

select
  'E2E_CLEANUP_OK scope=' ||
  (select scope from e2e_cleanup_settings) ||
  ' deleted=' ||
  deleted_count
from e2e_cleanup_result;
