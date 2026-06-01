-- Consolidated public RPCs.
-- These functions are the controlled public entrypoints used by the app.

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
  v_action public.pedido_historial_action;
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
    v_action := 'pedido_entregado'::public.pedido_historial_action;
  elsif p_nuevo_estado = 'cancelado'::public.pedido_estado then
    v_action := 'pedido_cancelado'::public.pedido_historial_action;
  else
    v_action := 'estado_cambiado'::public.pedido_historial_action;
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

  insert into public.pedido_historial (
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

revoke all on function public.actualizar_estado_pedido(uuid, public.pedido_estado) from public;
revoke all on function public.actualizar_estado_pedido(uuid, public.pedido_estado) from anon;
grant execute on function public.actualizar_estado_pedido(uuid, public.pedido_estado) to authenticated;

create or replace function public.listar_pedido_comentarios(
  p_pedido_id uuid
)
returns table (
  id uuid,
  contenido text,
  created_at timestamptz,
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
    p.full_name as author_full_name,
    p.role as author_role
  from public.pedido_comentarios as pc
  join public.profiles as p
    on p.id = pc.author_id
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

create or replace function public.listar_solicitud_comentarios(
  p_solicitud_id uuid
)
returns table (
  id uuid,
  contenido text,
  created_at timestamptz,
  author_full_name text,
  author_role public.app_role
)
language sql
security definer
set search_path = public, private
stable
as $$
  select
    sc.id,
    sc.contenido,
    sc.created_at,
    p.full_name as author_full_name,
    p.role as author_role
  from public.solicitud_comentarios as sc
  join public.profiles as p
    on p.id = sc.author_id
  where sc.solicitud_id = p_solicitud_id
    and (select auth.uid()) is not null
    and private.current_user_is_active()
    and private.is_admin_or_supervisor()
  order by sc.created_at asc, sc.id asc;
$$;

revoke all on function public.listar_solicitud_comentarios(uuid) from public;
revoke all on function public.listar_solicitud_comentarios(uuid) from anon;
grant execute on function public.listar_solicitud_comentarios(uuid) to authenticated;

comment on function public.listar_solicitud_comentarios(uuid) is
  'Lista comentarios internos de una solicitud accesible con nombre y rol mínimos del autor.';

create or replace function public.listar_solicitud_historial(
  p_solicitud_id uuid
)
returns table (
  id uuid,
  action public.solicitud_historial_action,
  resumen text,
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
    sh.id,
    sh.action,
    sh.resumen,
    sh.metadata,
    sh.created_at,
    p.full_name as actor_full_name,
    p.role as actor_role
  from public.solicitud_historial as sh
  left join public.profiles as p
    on p.id = sh.actor_id
  where sh.solicitud_id = p_solicitud_id
    and (select auth.uid()) is not null
    and private.current_user_is_active()
    and private.is_admin_or_supervisor()
  order by sh.created_at desc, sh.id desc;
$$;

revoke all on function public.listar_solicitud_historial(uuid) from public;
revoke all on function public.listar_solicitud_historial(uuid) from anon;
grant execute on function public.listar_solicitud_historial(uuid) to authenticated;

comment on function public.listar_solicitud_historial(uuid) is
  'Lista historial interno de una solicitud accesible con nombre y rol mínimos del actor.';
