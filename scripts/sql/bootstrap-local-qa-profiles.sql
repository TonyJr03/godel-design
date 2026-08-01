\set ON_ERROR_STOP on
\set VERBOSITY terse

begin;

create temp table qa_expected_profiles (
  sort_order integer primary key,
  id uuid not null unique,
  full_name text not null,
  role public.app_role not null,
  is_active boolean not null,
  must_change_password boolean not null,
  created_by uuid,
  phone text,
  avatar_url text,
  constraint qa_expected_profiles_created_by_not_self
    check (created_by is null or created_by <> id)
) on commit drop;

insert into qa_expected_profiles (
  sort_order,
  id,
  full_name,
  role,
  is_active,
  must_change_password,
  created_by,
  phone,
  avatar_url
)
values
  (
    1,
    :'admin_id'::uuid,
    'Administrador QA',
    'admin'::public.app_role,
    true,
    false,
    null,
    null,
    null
  ),
  (
    2,
    :'supervisor_id'::uuid,
    'Supervisor QA',
    'supervisor'::public.app_role,
    true,
    false,
    :'admin_id'::uuid,
    null,
    null
  ),
  (
    3,
    :'worker_id'::uuid,
    'Trabajador QA',
    'trabajador'::public.app_role,
    true,
    false,
    :'admin_id'::uuid,
    null,
    null
  );

insert into public.perfiles as p (
  id,
  full_name,
  role,
  is_active,
  must_change_password,
  created_by,
  phone,
  avatar_url
)
select
  e.id,
  e.full_name,
  e.role,
  e.is_active,
  e.must_change_password,
  e.created_by,
  e.phone,
  e.avatar_url
from qa_expected_profiles as e
where e.sort_order = 1
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  must_change_password = excluded.must_change_password,
  created_by = excluded.created_by,
  phone = excluded.phone,
  avatar_url = excluded.avatar_url
where
  p.full_name is distinct from excluded.full_name
  or p.role is distinct from excluded.role
  or p.is_active is distinct from excluded.is_active
  or p.must_change_password is distinct from excluded.must_change_password
  or p.created_by is distinct from excluded.created_by
  or p.phone is distinct from excluded.phone
  or p.avatar_url is distinct from excluded.avatar_url;

insert into public.perfiles as p (
  id,
  full_name,
  role,
  is_active,
  must_change_password,
  created_by,
  phone,
  avatar_url
)
select
  e.id,
  e.full_name,
  e.role,
  e.is_active,
  e.must_change_password,
  e.created_by,
  e.phone,
  e.avatar_url
from qa_expected_profiles as e
where e.sort_order in (2, 3)
order by e.sort_order
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  must_change_password = excluded.must_change_password,
  created_by = excluded.created_by,
  phone = excluded.phone,
  avatar_url = excluded.avatar_url
where
  p.full_name is distinct from excluded.full_name
  or p.role is distinct from excluded.role
  or p.is_active is distinct from excluded.is_active
  or p.must_change_password is distinct from excluded.must_change_password
  or p.created_by is distinct from excluded.created_by
  or p.phone is distinct from excluded.phone
  or p.avatar_url is distinct from excluded.avatar_url;

do $$
declare
  v_profile_count integer;
  v_mismatch_count integer;
begin
  select count(*)
  into v_profile_count
  from qa_expected_profiles as e
  join public.perfiles as p
    on p.id = e.id;

  if v_profile_count <> 3 then
    raise exception 'QA profile bootstrap verification failed: missing profile rows.'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_mismatch_count
  from qa_expected_profiles as e
  join public.perfiles as p
    on p.id = e.id
  where
    p.full_name is distinct from e.full_name
    or p.role is distinct from e.role
    or p.is_active is distinct from e.is_active
    or p.must_change_password is distinct from e.must_change_password
    or p.created_by is distinct from e.created_by
    or p.phone is distinct from e.phone
    or p.avatar_url is distinct from e.avatar_url;

  if v_mismatch_count <> 0 then
    raise exception 'QA profile bootstrap verification failed: profile contract mismatch.'
      using errcode = 'P0001';
  end if;
end;
$$;

commit;

select 'QA_PROFILES_OK';
