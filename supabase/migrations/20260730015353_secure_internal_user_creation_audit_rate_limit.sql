create table private.internal_user_creation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null,
  target_role public.app_role not null,
  target_auth_user_id uuid null,
  status text not null,
  error_code text null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint internal_user_creation_audit_actor_profile_id_fkey
    foreign key (actor_profile_id)
    references public.perfiles(id)
    on delete restrict,
  constraint internal_user_creation_audit_status_check
    check (
      status in (
        'pending',
        'succeeded',
        'failed',
        'rate_limited',
        'compensation_failed'
      )
    ),
  constraint internal_user_creation_audit_error_code_check
    check (
      error_code is null
      or (
        length(error_code) <= 64
        and error_code ~ '^[a-z0-9_]+$'
      )
    ),
  constraint internal_user_creation_audit_completion_check
    check (
      (
        status = 'pending'
        and completed_at is null
        and target_auth_user_id is null
        and error_code is null
      )
      or (
        status in (
          'succeeded',
          'failed',
          'rate_limited',
          'compensation_failed'
        )
        and completed_at is not null
      )
    ),
  constraint internal_user_creation_audit_succeeded_check
    check (
      status <> 'succeeded'
      or (
        target_auth_user_id is not null
        and error_code is null
      )
    ),
  constraint internal_user_creation_audit_failed_check
    check (
      status <> 'failed'
      or error_code is not null
    ),
  constraint internal_user_creation_audit_rate_limited_check
    check (
      status <> 'rate_limited'
      or (
        target_auth_user_id is null
        and error_code in (
          'actor_rate_limit',
          'global_rate_limit'
        )
      )
    ),
  constraint internal_user_creation_audit_compensation_failed_check
    check (
      status <> 'compensation_failed'
      or (
        target_auth_user_id is not null
        and error_code = 'provisioning_compensation_failed'
      )
    )
);

create index internal_user_creation_audit_actor_created_at_idx
on private.internal_user_creation_audit (
  actor_profile_id,
  created_at desc
);

create index internal_user_creation_audit_created_at_idx
on private.internal_user_creation_audit (
  created_at desc
);

create index internal_user_creation_audit_status_created_at_idx
on private.internal_user_creation_audit (
  status,
  created_at desc
);

revoke all on table private.internal_user_creation_audit
from public, anon, authenticated, service_role;

create or replace function public.begin_internal_user_creation_attempt(
  p_target_role public.app_role
)
returns table (
  allowed boolean,
  attempt_id uuid,
  limited_scope text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_attempt_id uuid;
  v_actor_attempt_count integer;
  v_global_attempt_count integer;
begin
  if v_actor_id is null then
    raise exception 'No autorizado.'
      using errcode = '42501';
  end if;

  if p_target_role is null then
    raise exception 'Rol objetivo obligatorio.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.perfiles as p
    where p.id = v_actor_id
      and p.role = 'admin'::public.app_role
      and p.is_active = true
      and p.must_change_password = false
  ) then
    raise exception 'No autorizado.'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'internal_user_creation_audit_rate_limit',
      0
    )
  );

  select count(*)::integer
  into v_actor_attempt_count
  from private.internal_user_creation_audit as a
  where a.actor_profile_id = v_actor_id
    and a.created_at >= pg_catalog.now() - interval '10 minutes'
    and a.status in (
      'pending',
      'succeeded',
      'failed',
      'compensation_failed'
    );

  if v_actor_attempt_count >= 5 then
    insert into private.internal_user_creation_audit (
      actor_profile_id,
      target_role,
      status,
      error_code,
      completed_at
    )
    values (
      v_actor_id,
      p_target_role,
      'rate_limited',
      'actor_rate_limit',
      pg_catalog.now()
    )
    returning id
    into v_attempt_id;

    allowed := false;
    attempt_id := v_attempt_id;
    limited_scope := 'actor';
    return next;
    return;
  end if;

  select count(*)::integer
  into v_global_attempt_count
  from private.internal_user_creation_audit as a
  where a.created_at >= pg_catalog.now() - interval '1 hour'
    and a.status in (
      'pending',
      'succeeded',
      'failed',
      'compensation_failed'
    );

  if v_global_attempt_count >= 20 then
    insert into private.internal_user_creation_audit (
      actor_profile_id,
      target_role,
      status,
      error_code,
      completed_at
    )
    values (
      v_actor_id,
      p_target_role,
      'rate_limited',
      'global_rate_limit',
      pg_catalog.now()
    )
    returning id
    into v_attempt_id;

    allowed := false;
    attempt_id := v_attempt_id;
    limited_scope := 'global';
    return next;
    return;
  end if;

  insert into private.internal_user_creation_audit (
    actor_profile_id,
    target_role,
    status
  )
  values (
    v_actor_id,
    p_target_role,
    'pending'
  )
  returning id
  into v_attempt_id;

  allowed := true;
  attempt_id := v_attempt_id;
  limited_scope := null;
  return next;
end;
$$;

create or replace function public.complete_internal_user_creation_attempt(
  p_attempt_id uuid,
  p_status text,
  p_error_code text default null,
  p_target_auth_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_attempt_id uuid;
begin
  if v_actor_id is null then
    raise exception 'No autorizado.'
      using errcode = '42501';
  end if;

  if p_attempt_id is null then
    raise exception 'Intento obligatorio.'
      using errcode = '22023';
  end if;

  if p_status not in (
    'succeeded',
    'failed',
    'compensation_failed'
  ) then
    raise exception 'Estado de finalizacion invalido.'
      using errcode = '22023';
  end if;

  if p_error_code is not null and (
    length(p_error_code) > 64
    or p_error_code !~ '^[a-z0-9_]+$'
  ) then
    raise exception 'Codigo de error invalido.'
      using errcode = '22023';
  end if;

  if p_status = 'succeeded' and (
    p_target_auth_user_id is null
    or p_error_code is not null
  ) then
    raise exception 'Finalizacion exitosa invalida.'
      using errcode = '22023';
  end if;

  if p_status = 'failed' and p_error_code not in (
    'already_exists',
    'weak_password',
    'auth_rate_limited',
    'configuration_error',
    'auth_error',
    'invalid_auth_response',
    'provisioning_error',
    'unexpected_error'
  ) then
    raise exception 'Codigo de fallo invalido.'
      using errcode = '22023';
  end if;

  if p_status = 'compensation_failed' and (
    p_target_auth_user_id is null
    or p_error_code <> 'provisioning_compensation_failed'
  ) then
    raise exception 'Finalizacion de compensacion invalida.'
      using errcode = '22023';
  end if;

  update private.internal_user_creation_audit as a
  set
    status = p_status,
    error_code = p_error_code,
    target_auth_user_id = p_target_auth_user_id,
    completed_at = pg_catalog.now()
  where a.id = p_attempt_id
    and a.actor_profile_id = v_actor_id
    and a.status = 'pending'
  returning a.id
  into v_attempt_id;

  if v_attempt_id is null then
    raise exception 'No existe un intento pendiente para finalizar.'
      using errcode = 'P0002';
  end if;

  return v_attempt_id;
end;
$$;

revoke all on function public.begin_internal_user_creation_attempt(
  public.app_role
)
from public, anon;

revoke all on function public.complete_internal_user_creation_attempt(
  uuid,
  text,
  text,
  uuid
)
from public, anon;

grant execute on function public.begin_internal_user_creation_attempt(
  public.app_role
)
to authenticated;

grant execute on function public.complete_internal_user_creation_attempt(
  uuid,
  text,
  text,
  uuid
)
to authenticated;
