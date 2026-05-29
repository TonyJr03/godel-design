-- Controlled reader for order comments with minimal author data.
-- This avoids broadening profiles RLS while allowing assigned workers to see
-- who wrote comments on orders they can already access.

create or replace function public.listar_pedido_comentarios(
  p_pedido_id uuid
)
returns table (
  id uuid,
  contenido text,
  created_at timestamptz,
  updated_at timestamptz,
  author_full_name text,
  author_role public.app_role
)
language sql
security definer
set search_path = public, private
stable
as $$
  select
    pc.id,
    pc.contenido,
    pc.created_at,
    pc.updated_at,
    p.full_name as author_full_name,
    p.role as author_role
  from public.pedido_comentarios as pc
  join public.profiles as p
    on p.id = pc.user_id
  where pc.pedido_id = p_pedido_id
    and (select auth.uid()) is not null
    and private.can_access_order(p_pedido_id)
  order by pc.created_at asc, pc.id asc;
$$;

revoke all on function public.listar_pedido_comentarios(uuid) from public;
revoke all on function public.listar_pedido_comentarios(uuid) from anon;
grant execute on function public.listar_pedido_comentarios(uuid) to authenticated;

comment on function public.listar_pedido_comentarios(uuid) is
  'Lista comentarios internos de un pedido accesible con nombre y rol mínimos del autor.';
