\set ON_ERROR_STOP on
\set VERBOSITY terse

begin;

create temp table e2e_cleanup_settings
as
select
  :'scope'::text as scope,
  :'run_id'::text as run_id,
  :'ownership_prefix'::text as ownership_prefix,
  ('e2e-clientes-' || :'run_id' || '@example.com')::text as expected_email;

do $$
declare
  v_scope text;
  v_run_id text;
  v_ownership_prefix text;
begin
  select scope, run_id, ownership_prefix
  into v_scope, v_run_id, v_ownership_prefix
  from e2e_cleanup_settings;

  if v_scope <> 'clientes' then
    raise exception 'Invalid cleanup scope.'
      using errcode = 'P0001';
  end if;

  if v_run_id !~ '^[0-9]{14}-[0-9a-f]{8}$' then
    raise exception 'Invalid cleanup run id.'
      using errcode = 'P0001';
  end if;

  if v_ownership_prefix <> ('E2E-clientes-' || v_run_id) then
    raise exception 'Invalid cleanup ownership prefix.'
      using errcode = 'P0001';
  end if;
end;
$$;

create temp table e2e_cliente_candidates
on commit drop
as
select
  c.id,
  c.name,
  c.phone,
  c.email,
  c.notes
from public.clientes as c
cross join e2e_cleanup_settings as settings
where left(c.name, length(settings.ownership_prefix)) =
  settings.ownership_prefix;

do $$
declare
  v_ownership_prefix text;
  v_expected_email text;
  v_unexpected_count integer;
  v_expected_count integer;
  v_dependent_count integer;
begin
  select ownership_prefix, expected_email
  into v_ownership_prefix, v_expected_email
  from e2e_cleanup_settings;

  if exists (
    select 1
    from e2e_cliente_candidates as c
    where left(c.name, length(v_ownership_prefix)) <> v_ownership_prefix
      or c.email is distinct from v_expected_email
      or left(coalesce(c.notes, ''), length(v_ownership_prefix)) <>
        v_ownership_prefix
      or c.phone !~ '^[0-9]+$'
      or (
        c.email ~ '^e2e-clientes-[0-9]{14}-[0-9a-f]{8}@example\.com$'
        and c.email <> v_expected_email
      )
      or (
        coalesce(c.notes, '') ~ '^E2E-clientes-[0-9]{14}-[0-9a-f]{8}'
        and left(coalesce(c.notes, ''), length(v_ownership_prefix)) <>
          v_ownership_prefix
      )
  ) then
    raise exception 'Cleanup refused: client ownership contract mismatch.'
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
    and constraint_info.confrelid = 'public.clientes'::regclass
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'solicitudes'
      and attribute_info.attname = 'cliente_id'
    )
    and not (
      schema_info.nspname = 'public'
      and table_info.relname = 'pedidos'
      and attribute_info.attname = 'cliente_id'
    );

  if v_unexpected_count <> 0 then
    raise exception 'Cleanup refused: unexpected client relationship detected.'
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
    and constraint_info.confrelid = 'public.clientes'::regclass
    and (
      (
        schema_info.nspname = 'public'
        and table_info.relname = 'solicitudes'
        and attribute_info.attname = 'cliente_id'
      )
      or (
        schema_info.nspname = 'public'
        and table_info.relname = 'pedidos'
        and attribute_info.attname = 'cliente_id'
      )
    );

  if v_expected_count <> 2 then
    raise exception 'Cleanup refused: expected client relationships changed.'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_dependent_count
  from e2e_cliente_candidates as c
  where exists (
      select 1
      from public.solicitudes as s
      where s.cliente_id = c.id
    )
    or exists (
      select 1
      from public.pedidos as p
      where p.cliente_id = c.id
    );

  if v_dependent_count <> 0 then
    raise exception 'Cleanup refused: candidate has dependent rows.'
      using errcode = 'P0001';
  end if;
end;
$$;

create temp table e2e_cleanup_result (
  deleted_count integer not null
);

with deleted as (
  delete from public.clientes as c
  using e2e_cliente_candidates as candidate
  where c.id = candidate.id
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
    from public.clientes as c
    where left(c.name, length(v_ownership_prefix)) = v_ownership_prefix
  ) then
    raise exception 'Cleanup verification failed: run clients remain.'
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
