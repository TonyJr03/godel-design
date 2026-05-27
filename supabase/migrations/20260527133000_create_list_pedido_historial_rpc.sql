-- Controlled reader for order history with minimal actor data.
-- This keeps profiles protected while allowing assigned workers to see
-- who triggered events on orders they can already access.

create or replace function public.listar_pedido_historial(
  p_pedido_id uuid
)
returns table (
  id uuid,
  action public.pedido_historial_action,
  old_value text,
  new_value text,
  metadata jsonb,
  created_at timestamptz,
  actor_full_name text,
  actor_role public.app_role
)
language sql
security definer
set search_path = public, private
stable
as $$
  select
    ph.id,
    ph.action,
    ph.old_value,
    ph.new_value,
    ph.metadata,
    ph.created_at,
    p.full_name as actor_full_name,
    p.role as actor_role
  from public.pedido_historial as ph
  left join public.profiles as p
    on p.id = ph.user_id
  where ph.pedido_id = p_pedido_id
    and (select auth.uid()) is not null
    and private.current_user_is_active()
    and private.can_access_order(p_pedido_id)
  order by ph.created_at desc, ph.id desc;
$$;

revoke all on function public.listar_pedido_historial(uuid) from public;
revoke all on function public.listar_pedido_historial(uuid) from anon;
grant execute on function public.listar_pedido_historial(uuid) to authenticated;

comment on function public.listar_pedido_historial(uuid) is
  'Lista historial interno de un pedido accesible con nombre y rol mínimos del actor.';
