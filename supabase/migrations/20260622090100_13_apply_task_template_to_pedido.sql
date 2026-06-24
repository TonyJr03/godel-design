create or replace function public.aplicar_plantilla_tareas_pedido(
  p_pedido_id uuid,
  p_template_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor_id uuid := auth.uid();
  v_pedido record;
  v_template record;
  v_template_task_count integer;
  v_max_sort_order integer;
  v_inserted_count integer;
begin
  if v_actor_id is null or not private.current_user_is_active() then
    raise exception 'Debes iniciar sesión con un usuario interno activo.';
  end if;

  if p_pedido_id is null then
    raise exception 'El pedido solicitado no existe.';
  end if;

  if p_template_id is null then
    raise exception 'La plantilla seleccionada no existe.';
  end if;

  select p.id, p.workflow_type, p.status
  into v_pedido
  from public.pedidos as p
  where p.id = p_pedido_id
  for update;

  if not found then
    raise exception 'El pedido solicitado no existe.';
  end if;

  if v_pedido.workflow_type <> 'encargo'::public.workflow_type then
    raise exception 'Esta plantilla solo puede aplicarse a pedidos de tipo Encargo.';
  end if;

  if not private.can_manage_pedido_tasks(p_pedido_id) then
    if v_pedido.status not in (
      'creado'::public.pedido_estado,
      'solicitud_recibida'::public.pedido_estado,
      'en_revision'::public.pedido_estado,
      'en_produccion'::public.pedido_estado
    ) then
      raise exception 'No se pueden modificar las tareas de este pedido en su estado actual.';
    end if;

    raise exception 'No tienes permiso para gestionar tareas de este pedido.';
  end if;

  select tp.id, tp.is_active
  into v_template
  from public.trabajo_plantillas as tp
  where tp.id = p_template_id;

  if not found then
    raise exception 'La plantilla seleccionada no existe.';
  end if;

  if not v_template.is_active then
    raise exception 'La plantilla seleccionada no está activa.';
  end if;

  select count(*)
  into v_template_task_count
  from public.trabajo_plantilla_tareas as tpt
  where tpt.template_id = p_template_id;

  if v_template_task_count = 0 then
    raise exception 'La plantilla seleccionada no tiene tareas para agregar.';
  end if;

  select coalesce(max(pt.sort_order), -1)
  into v_max_sort_order
  from public.pedido_tareas as pt
  where pt.pedido_id = p_pedido_id;

  with ordered_template_tasks as (
    select
      tpt.title,
      tpt.task_type,
      tpt.target_quantity,
      row_number() over (
        order by tpt.sort_order asc, tpt.created_at asc, tpt.id asc
      ) as position
    from public.trabajo_plantilla_tareas as tpt
    where tpt.template_id = p_template_id
  ),
  inserted_tasks as (
    insert into public.pedido_tareas (
      pedido_id,
      title,
      task_type,
      target_quantity,
      completed_quantity,
      is_completed,
      sort_order,
      created_by,
      updated_by,
      completed_by,
      completed_at
    )
    select
      p_pedido_id,
      ott.title,
      ott.task_type,
      ott.target_quantity,
      case
        when ott.task_type = 'cuantificada'::public.pedido_tarea_tipo then 0
        else null
      end,
      false,
      v_max_sort_order + ott.position::integer,
      v_actor_id,
      v_actor_id,
      null::uuid,
      null::timestamptz
    from ordered_template_tasks as ott
    order by ott.position
    returning id
  )
  select count(*)
  into v_inserted_count
  from inserted_tasks;

  return v_inserted_count;
end;
$$;

revoke all on function public.aplicar_plantilla_tareas_pedido(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.aplicar_plantilla_tareas_pedido(uuid, uuid)
to authenticated;

comment on function public.aplicar_plantilla_tareas_pedido(uuid, uuid) is
  'Copia transaccionalmente tareas de una plantilla activa al final de un pedido de tipo Encargo.';
