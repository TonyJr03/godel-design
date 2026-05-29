-- Restrict direct client reads to internal roles allowed for the clientes module.

drop policy if exists clientes_select_by_role on public.clientes;

create policy clientes_select_by_role
on public.clientes
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);
