-- Baseline final 05 - Auth Admin User Lifecycle.
-- ACTIVO: migracion consolidada para reconstruccion limpia del proyecto.

-- Contains private audit tables, Auth triggers, audited user creation, initial-password completion and administrative temporary-password reset.



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

create or replace function private.provision_internal_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marker jsonb := new.raw_app_meta_data -> 'godel_provisioning';
  v_source text;
  v_full_name text;
  v_phone text;
  v_avatar_url text;
  v_role_text text;
  v_role public.app_role;
  v_created_by_text text;
  v_created_by uuid;
begin
  if v_marker is null or jsonb_typeof(v_marker) = 'null' then
    return new;
  end if;

  if jsonb_typeof(v_marker) <> 'object' then
    raise exception 'Marcador de provisionamiento interno invalido.'
      using errcode = '22023';
  end if;

  if coalesce(v_marker ->> 'version', '') <> '1' then
    raise exception 'Version de provisionamiento interno no soportada.'
      using errcode = '22023';
  end if;

  v_source := btrim(coalesce(v_marker ->> 'source', ''));

  if v_source <> 'admin_dashboard' then
    raise exception 'Origen de provisionamiento interno no permitido.'
      using errcode = '22023';
  end if;

  if btrim(coalesce(new.email, '')) = '' then
    raise exception 'El usuario Auth interno requiere correo electronico.'
      using errcode = '22023';
  end if;

  v_full_name := btrim(coalesce(v_marker ->> 'full_name', ''));
  v_phone := nullif(btrim(coalesce(v_marker ->> 'phone', '')), '');
  v_avatar_url := nullif(btrim(coalesce(v_marker ->> 'avatar_url', '')), '');
  v_role_text := lower(btrim(coalesce(v_marker ->> 'role', '')));
  v_created_by_text := btrim(coalesce(v_marker ->> 'created_by', ''));

  if v_full_name = '' then
    raise exception 'El nombre completo del perfil interno es obligatorio.'
      using errcode = '22023';
  end if;

  if length(v_full_name) > 120 then
    raise exception 'El nombre completo del perfil interno no puede superar 120 caracteres.'
      using errcode = '22023';
  end if;

  if v_phone is not null and length(v_phone) > 40 then
    raise exception 'El telefono del perfil interno no puede superar 40 caracteres.'
      using errcode = '22023';
  end if;

  if v_avatar_url is not null and length(v_avatar_url) > 500 then
    raise exception 'La URL de avatar del perfil interno no puede superar 500 caracteres.'
      using errcode = '22023';
  end if;

  if v_role_text not in ('admin', 'supervisor', 'trabajador') then
    raise exception 'Rol de provisionamiento interno invalido.'
      using errcode = '22023';
  end if;

  v_role := v_role_text::public.app_role;

  if v_created_by_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Administrador creador invalido.'
      using errcode = '22023';
  end if;

  v_created_by := v_created_by_text::uuid;

  if not exists (
    select 1
    from public.perfiles as p
    where p.id = v_created_by
      and p.role = 'admin'::public.app_role
      and p.is_active = true
      and p.must_change_password = false
  ) then
    raise exception 'El administrador creador no existe o no esta operativo.'
      using errcode = '42501';
  end if;

  insert into public.perfiles (
    id,
    full_name,
    phone,
    avatar_url,
    role,
    is_active,
    must_change_password,
    created_by
  )
  values (
    new.id,
    v_full_name,
    v_phone,
    v_avatar_url,
    v_role,
    true,
    true,
    v_created_by
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_provision_internal_profile
on auth.users;

create trigger on_auth_user_created_provision_internal_profile
after insert on auth.users
for each row
execute function private.provision_internal_profile_from_auth_user();

revoke all on function private.provision_internal_profile_from_auth_user()
from public, anon, authenticated;

grant execute on function private.provision_internal_profile_from_auth_user()
to supabase_auth_admin;

drop trigger if exists on_auth_user_app_metadata_provision_internal_profile
on auth.users;

create trigger on_auth_user_app_metadata_provision_internal_profile
after update of raw_app_meta_data on auth.users
for each row
when (
  coalesce(
    jsonb_typeof(old.raw_app_meta_data -> 'godel_provisioning'),
    'null'
  ) = 'null'
  and
  coalesce(
    jsonb_typeof(new.raw_app_meta_data -> 'godel_provisioning'),
    'null'
  ) <> 'null'
)
execute function private.provision_internal_profile_from_auth_user();


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


create or replace function public.complete_initial_password_change(
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_is_active boolean;
  v_must_change_password boolean;
  v_updated_id uuid;
begin
  if p_user_id is null then
    raise exception 'El usuario es obligatorio.'
      using errcode = '22023';
  end if;

  select
    id,
    is_active,
    must_change_password
  into
    v_profile_id,
    v_is_active,
    v_must_change_password
  from public.perfiles
  where id = p_user_id
  for update;

  if v_profile_id is null then
    raise exception 'No existe el perfil interno.'
      using errcode = 'P0002';
  end if;

  if v_is_active is not true then
    raise exception 'El perfil interno no está activo.'
      using errcode = 'P0001';
  end if;

  if v_must_change_password is false then
    return p_user_id;
  end if;

  if v_must_change_password is not true then
    raise exception 'El estado de cambio inicial no es válido.'
      using errcode = '22023';
  end if;

  update public.perfiles
  set must_change_password = false
  where id = p_user_id
    and is_active = true
    and must_change_password = true
  returning id
  into v_updated_id;

  if v_updated_id is null then
    raise exception 'No se pudo completar el cambio inicial de contraseña.'
      using errcode = 'P0001';
  end if;

  return v_updated_id;
end;
$$;

alter function public.complete_initial_password_change(uuid)
owner to postgres;

revoke all
on function public.complete_initial_password_change(uuid)
from public, anon, authenticated;

grant execute
on function public.complete_initial_password_change(uuid)
to service_role;


create unique index internal_user_password_reset_audit_one_pending_per_target_idx
on private.internal_user_password_reset_audit (target_profile_id)
where status = 'pending';


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



do $$
begin
  if to_regclass('private.internal_user_creation_audit') is null then
    raise exception 'Auth Admin User Lifecycle assertion failed: missing creation audit table.';
  end if;

  if to_regclass('private.internal_user_password_reset_audit') is null then
    raise exception 'Auth Admin User Lifecycle assertion failed: missing password reset audit table.';
  end if;

  if to_regprocedure('private.provision_internal_profile_from_auth_user()') is null then
    raise exception 'Auth Admin User Lifecycle assertion failed: missing provisioning function.';
  end if;

  if to_regprocedure('public.complete_initial_password_change(uuid)') is null then
    raise exception 'Auth Admin User Lifecycle assertion failed: missing final initial password RPC.';
  end if;

  if to_regprocedure('public.begin_internal_user_password_reset(uuid, uuid)') is null then
    raise exception 'Auth Admin User Lifecycle assertion failed: missing final begin reset RPC.';
  end if;

  if to_regprocedure('public.get_internal_user_password_reset_state(uuid)') is null then
    raise exception 'Auth Admin User Lifecycle assertion failed: missing reset state RPC.';
  end if;

  if to_regprocedure('public.complete_internal_user_password_reset(uuid, text, text)') is null then
    raise exception 'Auth Admin User Lifecycle assertion failed: missing final complete reset RPC.';
  end if;
end;
$$;
