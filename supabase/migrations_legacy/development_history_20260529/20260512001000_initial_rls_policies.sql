-- Initial RLS helpers and policies for Godel Design.
-- Storage policies are intentionally out of scope for this migration.

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

-- Controlled RPC for changing only the status of an order.
-- Workers can use this for assigned orders without receiving general UPDATE
-- privileges over public.pedidos.
create or replace function public.actualizar_estado_pedido(
  p_pedido_id uuid,
  p_nuevo_estado public.pedido_estado
)
returns public.pedidos
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_pedido public.pedidos;
  v_estado_anterior public.pedido_estado;
  v_action public.historial_pedido_action;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not private.current_user_is_active() then
    raise exception 'Usuario inactivo o sin perfil valido';
  end if;

  select *
  into v_pedido
  from public.pedidos
  where id = p_pedido_id;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (
    private.is_admin_or_supervisor()
    or (
      private.current_user_role() = 'trabajador'::public.app_role
      and private.is_assigned_to_order(p_pedido_id)
    )
  ) then
    raise exception 'No tienes permiso para cambiar el estado de este pedido';
  end if;

  v_estado_anterior := v_pedido.estado;

  if v_estado_anterior = p_nuevo_estado then
    return v_pedido;
  end if;

  if p_nuevo_estado = 'entregado'::public.pedido_estado then
    v_action := 'pedido_entregado'::public.historial_pedido_action;
  elsif p_nuevo_estado = 'cancelado'::public.pedido_estado then
    v_action := 'pedido_cancelado'::public.historial_pedido_action;
  else
    v_action := 'estado_cambiado'::public.historial_pedido_action;
  end if;

  update public.pedidos
  set
    estado = p_nuevo_estado,
    fecha_entrega_real = case
      when p_nuevo_estado = 'entregado'::public.pedido_estado then current_date
      else fecha_entrega_real
    end,
    updated_at = now()
  where id = p_pedido_id
  returning * into v_pedido;

  insert into public.historial_pedidos (
    pedido_id,
    user_id,
    action,
    old_value,
    new_value,
    metadata
  )
  values (
    p_pedido_id,
    auth.uid(),
    v_action,
    v_estado_anterior::text,
    p_nuevo_estado::text,
    jsonb_build_object('source', 'actualizar_estado_pedido')
  );

  return v_pedido;
end;
$$;

-- Helpers live in a private schema, but policies need to execute them.
grant usage on schema private to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated;

revoke all on function public.actualizar_estado_pedido(uuid, public.pedido_estado) from public;
revoke all on function public.actualizar_estado_pedido(uuid, public.pedido_estado) from anon;
grant execute on function public.actualizar_estado_pedido(uuid, public.pedido_estado) to authenticated;

-- RLS controls row-level access. These grants only expose the operations that
-- policies are allowed to evaluate.
grant insert on table public.solicitudes to anon;

grant select, insert, update, delete on table
  public.profiles,
  public.clientes,
  public.solicitudes,
  public.pedidos,
  public.pedido_trabajadores,
  public.archivos,
  public.comentarios,
  public.historial_pedidos
to authenticated;

-- profiles

create policy profiles_select_own_or_manager
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    id = (select auth.uid())
    or private.is_admin_or_supervisor()
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

-- clientes

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
        and private.is_assigned_to_order(p.id)
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

-- solicitudes

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
  and private.is_admin_or_supervisor()
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

-- pedidos

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

-- pedido_trabajadores

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

-- archivos

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

-- comentarios

create policy comentarios_select_by_role
on public.comentarios
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_access_order(pedido_id)
);

create policy comentarios_insert_by_role
on public.comentarios
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.can_access_order(pedido_id)
  and user_id = (select auth.uid())
);

create policy comentarios_update_by_role
on public.comentarios
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or (
      user_id = (select auth.uid())
      and private.can_access_order(pedido_id)
    )
  )
)
with check (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or (
      user_id = (select auth.uid())
      and private.can_access_order(pedido_id)
    )
  )
);

create policy comentarios_delete_by_role
on public.comentarios
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or (
      user_id = (select auth.uid())
      and private.can_access_order(pedido_id)
    )
  )
);

-- historial_pedidos

create policy historial_select_by_role
on public.historial_pedidos
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_access_order(pedido_id)
);

create policy historial_insert_by_role
on public.historial_pedidos
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (
    private.is_admin_or_supervisor()
    or (
      private.is_assigned_to_order(pedido_id)
      and user_id = (select auth.uid())
      and action in (
        'archivo_subido'::public.historial_pedido_action,
        'nota_agregada'::public.historial_pedido_action
      )
    )
  )
);
