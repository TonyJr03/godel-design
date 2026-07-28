with solicitud_service_matches as (
  select
    s.id as solicitud_id,
    ts.id as service_id,
    count(*) over (partition by s.id) as match_count
  from public.solicitudes as s
  join public.tipos_servicio as ts
    on lower(btrim(regexp_replace(ts.name, '[[:space:]]+', ' ', 'g'))) =
      lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g')))
    and ts.workflow_type = s.workflow_type
  where s.service_id is null
)
update public.solicitudes as s
set service_id = ssm.service_id
from solicitud_service_matches as ssm
where s.id = ssm.solicitud_id
  and s.service_id is null
  and ssm.match_count = 1;

update public.pedidos as p
set service_id = s.service_id
from public.solicitudes as s
where p.service_id is null
  and p.solicitud_id = s.id
  and s.service_id is not null;

with print_service as (
  select
    ts.id,
    count(*) over () as service_count
  from public.tipos_servicio as ts
  where ts.workflow_type = 'impresion'::public.workflow_type
)
update public.pedidos as p
set service_id = ps.id
from print_service as ps
where p.service_id is null
  and p.solicitud_id is null
  and p.workflow_type = 'impresion'::public.workflow_type
  and ps.service_count = 1;

with other_service as (
  select
    ts.id,
    count(*) over () as service_count
  from public.tipos_servicio as ts
  where ts.workflow_type = 'encargo'::public.workflow_type
    and lower(btrim(regexp_replace(ts.name, '[[:space:]]+', ' ', 'g'))) =
      'otro'
)
update public.pedidos as p
set service_id = os.id
from other_service as os
where p.service_id is null
  and p.solicitud_id is null
  and p.workflow_type = 'encargo'::public.workflow_type
  and os.service_count = 1;

do $$
declare
  v_solicitudes_null_count integer;
  v_pedidos_null_count integer;
  v_solicitudes_orphan_count integer;
  v_pedidos_orphan_count integer;
  v_solicitudes_workflow_count integer;
  v_pedidos_workflow_count integer;
  v_print_service_count integer;
  v_solicitudes_null_ids text;
  v_pedidos_null_ids text;
begin
  select count(*)
  into v_solicitudes_null_count
  from public.solicitudes
  where service_id is null;

  select count(*)
  into v_pedidos_null_count
  from public.pedidos
  where service_id is null;

  select count(*)
  into v_solicitudes_orphan_count
  from public.solicitudes as s
  left join public.tipos_servicio as ts
    on ts.id = s.service_id
  where s.service_id is not null
    and ts.id is null;

  select count(*)
  into v_pedidos_orphan_count
  from public.pedidos as p
  left join public.tipos_servicio as ts
    on ts.id = p.service_id
  where p.service_id is not null
    and ts.id is null;

  select count(*)
  into v_solicitudes_workflow_count
  from public.solicitudes as s
  join public.tipos_servicio as ts
    on ts.id = s.service_id
  where s.workflow_type is distinct from ts.workflow_type;

  select count(*)
  into v_pedidos_workflow_count
  from public.pedidos as p
  join public.tipos_servicio as ts
    on ts.id = p.service_id
  where p.workflow_type is distinct from ts.workflow_type;

  select count(*)
  into v_print_service_count
  from public.tipos_servicio
  where workflow_type = 'impresion'::public.workflow_type;

  select string_agg(id::text, ', ')
  into v_solicitudes_null_ids
  from (
    select id
    from public.solicitudes
    where service_id is null
    order by created_at desc
    limit 5
  ) as unresolved_solicitudes;

  select string_agg(id::text, ', ')
  into v_pedidos_null_ids
  from (
    select id
    from public.pedidos
    where service_id is null
    order by created_at desc
    limit 5
  ) as unresolved_pedidos;

  if v_solicitudes_null_count > 0
    or v_pedidos_null_count > 0
    or v_solicitudes_orphan_count > 0
    or v_pedidos_orphan_count > 0
    or v_solicitudes_workflow_count > 0
    or v_pedidos_workflow_count > 0
    or v_print_service_count <> 1 then
    raise exception
      'Contract bloqueado: solicitudes_sin_servicio=%, pedidos_sin_servicio=%, solicitudes_huerfanas=%, pedidos_huerfanos=%, solicitudes_workflow_inconsistente=%, pedidos_workflow_inconsistente=%, servicios_impresion=%, solicitudes_irresueltas=[%], pedidos_irresueltos=[%].',
      v_solicitudes_null_count,
      v_pedidos_null_count,
      v_solicitudes_orphan_count,
      v_pedidos_orphan_count,
      v_solicitudes_workflow_count,
      v_pedidos_workflow_count,
      v_print_service_count,
      coalesce(v_solicitudes_null_ids, ''),
      coalesce(v_pedidos_null_ids, '');
  end if;
end;
$$;

drop policy solicitudes_insert_public
on public.solicitudes;

create or replace function private.insert_solicitud_historial_solicitud_creada()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_service_name text;
begin
  select ts.name
  into v_service_name
  from public.tipos_servicio as ts
  where ts.id = new.service_id;

  if v_service_name is null then
    raise exception 'No se pudo registrar historial: el servicio canonico de la solicitud no existe.';
  end if;

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
    new.id,
    auth.uid(),
    'solicitud_creada'::public.solicitud_historial_action,
    'Solicitud registrada: ' || v_service_name,
    null,
    v_service_name,
    jsonb_strip_nulls(
      jsonb_build_object(
        'service_id', new.service_id,
        'service_name', v_service_name,
        'workflow_type', new.workflow_type,
        'origen', case
          when auth.uid() is null then 'publica'
          else 'interna'
        end
      )
    )
  );

  return new;
end;
$$;

revoke all on function private.insert_solicitud_historial_solicitud_creada()
from public, anon, authenticated;

alter table public.solicitudes
alter column service_id set not null;

alter table public.pedidos
alter column service_id set not null;

alter table public.solicitudes
drop constraint solicitudes_service_type_not_empty;

alter table public.solicitudes
drop column service_type;

comment on column public.solicitudes.service_id is
  'Servicio canonico obligatorio de la solicitud; workflow_type se sincroniza desde tipos_servicio.';

comment on column public.pedidos.service_id is
  'Servicio canonico obligatorio del pedido; workflow_type se sincroniza desde tipos_servicio.';

create policy solicitudes_insert_public
on public.solicitudes
for insert
to anon, authenticated
with check (
  status = 'nueva'::public.solicitud_estado
  and reviewed_by is null
  and converted_order_id is null
  and cliente_id is null
  and service_id is not null
  and btrim(client_name) <> ''
  and btrim(client_phone) <> ''
  and btrim(description) <> ''
  and exists (
    select 1
    from public.tipos_servicio as ts
    where ts.id = public.solicitudes.service_id
      and ts.is_publicly_available = true
      and ts.workflow_type = public.solicitudes.workflow_type
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.solicitudes'::regclass
      and attname = 'service_id'
      and attnotnull
      and not attisdropped
  ) then
    raise exception 'Verificacion fallida: public.solicitudes.service_id no quedo NOT NULL.';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.pedidos'::regclass
      and attname = 'service_id'
      and attnotnull
      and not attisdropped
  ) then
    raise exception 'Verificacion fallida: public.pedidos.service_id no quedo NOT NULL.';
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.solicitudes'::regclass
      and attname = 'service_type'
      and not attisdropped
  ) then
    raise exception 'Verificacion fallida: public.solicitudes.service_type todavia existe.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'solicitudes'
      and policyname = 'solicitudes_insert_public'
      and cmd = 'INSERT'
  ) then
    raise exception 'Verificacion fallida: falta la policy solicitudes_insert_public.';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'solicitudes'
      and policyname = 'solicitudes_insert_public'
      and (
        coalesce(qual, '') ilike '%service_type%'
        or coalesce(with_check, '') ilike '%service_type%'
      )
  ) then
    raise exception 'Verificacion fallida: solicitudes_insert_public aun referencia service_type.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.solicitudes'::regclass
      and conname = 'solicitudes_service_id_fkey'
      and contype = 'f'
  ) then
    raise exception 'Verificacion fallida: falta solicitudes_service_id_fkey.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pedidos'::regclass
      and conname = 'pedidos_service_id_fkey'
      and contype = 'f'
  ) then
    raise exception 'Verificacion fallida: falta pedidos_service_id_fkey.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.solicitudes'::regclass
      and tgname = 'sync_solicitudes_workflow_type_from_service'
      and not tgisinternal
  ) then
    raise exception 'Verificacion fallida: falta sync_solicitudes_workflow_type_from_service.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.pedidos'::regclass
      and tgname = 'sync_pedidos_workflow_type_from_service'
      and not tgisinternal
  ) then
    raise exception 'Verificacion fallida: falta sync_pedidos_workflow_type_from_service.';
  end if;
end;
$$;
