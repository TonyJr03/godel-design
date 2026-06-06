-- Consolidated private helpers, grants and RLS policies.
-- The policy expressions mirror the effective state of the previous migration
-- history. Security refinements will be added in later dedicated migrations.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

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
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(private.current_user_role() = 'admin'::public.app_role, false);
$$;

create or replace function private.is_supervisor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(private.current_user_role() = 'supervisor'::public.app_role, false);
$$;

create or replace function private.is_admin_or_supervisor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    private.current_user_role() in ('admin'::public.app_role, 'supervisor'::public.app_role),
    false
  );
$$;

create or replace function private.is_assigned_to_pedido(p_pedido_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when auth.uid() is null
      or p_pedido_id is null
      or not private.current_user_is_active()
    then false
    else exists (
      select 1
      from public.pedido_trabajadores as pt
      where pt.pedido_id = p_pedido_id
        and pt.assigned_profile_id = auth.uid()
    )
  end;
$$;

create or replace function private.can_access_pedido(p_pedido_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_pedido_id is null then false
    else private.is_admin_or_supervisor()
      or private.is_assigned_to_pedido(p_pedido_id)
  end;
$$;

create or replace function private.can_manage_pedido_tasks(p_pedido_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status public.pedido_estado;
begin
  if auth.uid() is null
    or p_pedido_id is null
    or not private.current_user_is_active() then
    return false;
  end if;

  select p.status
  into v_status
  from public.pedidos as p
  where p.id = p_pedido_id
  for update;

  if not found then
    return false;
  end if;

  return private.can_access_pedido(p_pedido_id)
    and v_status in (
      'creado'::public.pedido_estado,
      'solicitud_recibida'::public.pedido_estado,
      'en_revision'::public.pedido_estado,
      'en_produccion'::public.pedido_estado
    );
end;
$$;

create or replace function private.pedido_file_visibility_for_status(
  p_status public.pedido_estado
)
returns public.archivo_visibility
language sql
immutable
set search_path = public
as $$
  select case
    when p_status in (
      'creado'::public.pedido_estado,
      'solicitud_recibida'::public.pedido_estado,
      'en_revision'::public.pedido_estado
    ) then 'interno_pedido'::public.archivo_visibility
    when p_status = 'en_produccion'::public.pedido_estado
      then 'avance'::public.archivo_visibility
    when p_status = 'listo_entrega'::public.pedido_estado
      then 'final_entrega'::public.archivo_visibility
    else null
  end;
$$;

create or replace function private.pedido_file_path_matches(
  p_file_path text,
  p_pedido_id uuid,
  p_visibility public.archivo_visibility
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_file_path is not null
    and p_pedido_id is not null
    and p_visibility in (
      'interno_pedido'::public.archivo_visibility,
      'avance'::public.archivo_visibility,
      'final_entrega'::public.archivo_visibility
    )
    and p_file_path !~ '/{2,}'
    and array_length(string_to_array(p_file_path, '/'), 1) = 4
    and split_part(p_file_path, '/', 1) = 'pedidos'
    and split_part(p_file_path, '/', 2) = p_pedido_id::text
    and split_part(p_file_path, '/', 3) = case p_visibility
      when 'interno_pedido'::public.archivo_visibility then 'internos'
      when 'avance'::public.archivo_visibility then 'avances'
      when 'final_entrega'::public.archivo_visibility then 'finales'
    end
    and btrim(split_part(p_file_path, '/', 4)) <> '';
$$;

create or replace function private.can_insert_pedido_file_metadata(
  p_bucket text,
  p_file_path text,
  p_pedido_id uuid,
  p_solicitud_id uuid,
  p_uploaded_by uuid,
  p_visibility public.archivo_visibility,
  p_file_name text,
  p_file_size bigint,
  p_file_type text
)
returns boolean
language sql
security definer
set search_path = public, private
stable
as $$
  select auth.uid() is not null
    and private.current_user_is_active()
    and p_bucket = 'godel-files'
    and p_pedido_id is not null
    and p_solicitud_id is null
    and p_uploaded_by = auth.uid()
    and btrim(coalesce(p_file_name, '')) <> ''
    and p_file_size > 0
    and p_file_size <= 20971520
    and p_file_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/x-zip-compressed'
    )
    and private.can_access_pedido(p_pedido_id)
    and private.pedido_file_path_matches(
      p_file_path,
      p_pedido_id,
      p_visibility
    )
    and exists (
      select 1
      from public.pedidos as p
      where p.id = p_pedido_id
        and p_visibility = private.pedido_file_visibility_for_status(p.status)
    );
$$;

create or replace function private.solicitud_has_accessible_pedido(p_solicitud_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_solicitud_id is null then false
    else exists (
      select 1
      from public.solicitudes as s
      join public.pedidos as p
        on (
          p.solicitud_id = s.id
          or s.converted_order_id = p.id
        )
      where s.id = p_solicitud_id
        and private.can_access_pedido(p.id)
    )
  end;
$$;

create or replace function private.can_access_solicitud(p_solicitud_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_solicitud_id is null then false
    else private.is_admin_or_supervisor()
      or private.solicitud_has_accessible_pedido(p_solicitud_id)
  end;
$$;

create or replace function private.ensure_active_order_assignment_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.perfiles as p
    where p.id = new.assigned_profile_id
      and p.is_active = true
  ) then
    raise exception 'El perfil asignado debe estar activo'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.ensure_perfil_admin_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_active_admins integer;
begin
  if tg_op = 'UPDATE' then
    if auth.uid() = old.id and old.is_active and not new.is_active then
      raise exception 'No puedes desactivar tu propio perfil'
        using errcode = '23514';
    end if;

    if auth.uid() = old.id
      and old.role = 'admin'::public.app_role
      and new.role <> 'admin'::public.app_role
    then
      raise exception 'No puedes quitar tu propio rol de administrador'
        using errcode = '23514';
    end if;

    if old.role = 'admin'::public.app_role
      and old.is_active
      and (
        new.role <> 'admin'::public.app_role
        or not new.is_active
      )
    then
      perform pg_advisory_xact_lock(hashtext('perfiles_active_admin_guard'));

      select count(*)
      into v_other_active_admins
      from public.perfiles as p
      where p.id <> old.id
        and p.role = 'admin'::public.app_role
        and p.is_active = true;

      if v_other_active_admins = 0 then
        raise exception 'Debe existir al menos un administrador activo'
          using errcode = '23514';
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'admin'::public.app_role and old.is_active then
      perform pg_advisory_xact_lock(hashtext('perfiles_active_admin_guard'));

      select count(*)
      into v_other_active_admins
      from public.perfiles as p
      where p.id <> old.id
        and p.role = 'admin'::public.app_role
        and p.is_active = true;

      if v_other_active_admins = 0 then
        raise exception 'Debe existir al menos un administrador activo'
          using errcode = '23514';
      end if;
    end if;

    return old;
  end if;

  return new;
end;
$$;

grant usage on schema private to anon, authenticated;

revoke all on function private.current_user_role()
from public, anon, authenticated;
revoke all on function private.current_user_is_active()
from public, anon, authenticated;
revoke all on function private.is_admin()
from public, anon, authenticated;
revoke all on function private.is_supervisor()
from public, anon, authenticated;
revoke all on function private.is_admin_or_supervisor()
from public, anon, authenticated;
revoke all on function private.is_assigned_to_pedido(uuid)
from public, anon, authenticated;
revoke all on function private.can_access_pedido(uuid)
from public, anon, authenticated;
revoke all on function private.can_manage_pedido_tasks(uuid)
from public, anon, authenticated;
revoke all on function private.pedido_file_visibility_for_status(public.pedido_estado)
from public, anon, authenticated;
revoke all on function private.pedido_file_path_matches(
  text,
  uuid,
  public.archivo_visibility
)
from public, anon, authenticated;
revoke all on function private.can_insert_pedido_file_metadata(
  text,
  text,
  uuid,
  uuid,
  uuid,
  public.archivo_visibility,
  text,
  bigint,
  text
)
from public, anon, authenticated;
revoke all on function private.solicitud_has_accessible_pedido(uuid)
from public, anon, authenticated;
revoke all on function private.can_access_solicitud(uuid)
from public, anon, authenticated;

grant execute on function private.current_user_role() to authenticated;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_supervisor() to authenticated;
grant execute on function private.is_admin_or_supervisor() to authenticated;
grant execute on function private.is_assigned_to_pedido(uuid) to authenticated;
grant execute on function private.can_access_pedido(uuid) to authenticated;
grant execute on function private.can_manage_pedido_tasks(uuid) to authenticated;
grant execute on function private.pedido_file_visibility_for_status(
  public.pedido_estado
) to authenticated;
grant execute on function private.pedido_file_path_matches(
  text,
  uuid,
  public.archivo_visibility
) to authenticated;
grant execute on function private.can_insert_pedido_file_metadata(
  text,
  text,
  uuid,
  uuid,
  uuid,
  public.archivo_visibility,
  text,
  bigint,
  text
) to authenticated;
grant execute on function private.can_access_solicitud(uuid) to authenticated;

revoke all on function private.ensure_active_order_assignment_profile()
from public, anon, authenticated;

revoke all on function private.ensure_perfil_admin_integrity()
from public, anon, authenticated;

create trigger ensure_perfil_admin_integrity
before update of role, is_active or delete
on public.perfiles
for each row
execute function private.ensure_perfil_admin_integrity();

create trigger ensure_active_order_assignment_profile
before insert or update of assigned_profile_id
on public.pedido_trabajadores
for each row
execute function private.ensure_active_order_assignment_profile();

grant insert on table public.solicitudes to anon;

grant select, insert, update, delete on table
  public.perfiles,
  public.clientes,
  public.solicitudes,
  public.pedidos,
  public.pedido_trabajadores,
  public.pedido_tareas,
  public.archivos
to authenticated;

grant select, insert on table
  public.pedido_comentarios,
  public.solicitud_comentarios,
  public.solicitud_historial
to authenticated;

grant select on table public.pedido_historial to authenticated;

revoke all on table public.pedido_contadores
from public, anon, authenticated;

revoke all on table
  public.solicitud_comentarios,
  public.solicitud_historial
from public, anon;

revoke all on type public.solicitud_historial_action from public, anon;
grant usage on type public.solicitud_historial_action to authenticated;

revoke all on type public.pedido_tarea_tipo from public, anon;
grant usage on type public.pedido_tarea_tipo to authenticated;

create policy perfiles_select_visible
on public.perfiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    id = (select auth.uid())
    or private.is_admin_or_supervisor()
    or exists (
      select 1
      from public.pedido_trabajadores as pt
      where pt.assigned_profile_id = perfiles.id
        and private.can_access_pedido(pt.pedido_id)
    )
  )
);

create policy perfiles_insert_admin
on public.perfiles
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.is_admin()
);

create policy perfiles_update_admin
on public.perfiles
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin()
)
with check (
  (select auth.uid()) is not null
  and private.is_admin()
);

create policy clientes_select_accessible
on public.clientes
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or exists (
      select 1
      from public.pedidos as p
      where p.cliente_id = clientes.id
        and private.can_access_pedido(p.id)
    )
  )
);

create policy clientes_insert_manager
on public.clientes
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy clientes_update_manager
on public.clientes
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
)
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy solicitudes_insert_public
on public.solicitudes
for insert
to anon, authenticated
with check (
  status = 'nueva'::public.solicitud_estado
  and reviewed_by is null
  and converted_order_id is null
  and cliente_id is null
);

create policy solicitudes_select_accessible
on public.solicitudes
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_access_solicitud(id)
);

create policy solicitudes_update_manager
on public.solicitudes
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
)
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy solicitudes_delete_admin
on public.solicitudes
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin()
);

create policy pedidos_select_accessible
on public.pedidos
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_access_pedido(id)
);

create policy pedidos_insert_manager
on public.pedidos
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy pedidos_update_manager
on public.pedidos
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
)
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy pedidos_delete_admin
on public.pedidos
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin()
);

create policy pedido_trabajadores_select_accessible
on public.pedido_trabajadores
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or private.is_assigned_to_pedido(pedido_id)
  )
);

create policy pedido_trabajadores_insert_manager
on public.pedido_trabajadores
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy pedido_trabajadores_update_manager
on public.pedido_trabajadores
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
)
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy pedido_trabajadores_delete_manager
on public.pedido_trabajadores
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy pedido_tareas_select_accessible
on public.pedido_tareas
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.can_access_pedido(pedido_id)
);

create policy pedido_tareas_insert_accessible
on public.pedido_tareas
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.can_manage_pedido_tasks(pedido_id)
  and created_by = (select auth.uid())
);

create policy pedido_tareas_update_accessible
on public.pedido_tareas
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.can_manage_pedido_tasks(pedido_id)
)
with check (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.can_manage_pedido_tasks(pedido_id)
);

create policy pedido_tareas_delete_accessible
on public.pedido_tareas
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.can_manage_pedido_tasks(pedido_id)
);

create policy archivos_select_accessible
on public.archivos
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or (
      pedido_id is not null
      and private.is_assigned_to_pedido(pedido_id)
    )
  )
);

create policy archivos_insert_accessible
on public.archivos
for insert
to authenticated
with check (
  private.can_insert_pedido_file_metadata(
    bucket,
    file_path,
    pedido_id,
    solicitud_id,
    uploaded_by,
    visibility,
    file_name,
    file_size,
    file_type
  )
);

create policy archivos_update_manager
on public.archivos
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
)
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy archivos_delete_manager
on public.archivos
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy pedido_comentarios_select_accessible
on public.pedido_comentarios
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_access_pedido(pedido_id)
);

create policy pedido_comentarios_insert_accessible
on public.pedido_comentarios
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.can_access_pedido(pedido_id)
  and author_id = (select auth.uid())
);

create policy pedido_historial_select_accessible
on public.pedido_historial
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_access_pedido(pedido_id)
);

create policy solicitud_comentarios_select_manager
on public.solicitud_comentarios
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy solicitud_comentarios_insert_manager
on public.solicitud_comentarios
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
  and author_id = (select auth.uid())
);

create policy solicitud_historial_select_manager
on public.solicitud_historial
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy solicitud_historial_insert_manager
on public.solicitud_historial
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
  and (
    actor_id is null
    or actor_id = (select auth.uid())
  )
);
