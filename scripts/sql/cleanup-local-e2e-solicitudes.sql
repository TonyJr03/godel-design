\set ON_ERROR_STOP on
\set VERBOSITY terse

begin;

create temp table e2e_cleanup_settings
as
select
  :'scope'::text as scope,
  :'run_id'::text as run_id,
  :'ownership_prefix'::text as ownership_prefix,
  ('e2e-solicitudes-' || :'run_id' || '@example.com')::text as expected_email,
  substring(:'run_id' from 1 for 14)::text as expected_phone;

do $$
declare
  v_scope text;
  v_run_id text;
  v_ownership_prefix text;
begin
  select scope, run_id, ownership_prefix
  into v_scope, v_run_id, v_ownership_prefix
  from e2e_cleanup_settings;

  if v_scope <> 'solicitudes' then
    raise exception 'Invalid cleanup scope.'
      using errcode = 'P0001';
  end if;

  if v_run_id !~ '^[0-9]{14}-[0-9a-f]{8}$' then
    raise exception 'Invalid cleanup run id.'
      using errcode = 'P0001';
  end if;

  if v_ownership_prefix <> ('E2E-solicitudes-' || v_run_id) then
    raise exception 'Invalid cleanup ownership prefix.'
      using errcode = 'P0001';
  end if;
end;
$$;

create temp table e2e_solicitud_candidates
on commit drop
as
select
  s.id,
  s.cliente_id,
  s.converted_order_id,
  s.client_name,
  s.client_phone,
  s.client_email,
  s.service_id,
  s.description,
  s.desired_date,
  s.notes,
  s.status,
  s.workflow_type,
  s.reviewed_by
from public.solicitudes as s
cross join e2e_cleanup_settings as settings
where left(s.client_name, length(settings.ownership_prefix)) =
  settings.ownership_prefix;

do $$
declare
  v_run_id text;
  v_ownership_prefix text;
  v_expected_email text;
  v_expected_phone text;
  v_unexpected_count integer;
  v_expected_count integer;
  v_dependent_count integer;
begin
  select run_id, ownership_prefix, expected_email, expected_phone
  into v_run_id, v_ownership_prefix, v_expected_email, v_expected_phone
  from e2e_cleanup_settings;

  if exists (
    select 1
    from e2e_solicitud_candidates as c
    where c.client_name <> (v_ownership_prefix || ' Cliente público')
      or c.client_phone <> v_expected_phone
      or c.client_email is distinct from v_expected_email
      or c.description <> (v_ownership_prefix || ' Encargo público')
      or c.notes is distinct from (v_ownership_prefix || ' sin archivos')
      or c.workflow_type <> 'encargo'::public.workflow_type
      or c.status <> 'nueva'::public.solicitud_estado
      or c.cliente_id is not null
      or c.converted_order_id is not null
      or c.reviewed_by is not null
      or c.desired_date is not null
      or not exists (
        select 1
        from public.tipos_servicio as ts
        where ts.id = c.service_id
          and ts.name = 'Otro'
          and ts.workflow_type = 'encargo'::public.workflow_type
      )
  ) then
    raise exception 'Cleanup refused: solicitud ownership contract mismatch.'
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
    and constraint_info.confrelid = 'public.solicitudes'::regclass
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'pedidos'
      and attribute_info.attname = 'solicitud_id'
    )
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'archivos'
      and attribute_info.attname = 'solicitud_id'
    )
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'solicitud_comentarios'
      and attribute_info.attname = 'solicitud_id'
    )
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'solicitud_historial'
      and attribute_info.attname = 'solicitud_id'
    );

  if v_unexpected_count <> 0 then
    raise exception 'Cleanup refused: unexpected solicitud relationship detected.'
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
    and constraint_info.confrelid = 'public.solicitudes'::regclass
    and (
      (
        schema_info.nspname = 'public'
        and table_info.relname = 'pedidos'
        and attribute_info.attname = 'solicitud_id'
      )
      or (
        schema_info.nspname = 'public'
        and table_info.relname = 'archivos'
        and attribute_info.attname = 'solicitud_id'
      )
      or (
        schema_info.nspname = 'public'
        and table_info.relname = 'solicitud_comentarios'
        and attribute_info.attname = 'solicitud_id'
      )
      or (
        schema_info.nspname = 'public'
        and table_info.relname = 'solicitud_historial'
        and attribute_info.attname = 'solicitud_id'
      )
    );

  if v_expected_count <> 4 then
    raise exception 'Cleanup refused: expected solicitud relationships changed.'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_dependent_count
  from e2e_solicitud_candidates as c
  where exists (
      select 1
      from public.pedidos as p
      where p.solicitud_id = c.id
    )
    or exists (
      select 1
      from public.archivos as a
      where a.solicitud_id = c.id
    )
    or exists (
      select 1
      from public.solicitud_comentarios as sc
      where sc.solicitud_id = c.id
    );

  if v_dependent_count <> 0 then
    raise exception 'Cleanup refused: candidate has dependent rows.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from e2e_solicitud_candidates as c
    where (
      select count(*)
      from public.solicitud_historial as sh
      where sh.solicitud_id = c.id
    ) <> 1
  ) then
    raise exception 'Cleanup refused: candidate history contract changed.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from e2e_solicitud_candidates as c
    join public.solicitud_historial as sh
      on sh.solicitud_id = c.id
    where sh.action <> 'solicitud_creada'::public.solicitud_historial_action
      or sh.summary <> 'Solicitud registrada: Otro'
      or sh.old_value is not null
      or sh.new_value is distinct from 'Otro'
      or sh.actor_id is not null
      or sh.metadata <> jsonb_build_object(
        'service_id', c.service_id,
        'service_name', 'Otro',
        'workflow_type', 'encargo',
        'origen', 'publica'
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
    from e2e_solicitud_candidates as c
    join storage.objects as o
      on o.bucket_id = 'godel-files'
      and left(
        o.name,
        length('solicitudes/' || c.id::text || '/originales/')
      ) = 'solicitudes/' || c.id::text || '/originales/'
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
  delete from public.solicitudes as s
  using e2e_solicitud_candidates as candidate
  where s.id = candidate.id
  returning 1
)
insert into e2e_cleanup_result (deleted_count)
select count(*)
from deleted;

do $$
declare
  v_ownership_prefix text;
begin
  select ownership_prefix
  into v_ownership_prefix
  from e2e_cleanup_settings;

  if exists (
    select 1
    from public.solicitudes as s
    where left(s.client_name, length(v_ownership_prefix)) = v_ownership_prefix
  ) then
    raise exception 'Cleanup verification failed: run solicitudes remain.'
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
