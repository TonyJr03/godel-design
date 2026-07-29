-- Etapa 1: base segura para alta administrativa futura de usuarios internos.
-- No crea cliente Admin API, no usa secrets y no habilita UI.

alter table public.perfiles
add column must_change_password boolean not null default false,
add column created_by uuid null;

alter table public.perfiles
add constraint perfiles_created_by_fkey
foreign key (created_by)
references public.perfiles(id)
on delete set null;

alter table public.perfiles
add constraint perfiles_created_by_not_self
check (created_by is null or created_by <> id);

create or replace function private.current_user_role()
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select p.role
  from public.perfiles as p
  where p.id = auth.uid()
    and p.is_active = true
    and p.must_change_password = false
  limit 1;
$$;

create or replace function private.current_user_is_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.perfiles as p
    where p.id = auth.uid()
      and p.is_active = true
      and p.must_change_password = false
  );
$$;

create or replace function private.provision_internal_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, private
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

create or replace function public.complete_initial_password_change(
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_profile_id uuid;
begin
  if p_user_id is null then
    raise exception 'El usuario es obligatorio.'
      using errcode = '22023';
  end if;

  update public.perfiles
  set must_change_password = false
  where id = p_user_id
    and is_active = true
    and must_change_password = true
  returning id
  into v_profile_id;

  if v_profile_id is null then
    raise exception 'No existe un perfil activo pendiente de cambio inicial de contrasena.'
      using errcode = 'P0002';
  end if;

  return v_profile_id;
end;
$$;

revoke all on function public.complete_initial_password_change(uuid)
from public, anon, authenticated;

grant execute on function public.complete_initial_password_change(uuid)
to service_role;
