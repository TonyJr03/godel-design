-- Etapa 1 expand: catalogo transversal administrable de tipos de servicio.
-- No contrae columnas existentes ni cambia RPCs o flujos visibles.

create table public.tipos_servicio (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  workflow_type public.workflow_type not null,
  is_publicly_available boolean not null default true,
  created_by uuid references public.perfiles(id) on delete set null,
  updated_by uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tipos_servicio_name_length_check
    check (length(btrim(name)) between 2 and 120),
  constraint tipos_servicio_description_not_empty
    check (btrim(description) <> ''),
  constraint tipos_servicio_description_max_length
    check (length(btrim(description)) <= 500)
);

create trigger set_tipos_servicio_updated_at
before update on public.tipos_servicio
for each row
execute function public.set_updated_at();

create unique index tipos_servicio_name_normalized_key
on public.tipos_servicio (lower(btrim(name)));

create unique index tipos_servicio_single_print_service
on public.tipos_servicio (workflow_type)
where workflow_type = 'impresion'::public.workflow_type;

create or replace function private.prevent_tipos_servicio_workflow_type_change()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if old.workflow_type is distinct from new.workflow_type then
    raise exception 'El tipo de flujo de un servicio no puede modificarse.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger prevent_tipos_servicio_workflow_type_change
before update of workflow_type on public.tipos_servicio
for each row
execute function private.prevent_tipos_servicio_workflow_type_change();

insert into public.tipos_servicio (
  name,
  description,
  workflow_type,
  is_publicly_available
)
values
  (
    'Impresión',
    'Impresión de documentos y materiales proporcionados por el cliente.',
    'impresion'::public.workflow_type,
    true
  ),
  (
    'Diseño gráfico',
    'Creación y adaptación de diseños gráficos para productos y materiales.',
    'encargo'::public.workflow_type,
    true
  ),
  (
    'Personalización',
    'Personalización de agendas, tazas, libretas y otros artículos.',
    'encargo'::public.workflow_type,
    true
  ),
  (
    'Rotulación',
    'Diseño y preparación de trabajos de rotulación para diferentes superficies.',
    'encargo'::public.workflow_type,
    true
  ),
  (
    'Otro',
    'Otros encargos personalizados no incluidos en los servicios anteriores.',
    'encargo'::public.workflow_type,
    true
  );

alter table public.solicitudes
add column service_id uuid;

alter table public.pedidos
add column service_id uuid;

alter table public.solicitudes
add constraint solicitudes_service_id_fkey
foreign key (service_id)
references public.tipos_servicio(id)
on delete restrict;

alter table public.pedidos
add constraint pedidos_service_id_fkey
foreign key (service_id)
references public.tipos_servicio(id)
on delete restrict;

create index solicitudes_service_id_idx
on public.solicitudes(service_id);

create index pedidos_service_id_idx
on public.pedidos(service_id);

create or replace function private.sync_workflow_type_from_service()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_workflow_type public.workflow_type;
begin
  if new.service_id is null then
    return new;
  end if;

  select ts.workflow_type
  into v_workflow_type
  from public.tipos_servicio as ts
  where ts.id = new.service_id;

  if not found then
    raise exception 'El tipo de servicio seleccionado no existe.'
      using errcode = '23503';
  end if;

  new.workflow_type := v_workflow_type;

  return new;
end;
$$;

create trigger sync_solicitudes_workflow_type_from_service
before insert or update of service_id, workflow_type on public.solicitudes
for each row
execute function private.sync_workflow_type_from_service();

create trigger sync_pedidos_workflow_type_from_service
before insert or update of service_id, workflow_type on public.pedidos
for each row
execute function private.sync_workflow_type_from_service();

with mapped_services as (
  select
    s.id as solicitud_id,
    case
      when lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g')))
        in ('impresion', 'impresión') then 'Impresión'
      when lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g')))
        in (
          'diseno',
          'diseño',
          'diseno grafico',
          'diseño grafico',
          'diseno gráfico',
          'diseño gráfico'
        ) then 'Diseño gráfico'
      when lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g')))
        in ('personalizacion', 'personalización') then 'Personalización'
      when lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g')))
        in ('rotulacion', 'rotulación') then 'Rotulación'
      when lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g')))
        = 'otro' then 'Otro'
      else null
    end as canonical_name
  from public.solicitudes as s
)
update public.solicitudes as s
set service_id = ts.id
from mapped_services as ms
join public.tipos_servicio as ts
  on ts.name = ms.canonical_name
where s.id = ms.solicitud_id
  and ms.canonical_name is not null;

do $$
declare
  v_conflict text;
begin
  with unresolved as (
    select
      lower(btrim(regexp_replace(service_type, '[[:space:]]+', ' ', 'g'))) as normalized_name,
      count(distinct workflow_type) as workflow_count
    from public.solicitudes
    where service_id is null
    group by lower(btrim(regexp_replace(service_type, '[[:space:]]+', ' ', 'g')))
  )
  select normalized_name
  into v_conflict
  from unresolved
  where workflow_count > 1
  order by normalized_name
  limit 1;

  if found then
    raise exception
      'No se puede migrar el servicio histórico "%": aparece con workflow_type diferentes.',
      v_conflict
      using errcode = '23514';
  end if;
end;
$$;

do $$
declare
  v_print_historical_service text;
begin
  select btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g'))
  into v_print_historical_service
  from public.solicitudes as s
  where s.service_id is null
    and s.workflow_type = 'impresion'::public.workflow_type
  order by lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g')))
  limit 1;

  if found then
    raise exception
      'No se puede migrar el servicio histórico "%" como impresión: el catálogo permite un único servicio de impresión.',
      v_print_historical_service
      using errcode = '23514';
  end if;
end;
$$;

with historical_services as (
  select distinct on (
    lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g')))
  )
    btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g')) as clean_name,
    lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g'))) as normalized_name,
    s.workflow_type
  from public.solicitudes as s
  where s.service_id is null
  order by
    lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g'))),
    btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g'))
)
insert into public.tipos_servicio (
  name,
  description,
  workflow_type,
  is_publicly_available
)
select
  hs.clean_name,
  'Servicio histórico migrado desde solicitudes existentes.',
  hs.workflow_type,
  false
from historical_services as hs
where not exists (
  select 1
  from public.tipos_servicio as ts
  where lower(btrim(ts.name)) = hs.normalized_name
);

update public.solicitudes as s
set service_id = ts.id
from public.tipos_servicio as ts
where s.service_id is null
  and lower(btrim(regexp_replace(s.service_type, '[[:space:]]+', ' ', 'g'))) =
    lower(btrim(ts.name));

update public.pedidos as p
set service_id = s.service_id
from public.solicitudes as s
where p.solicitud_id = s.id
  and p.service_id is null;

update public.pedidos as p
set service_id = ts.id
from public.tipos_servicio as ts
where p.solicitud_id is null
  and p.workflow_type = 'impresion'::public.workflow_type
  and p.service_id is null
  and ts.name = 'Impresión';

update public.pedidos as p
set service_id = ts.id
from public.tipos_servicio as ts
where p.solicitud_id is null
  and p.workflow_type = 'encargo'::public.workflow_type
  and p.service_id is null
  and ts.name = 'Otro';

do $$
begin
  if exists (
    select 1
    from public.solicitudes
    where service_id is null
  ) then
    raise exception 'Backfill incompleto: existen solicitudes sin service_id.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.pedidos
    where service_id is null
  ) then
    raise exception 'Backfill incompleto: existen pedidos sin service_id.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.solicitudes as s
    join public.tipos_servicio as ts
      on ts.id = s.service_id
    where s.workflow_type <> ts.workflow_type
  ) then
    raise exception 'Backfill inconsistente: solicitudes.workflow_type no coincide con el servicio.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.pedidos as p
    join public.tipos_servicio as ts
      on ts.id = p.service_id
    where p.workflow_type <> ts.workflow_type
  ) then
    raise exception 'Backfill inconsistente: pedidos.workflow_type no coincide con el servicio.'
      using errcode = '23514';
  end if;

  if (
    select count(*)
    from public.tipos_servicio
    where workflow_type = 'impresion'::public.workflow_type
  ) <> 1 then
    raise exception 'Backfill inconsistente: debe existir exactamente un servicio de impresión.'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.tipos_servicio enable row level security;

revoke all on table public.tipos_servicio
from public, anon, authenticated;

grant select on table public.tipos_servicio to anon;
grant select, insert, update on table public.tipos_servicio to authenticated;

grant usage on type public.workflow_type to anon, authenticated;

create policy tipos_servicio_select_public
on public.tipos_servicio
for select
to anon
using (is_publicly_available = true);

create policy tipos_servicio_select_internal
on public.tipos_servicio
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
);

create policy tipos_servicio_insert_admin
on public.tipos_servicio
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
  and workflow_type = 'encargo'::public.workflow_type
);

create policy tipos_servicio_update_admin
on public.tipos_servicio
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
)
with check (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
);

revoke all on function private.prevent_tipos_servicio_workflow_type_change()
from public, anon, authenticated;

revoke all on function private.sync_workflow_type_from_service()
from public, anon, authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.tipos_servicio', 'DELETE') then
    raise exception 'Hardening failed: anon has DELETE on public.tipos_servicio.';
  end if;

  if has_table_privilege('authenticated', 'public.tipos_servicio', 'DELETE') then
    raise exception 'Hardening failed: authenticated has DELETE on public.tipos_servicio.';
  end if;

  if exists (
    select 1
    from pg_policies as p
    where p.schemaname = 'public'
      and p.tablename = 'tipos_servicio'
      and p.cmd = 'DELETE'
  ) then
    raise exception 'Hardening failed: public.tipos_servicio has DELETE policy.';
  end if;
end;
$$;
