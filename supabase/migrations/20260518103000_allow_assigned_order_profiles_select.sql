-- Allow workers to see basic profile data for personnel assigned to orders
-- they can access, without opening general profile browsing.

drop policy if exists profiles_select_own_or_manager on public.profiles;

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
