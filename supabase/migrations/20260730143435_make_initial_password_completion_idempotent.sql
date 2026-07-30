create or replace function public.complete_initial_password_change(
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.perfiles%rowtype;
begin
  if p_user_id is null then
    raise exception 'El usuario es obligatorio.'
      using errcode = '22023';
  end if;

  select *
  into v_profile
  from public.perfiles
  where id = p_user_id;

  if v_profile.id is null then
    raise exception 'No existe el perfil interno.'
      using errcode = 'P0002';
  end if;

  if v_profile.is_active is not true then
    raise exception 'El perfil interno no esta activo.'
      using errcode = 'P0001';
  end if;

  if v_profile.must_change_password is true then
    update public.perfiles
    set must_change_password = false
    where id = p_user_id
      and is_active = true
      and must_change_password = true;
  end if;

  return p_user_id;
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
