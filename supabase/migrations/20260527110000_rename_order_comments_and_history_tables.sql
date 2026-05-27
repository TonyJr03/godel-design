-- Normalize order-specific comments and history names before adding request-specific tables.

alter table public.comentarios
rename to pedido_comentarios;

alter table public.historial_pedidos
rename to pedido_historial;

alter type public.historial_pedido_action
rename to pedido_historial_action;

alter table public.pedido_comentarios
rename constraint comentarios_pkey to pedido_comentarios_pkey;

alter table public.pedido_comentarios
rename constraint comentarios_pedido_id_fkey to pedido_comentarios_pedido_id_fkey;

alter table public.pedido_comentarios
rename constraint comentarios_user_id_fkey to pedido_comentarios_user_id_fkey;

alter table public.pedido_comentarios
rename constraint comentarios_contenido_not_empty to pedido_comentarios_contenido_not_empty;

alter table public.pedido_historial
rename constraint historial_pedidos_pkey to pedido_historial_pkey;

alter table public.pedido_historial
rename constraint historial_pedidos_pedido_id_fkey to pedido_historial_pedido_id_fkey;

alter table public.pedido_historial
rename constraint historial_pedidos_user_id_fkey to pedido_historial_user_id_fkey;

alter index public.comentarios_pedido_id_idx
rename to pedido_comentarios_pedido_id_idx;

alter index public.historial_pedidos_pedido_id_idx
rename to pedido_historial_pedido_id_idx;

alter trigger set_comentarios_updated_at
on public.pedido_comentarios
rename to set_pedido_comentarios_updated_at;

alter policy comentarios_select_by_role
on public.pedido_comentarios
rename to pedido_comentarios_select_by_role;

alter policy comentarios_insert_by_role
on public.pedido_comentarios
rename to pedido_comentarios_insert_by_role;

alter policy comentarios_update_by_role
on public.pedido_comentarios
rename to pedido_comentarios_update_by_role;

alter policy comentarios_delete_by_role
on public.pedido_comentarios
rename to pedido_comentarios_delete_by_role;

alter policy historial_select_by_role
on public.pedido_historial
rename to pedido_historial_select_by_role;

alter policy historial_insert_by_role
on public.pedido_historial
rename to pedido_historial_insert_by_role;

drop policy pedido_historial_insert_by_role on public.pedido_historial;

create policy pedido_historial_insert_by_role
on public.pedido_historial
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
        'archivo_subido'::public.pedido_historial_action,
        'nota_agregada'::public.pedido_historial_action
      )
    )
  )
);

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
