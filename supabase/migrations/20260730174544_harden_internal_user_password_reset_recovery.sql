create unique index internal_user_password_reset_audit_one_pending_per_target_idx
on private.internal_user_password_reset_audit (target_profile_id)
where status = 'pending';

drop function if exists public.begin_internal_user_password_reset(uuid);

create or replace function public.begin_internal_user_password_reset(
  p_target_profile_id uuid,
  p_attempt_id uuid
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
  v_attempt record;
  v_target_id uuid;
  v_previous_is_active boolean;
  v_previous_must_change_password boolean;
  v_current_is_active boolean;
  v_current_must_change_password boolean;
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

  if p_attempt_id is null then
    raise exception 'Intento obligatorio.'
      using errcode = '22023';
  end if;

  if p_target_profile_id = v_actor_id then
    raise exception 'No puedes restablecer tu propia contraseña.'
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
    a.id,
    a.actor_profile_id,
    a.target_profile_id,
    a.status,
    a.error_code,
    a.previous_is_active,
    a.previous_must_change_password
  into v_attempt
  from private.internal_user_password_reset_audit as a
  where a.id = p_attempt_id
  for update;

  if v_attempt.id is not null then
    if v_attempt.actor_profile_id <> v_actor_id
      or v_attempt.target_profile_id <> p_target_profile_id
    then
      raise exception 'Intento de restablecimiento inválido.'
        using errcode = 'P0001';
    end if;

    if v_attempt.status = 'pending' then
      select
        p.is_active,
        p.must_change_password
      into
        v_current_is_active,
        v_current_must_change_password
      from public.perfiles as p
      where p.id = p_target_profile_id
      for update;

      if v_current_is_active is distinct from false
        or v_current_must_change_password is distinct from true
      then
        raise exception 'El intento pendiente requiere atención.'
          using errcode = 'P0001';
      end if;

      allowed := true;
      attempt_id := p_attempt_id;
      limited_scope := null;
      previous_is_active := v_attempt.previous_is_active;
      previous_must_change_password := v_attempt.previous_must_change_password;
      return next;
      return;
    end if;

    if v_attempt.status = 'rate_limited' then
      allowed := false;
      attempt_id := p_attempt_id;
      limited_scope := case v_attempt.error_code
        when 'actor_rate_limit' then 'actor'
        when 'target_rate_limit' then 'target'
        when 'global_rate_limit' then 'global'
        else null
      end;
      previous_is_active := v_attempt.previous_is_active;
      previous_must_change_password := v_attempt.previous_must_change_password;
      return next;
      return;
    end if;

    raise exception 'El intento ya fue finalizado.'
      using errcode = 'P0001';
  end if;

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
      id,
      actor_profile_id,
      target_profile_id,
      status,
      error_code,
      previous_is_active,
      previous_must_change_password,
      completed_at
    )
    values (
      p_attempt_id,
      v_actor_id,
      p_target_profile_id,
      'rate_limited',
      'actor_rate_limit',
      v_previous_is_active,
      v_previous_must_change_password,
      pg_catalog.now()
    );

    allowed := false;
    attempt_id := p_attempt_id;
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
      id,
      actor_profile_id,
      target_profile_id,
      status,
      error_code,
      previous_is_active,
      previous_must_change_password,
      completed_at
    )
    values (
      p_attempt_id,
      v_actor_id,
      p_target_profile_id,
      'rate_limited',
      'target_rate_limit',
      v_previous_is_active,
      v_previous_must_change_password,
      pg_catalog.now()
    );

    allowed := false;
    attempt_id := p_attempt_id;
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
      id,
      actor_profile_id,
      target_profile_id,
      status,
      error_code,
      previous_is_active,
      previous_must_change_password,
      completed_at
    )
    values (
      p_attempt_id,
      v_actor_id,
      p_target_profile_id,
      'rate_limited',
      'global_rate_limit',
      v_previous_is_active,
      v_previous_must_change_password,
      pg_catalog.now()
    );

    allowed := false;
    attempt_id := p_attempt_id;
    limited_scope := 'global';
    previous_is_active := v_previous_is_active;
    previous_must_change_password := v_previous_must_change_password;
    return next;
    return;
  end if;

  insert into private.internal_user_password_reset_audit (
    id,
    actor_profile_id,
    target_profile_id,
    status,
    previous_is_active,
    previous_must_change_password
  )
  values (
    p_attempt_id,
    v_actor_id,
    p_target_profile_id,
    'pending',
    v_previous_is_active,
    v_previous_must_change_password
  );

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
  attempt_id := p_attempt_id;
  limited_scope := null;
  previous_is_active := v_previous_is_active;
  previous_must_change_password := v_previous_must_change_password;
  return next;
end;
$$;

create or replace function public.get_internal_user_password_reset_state(
  p_attempt_id uuid
)
returns table (
  attempt_id uuid,
  status text,
  target_profile_id uuid,
  previous_is_active boolean,
  previous_must_change_password boolean,
  current_is_active boolean,
  current_must_change_password boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or p_attempt_id is null then
    return;
  end if;

  return query
  select
    a.id,
    a.status,
    a.target_profile_id,
    a.previous_is_active,
    a.previous_must_change_password,
    p.is_active,
    p.must_change_password
  from private.internal_user_password_reset_audit as a
  join public.perfiles as p
    on p.id = a.target_profile_id
  where a.id = p_attempt_id
    and a.actor_profile_id = v_actor_id;
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
    raise exception 'Estado de finalización inválido.'
      using errcode = '22023';
  end if;

  if p_error_code is not null and (
    length(p_error_code) > 64
    or p_error_code !~ '^[a-z0-9_]+$'
  ) then
    raise exception 'Código de error inválido.'
      using errcode = '22023';
  end if;

  if p_status = 'succeeded' and p_error_code is not null then
    raise exception 'Finalización exitosa inválida.'
      using errcode = '22023';
  end if;

  if p_status = 'failed' and p_error_code is null then
    raise exception 'Código de fallo obligatorio.'
      using errcode = '22023';
  end if;

  if p_status = 'attention_required' and p_error_code not in (
    'finalization_failed',
    'rollback_failed'
  ) then
    raise exception 'Código de atención inválido.'
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

alter function public.begin_internal_user_password_reset(uuid, uuid)
owner to postgres;

alter function public.get_internal_user_password_reset_state(uuid)
owner to postgres;

alter function public.complete_internal_user_password_reset(uuid, text, text)
owner to postgres;

revoke all
on function public.begin_internal_user_password_reset(uuid, uuid)
from public, anon, service_role;

revoke all
on function public.get_internal_user_password_reset_state(uuid)
from public, anon, service_role;

revoke all
on function public.complete_internal_user_password_reset(uuid, text, text)
from public, anon, service_role;

grant execute
on function public.begin_internal_user_password_reset(uuid, uuid)
to authenticated;

grant execute
on function public.get_internal_user_password_reset_state(uuid)
to authenticated;

grant execute
on function public.complete_internal_user_password_reset(uuid, text, text)
to authenticated;
