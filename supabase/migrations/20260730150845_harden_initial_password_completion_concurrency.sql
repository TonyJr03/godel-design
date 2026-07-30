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
