-- Allow workers to read only the client and request data related to orders
-- assigned to them. Managers keep full read access.

drop policy if exists clientes_select_by_role on public.clientes;

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

drop policy if exists solicitudes_select_manager on public.solicitudes;

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
