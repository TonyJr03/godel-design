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
  from public.profiles as p
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
    from public.profiles as p
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

create or replace function private.is_assigned_to_order(order_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when auth.uid() is null or order_id is null then false
    else exists (
      select 1
      from public.pedido_trabajadores as pt
      where pt.pedido_id = order_id
        and pt.trabajador_id = auth.uid()
    )
  end;
$$;

create or replace function private.can_access_order(order_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.is_admin_or_supervisor()
    or private.is_assigned_to_order(order_id);
$$;

grant usage on schema private to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated;

grant insert on table public.solicitudes to anon;

grant select, insert, update, delete on table
  public.profiles,
  public.clientes,
  public.solicitudes,
  public.pedidos,
  public.pedido_trabajadores,
  public.archivos
to authenticated;

grant select, insert on table
  public.pedido_comentarios,
  public.solicitud_comentarios,
  public.solicitud_historial
to authenticated;

grant select on table public.pedido_historial to authenticated;

revoke all on table
  public.solicitud_comentarios,
  public.solicitud_historial
from public, anon;

revoke all on type public.solicitud_historial_action from public, anon;
grant usage on type public.solicitud_historial_action to authenticated;

create policy profiles_select_internal_scope
on public.profiles
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
      where pt.trabajador_id = profiles.id
        and private.can_access_order(pt.pedido_id)
    )
  )
);

create policy profiles_insert_admin
on public.profiles
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.is_admin()
);

create policy profiles_update_admin
on public.profiles
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

create policy clientes_select_by_role
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
        and private.can_access_order(p.id)
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
  estado = 'nueva'::public.solicitud_estado
  and reviewed_by is null
  and converted_order_id is null
  and cliente_id is null
);

create policy solicitudes_select_manager
on public.solicitudes
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or exists (
      select 1
      from public.pedidos as p
      where (
        p.solicitud_id = solicitudes.id
        or solicitudes.converted_order_id = p.id
      )
        and private.can_access_order(p.id)
    )
  )
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

create policy pedidos_select_by_role
on public.pedidos
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_access_order(id)
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

create policy pedido_trabajadores_select_by_role
on public.pedido_trabajadores
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or private.is_assigned_to_order(pedido_id)
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

create policy archivos_select_by_role
on public.archivos
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or (
      pedido_id is not null
      and private.is_assigned_to_order(pedido_id)
    )
  )
);

create policy archivos_insert_by_role
on public.archivos
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or (
      pedido_id is not null
      and solicitud_id is null
      and private.is_assigned_to_order(pedido_id)
      and visibility in (
        'avance'::public.archivo_visibility,
        'final_entrega'::public.archivo_visibility
      )
      and uploaded_by = (select auth.uid())
    )
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

create policy pedido_comentarios_select_by_role
on public.pedido_comentarios
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_access_order(pedido_id)
);

create policy pedido_comentarios_insert_by_role
on public.pedido_comentarios
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.can_access_order(pedido_id)
  and user_id = (select auth.uid())
);

create policy pedido_historial_select_by_role
on public.pedido_historial
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_access_order(pedido_id)
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
  and autor_id = (select auth.uid())
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
