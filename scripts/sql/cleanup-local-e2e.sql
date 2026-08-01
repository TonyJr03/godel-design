\set ON_ERROR_STOP on
\set VERBOSITY terse

begin;

create temp table e2e_cleanup_settings
as
select
  :'scope'::text as scope,
  :'run_id'::text as run_id,
  :'ownership_prefix'::text as ownership_prefix;

do $$
declare
  v_scope text;
  v_run_id text;
  v_ownership_prefix text;
begin
  select scope, run_id, ownership_prefix
  into v_scope, v_run_id, v_ownership_prefix
  from e2e_cleanup_settings;

  if v_scope <> 'servicios' then
    raise exception 'Invalid cleanup scope.'
      using errcode = 'P0001';
  end if;

  if v_run_id !~ '^[0-9]{14}-[0-9a-f]{8}$' then
    raise exception 'Invalid cleanup run id.'
      using errcode = 'P0001';
  end if;

  if v_ownership_prefix <> ('E2E-servicios-' || v_run_id) then
    raise exception 'Invalid cleanup ownership prefix.'
      using errcode = 'P0001';
  end if;
end;
$$;

create temp table e2e_service_candidates
on commit drop
as
select
  ts.id,
  ts.name,
  ts.workflow_type
from public.tipos_servicio as ts
where left(ts.name, length(:'ownership_prefix')) = :'ownership_prefix';

do $$
declare
  v_ownership_prefix text;
  v_unexpected_count integer;
  v_dependent_count integer;
begin
  select ownership_prefix
  into v_ownership_prefix
  from e2e_cleanup_settings;

  if exists (
    select 1
    from e2e_service_candidates as c
    where c.workflow_type <> 'encargo'::public.workflow_type
  ) then
    raise exception 'Cleanup refused: candidate workflow type is not allowed.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from e2e_service_candidates as c
    where c.name in (U&'Impresi\00F3n', 'Otro')
      or c.workflow_type = 'impresion'::public.workflow_type
      or left(c.name, length(v_ownership_prefix)) <> v_ownership_prefix
  ) then
    raise exception 'Cleanup refused: candidate ownership contract mismatch.'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_unexpected_count
  from pg_constraint as constraint_info
  where constraint_info.contype = 'f'
    and constraint_info.confrelid = 'public.tipos_servicio'::regclass
    and constraint_info.conrelid not in (
      'public.solicitudes'::regclass,
      'public.pedidos'::regclass
    );

  if v_unexpected_count <> 0 then
    raise exception 'Cleanup refused: unexpected service relationship detected.'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_dependent_count
  from e2e_service_candidates as c
  where exists (
      select 1
      from public.solicitudes as s
      where s.service_id = c.id
    )
    or exists (
      select 1
      from public.pedidos as p
      where p.service_id = c.id
    );

  if v_dependent_count <> 0 then
    raise exception 'Cleanup refused: candidate has dependent rows.'
      using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.tipos_servicio
    where workflow_type = 'impresion'::public.workflow_type
  ) <> 1 then
    raise exception 'Cleanup refused: print service invariant is not satisfied.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.tipos_servicio
    where name = U&'Impresi\00F3n'
      and workflow_type = 'impresion'::public.workflow_type
  ) then
    raise exception 'Cleanup refused: canonical print service is missing.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.tipos_servicio
    where name = 'Otro'
      and workflow_type = 'encargo'::public.workflow_type
  ) then
    raise exception 'Cleanup refused: canonical generic service is missing.'
      using errcode = 'P0001';
  end if;
end;
$$;

create temp table e2e_cleanup_result (
  deleted_count integer not null
);

with deleted as (
  delete from public.tipos_servicio as ts
  using e2e_service_candidates as c
  where ts.id = c.id
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
    from public.tipos_servicio as ts
    where left(ts.name, length(v_ownership_prefix)) = v_ownership_prefix
  ) then
    raise exception 'Cleanup verification failed: run services remain.'
      using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.tipos_servicio
    where workflow_type = 'impresion'::public.workflow_type
  ) <> 1 then
    raise exception 'Cleanup verification failed: print service invariant changed.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.tipos_servicio
    where name = U&'Impresi\00F3n'
      and workflow_type = 'impresion'::public.workflow_type
  ) then
    raise exception 'Cleanup verification failed: canonical print service changed.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.tipos_servicio
    where name = 'Otro'
      and workflow_type = 'encargo'::public.workflow_type
  ) then
    raise exception 'Cleanup verification failed: canonical generic service changed.'
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
