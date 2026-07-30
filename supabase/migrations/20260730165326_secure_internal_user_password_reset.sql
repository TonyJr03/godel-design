create table private.internal_user_password_reset_audit (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null,
  target_profile_id uuid not null,
  status text not null,
  error_code text null,
  previous_is_active boolean not null,
  previous_must_change_password boolean not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint internal_user_password_reset_audit_actor_profile_id_fkey
    foreign key (actor_profile_id)
    references public.perfiles(id)
    on delete restrict,
  constraint internal_user_password_reset_audit_target_profile_id_fkey
    foreign key (target_profile_id)
    references public.perfiles(id)
    on delete restrict,
  constraint internal_user_password_reset_audit_status_check
    check (
      status in (
        'pending',
        'succeeded',
        'failed',
        'rate_limited',
        'attention_required'
      )
    ),
  constraint internal_user_password_reset_audit_error_code_format_check
    check (
      error_code is null
      or (
        length(error_code) <= 64
        and error_code ~ '^[a-z0-9_]+$'
      )
    ),
  constraint internal_user_password_reset_audit_completion_check
    check (
      (
        status = 'pending'
        and completed_at is null
      )
      or (
        status in (
          'succeeded',
          'failed',
          'rate_limited',
          'attention_required'
        )
        and completed_at is not null
      )
    ),
  constraint internal_user_password_reset_audit_succeeded_check
    check (
      status <> 'succeeded'
      or error_code is null
    ),
  constraint internal_user_password_reset_audit_failed_check
    check (
      status <> 'failed'
      or error_code is not null
    ),
  constraint internal_user_password_reset_audit_rate_limited_check
    check (
      status <> 'rate_limited'
      or error_code in (
        'actor_rate_limit',
        'target_rate_limit',
        'global_rate_limit'
      )
    ),
  constraint internal_user_password_reset_audit_attention_required_check
    check (
      status <> 'attention_required'
      or error_code is not null
    )
);

create index internal_user_password_reset_audit_actor_created_at_idx
on private.internal_user_password_reset_audit (
  actor_profile_id,
  created_at desc
);

create index internal_user_password_reset_audit_target_created_at_idx
on private.internal_user_password_reset_audit (
  target_profile_id,
  created_at desc
);

create index internal_user_password_reset_audit_status_created_at_idx
on private.internal_user_password_reset_audit (
  status,
  created_at desc
);

revoke all on table private.internal_user_password_reset_audit
from public, anon, authenticated, service_role;

create or replace function public.begin_internal_user_password_reset(
  p_target_profile_id uuid
)
returns table (
  allowed boolean,
  attempt_id uuid,
  limited_scope text,
  previous_is_active boolean,
  previous_must_change_password boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_attempt_id uuid;
  v_target_id uuid;
  v_previous_is_active boolean;
  v_previous_must_change_password boolean;
  v_actor_attempt_count integer;
  v_target_attempt_count integer;
  v_global_attempt_count integer;
  v_updated_id uuid;
begin
  if v_actor_id is null then
    raise exception 'No autorizado.'
      using errcode = '42501';
  end if;

  if p_target_profile_id is null then
    raise exception 'Usuario objetivo obligatorio.'
      using errcode = '22023';
  end if;

  if p_target_profile_id = v_actor_id then
    raise exception 'No puedes restablecer tu propia contrasena.'
      using errcode = '42501';
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
      'internal_user_password_reset',
      0
    )
  );

  select
    p.id,
    p.is_active,
    p.must_change_password
  into
    v_target_id,
    v_previous_is_active,
    v_previous_must_change_password
  from public.perfiles as p
  where p.id = p_target_profile_id
  for update;

  if v_target_id is null then
    raise exception 'No existe el usuario objetivo.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from private.internal_user_password_reset_audit as a
    where a.target_profile_id = p_target_profile_id
      and a.status = 'pending'
  ) then
    raise exception 'reset_in_progress'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_actor_attempt_count
  from private.internal_user_password_reset_audit as a
  where a.actor_profile_id = v_actor_id
    and a.created_at >= pg_catalog.now() - interval '10 minutes'
    and a.status in (
      'pending',
      'succeeded',
      'failed',
      'attention_required'
    );

  if v_actor_attempt_count >= 3 then
    insert into private.internal_user_password_reset_audit (
      actor_profile_id,
      target_profile_id,
      status,
      error_code,
      previous_is_active,
      previous_must_change_password,
      completed_at
    )
    values (
      v_actor_id,
      p_target_profile_id,
      'rate_limited',
      'actor_rate_limit',
      v_previous_is_active,
      v_previous_must_change_password,
      pg_catalog.now()
    )
    returning id
    into v_attempt_id;

    allowed := false;
    attempt_id := v_attempt_id;
    limited_scope := 'actor';
    previous_is_active := v_previous_is_active;
    previous_must_change_password := v_previous_must_change_password;
    return next;
    return;
  end if;

  select count(*)::integer
  into v_target_attempt_count
  from private.internal_user_password_reset_audit as a
  where a.target_profile_id = p_target_profile_id
    and a.created_at >= pg_catalog.now() - interval '1 hour'
    and a.status in (
      'pending',
      'succeeded',
      'failed',
      'attention_required'
    );

  if v_target_attempt_count >= 3 then
    insert into private.internal_user_password_reset_audit (
      actor_profile_id,
      target_profile_id,
      status,
      error_code,
      previous_is_active,
      previous_must_change_password,
      completed_at
    )
    values (
      v_actor_id,
      p_target_profile_id,
      'rate_limited',
      'target_rate_limit',
      v_previous_is_active,
      v_previous_must_change_password,
      pg_catalog.now()
    )
    returning id
    into v_attempt_id;

    allowed := false;
    attempt_id := v_attempt_id;
    limited_scope := 'target';
    previous_is_active := v_previous_is_active;
    previous_must_change_password := v_previous_must_change_password;
    return next;
    return;
  end if;

  select count(*)::integer
  into v_global_attempt_count
  from private.internal_user_password_reset_audit as a
  where a.created_at >= pg_catalog.now() - interval '1 hour'
    and a.status in (
      'pending',
      'succeeded',
      'failed',
      'attention_required'
    );

  if v_global_attempt_count >= 20 then
    insert into private.internal_user_password_reset_audit (
      actor_profile_id,
      target_profile_id,
      status,
      error_code,
      previous_is_active,
      previous_must_change_password,
      completed_at
    )
    values (
      v_actor_id,
      p_target_profile_id,
      'rate_limited',
      'global_rate_limit',
      v_previous_is_active,
      v_previous_must_change_password,
      pg_catalog.now()
    )
    returning id
    into v_attempt_id;

    allowed := false;
    attempt_id := v_attempt_id;
    limited_scope := 'global';
    previous_is_active := v_previous_is_active;
    previous_must_change_password := v_previous_must_change_password;
    return next;
    return;
  end if;

  insert into private.internal_user_password_reset_audit (
    actor_profile_id,
    target_profile_id,
    status,
    previous_is_active,
    previous_must_change_password
  )
  values (
    v_actor_id,
    p_target_profile_id,
    'pending',
    v_previous_is_active,
    v_previous_must_change_password
  )
  returning id
  into v_attempt_id;

  update public.perfiles as p
  set
    is_active = false,
    must_change_password = true
  where p.id = p_target_profile_id
  returning p.id
  into v_updated_id;

  if v_updated_id is null then
    raise exception 'No se pudo bloquear temporalmente el usuario.'
      using errcode = 'P0001';
  end if;

  allowed := true;
  attempt_id := v_attempt_id;
  limited_scope := null;
  previous_is_active := v_previous_is_active;
  previous_must_change_password := v_previous_must_change_password;
  return next;
end;
$$;

create or replace function public.complete_internal_user_password_reset(
  p_attempt_id uuid,
  p_status text,
  p_error_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_attempt record;
  v_updated_id uuid;
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
    'attention_required'
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

  if p_status = 'succeeded' and p_error_code is not null then
    raise exception 'Finalizacion exitosa invalida.'
      using errcode = '22023';
  end if;

  if p_status = 'failed' and p_error_code is null then
    raise exception 'Codigo de fallo obligatorio.'
      using errcode = '22023';
  end if;

  if p_status = 'attention_required' and p_error_code not in (
    'finalization_failed',
    'rollback_failed'
  ) then
    raise exception 'Codigo de atencion invalido.'
      using errcode = '22023';
  end if;

  select
    a.id,
    a.actor_profile_id,
    a.target_profile_id,
    a.status,
    a.previous_is_active,
    a.previous_must_change_password
  into v_attempt
  from private.internal_user_password_reset_audit as a
  where a.id = p_attempt_id
    and a.actor_profile_id = v_actor_id
  for update;

  if v_attempt.id is null then
    raise exception 'No existe el intento de restablecimiento.'
      using errcode = 'P0002';
  end if;

  if v_attempt.status <> 'pending' then
    if v_attempt.status = p_status then
      return v_attempt.id;
    end if;

    raise exception 'El intento ya fue finalizado con otro estado.'
      using errcode = 'P0001';
  end if;

  perform 1
  from public.perfiles as p
  where p.id = v_attempt.target_profile_id
  for update;

  if p_status = 'succeeded' then
    update public.perfiles as p
    set
      is_active = v_attempt.previous_is_active,
      must_change_password = true
    where p.id = v_attempt.target_profile_id
    returning p.id
    into v_updated_id;
  elsif p_status = 'failed' then
    update public.perfiles as p
    set
      is_active = v_attempt.previous_is_active,
      must_change_password = v_attempt.previous_must_change_password
    where p.id = v_attempt.target_profile_id
    returning p.id
    into v_updated_id;
  else
    update public.perfiles as p
    set
      is_active = false,
      must_change_password = true
    where p.id = v_attempt.target_profile_id
    returning p.id
    into v_updated_id;
  end if;

  if v_updated_id is null then
    raise exception 'No se pudo actualizar el perfil objetivo.'
      using errcode = 'P0001';
  end if;

  update private.internal_user_password_reset_audit as a
  set
    status = p_status,
    error_code = case
      when p_status = 'succeeded' then null
      else p_error_code
    end,
    completed_at = pg_catalog.now()
  where a.id = p_attempt_id
    and a.actor_profile_id = v_actor_id
    and a.status = 'pending'
  returning a.id
  into v_updated_id;

  if v_updated_id is null then
    raise exception 'No se pudo finalizar el intento.'
      using errcode = 'P0001';
  end if;

  return v_updated_id;
end;
$$;

alter function public.begin_internal_user_password_reset(uuid)
owner to postgres;

alter function public.complete_internal_user_password_reset(uuid, text, text)
owner to postgres;

revoke all
on function public.begin_internal_user_password_reset(uuid)
from public, anon, service_role;

revoke all
on function public.complete_internal_user_password_reset(uuid, text, text)
from public, anon, service_role;

grant execute
on function public.begin_internal_user_password_reset(uuid)
to authenticated;

grant execute
on function public.complete_internal_user_password_reset(uuid, text, text)
to authenticated;
