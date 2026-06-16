create or replace function public.consultar_estado_publico(
  p_public_reference text
)
returns table (
  kind text,
  public_reference text,
  workflow_type public.workflow_type,
  status text,
  created_at timestamptz,
  desired_date date,
  estimated_delivery_date date,
  actual_delivery_date date,
  order_number text,
  progress_percentage integer,
  progress_label text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_public_reference text := upper(btrim(coalesce(p_public_reference, '')));
  v_pedido public.pedidos;
  v_solicitud public.solicitudes;
  v_task_count integer;
  v_progress_percentage integer;
begin
  if v_public_reference !~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    return;
  end if;

  select *
  into v_pedido
  from public.pedidos as p
  where p.public_reference = v_public_reference
  limit 1;

  if found then
    if v_pedido.workflow_type = 'impresion'::public.workflow_type then
      v_task_count := 0;
      v_progress_percentage := null;
    else
      select
        count(*)::integer,
        round(avg(
          case
            when pt.task_type = 'simple'::public.pedido_tarea_tipo then
              case when pt.is_completed then 100 else 0 end
            when pt.target_quantity is null or pt.target_quantity <= 0 then
              0
            else
              least(
                greatest(
                  ((coalesce(pt.completed_quantity, 0)::numeric / pt.target_quantity::numeric) * 100),
                  0
                ),
                100
              )
          end
        ))::integer
      into v_task_count, v_progress_percentage
      from public.pedido_tareas as pt
      where pt.pedido_id = v_pedido.id;

      v_task_count := coalesce(v_task_count, 0);
      v_progress_percentage := coalesce(v_progress_percentage, 0);
    end if;

    return query
    select
      'pedido'::text,
      v_pedido.public_reference,
      v_pedido.workflow_type,
      v_pedido.status::text,
      v_pedido.created_at,
      null::date,
      v_pedido.estimated_delivery_date,
      v_pedido.actual_delivery_date,
      v_pedido.order_number,
      case
        when v_pedido.workflow_type = 'impresion'::public.workflow_type then null::integer
        else v_progress_percentage
      end,
      case
        when v_pedido.workflow_type = 'impresion'::public.workflow_type then
          'Flujo directo de impresión'
        when v_task_count > 0 then
          'Progreso de producción'
        else
          'Sin tareas registradas'
      end;

    return;
  end if;

  select *
  into v_solicitud
  from public.solicitudes as s
  where s.public_reference = v_public_reference
  limit 1;

  if not found then
    return;
  end if;

  if v_solicitud.converted_order_id is not null then
    select *
    into v_pedido
    from public.pedidos as p
    where p.id = v_solicitud.converted_order_id
    limit 1;

    if found then
      if v_pedido.workflow_type = 'impresion'::public.workflow_type then
        v_task_count := 0;
        v_progress_percentage := null;
      else
        select
          count(*)::integer,
          round(avg(
            case
              when pt.task_type = 'simple'::public.pedido_tarea_tipo then
                case when pt.is_completed then 100 else 0 end
              when pt.target_quantity is null or pt.target_quantity <= 0 then
                0
              else
                least(
                  greatest(
                    ((coalesce(pt.completed_quantity, 0)::numeric / pt.target_quantity::numeric) * 100),
                    0
                  ),
                  100
                )
            end
          ))::integer
        into v_task_count, v_progress_percentage
        from public.pedido_tareas as pt
        where pt.pedido_id = v_pedido.id;

        v_task_count := coalesce(v_task_count, 0);
        v_progress_percentage := coalesce(v_progress_percentage, 0);
      end if;

      return query
      select
        'pedido'::text,
        v_pedido.public_reference,
        v_pedido.workflow_type,
        v_pedido.status::text,
        v_pedido.created_at,
        null::date,
        v_pedido.estimated_delivery_date,
        v_pedido.actual_delivery_date,
        v_pedido.order_number,
        case
          when v_pedido.workflow_type = 'impresion'::public.workflow_type then null::integer
          else v_progress_percentage
        end,
        case
          when v_pedido.workflow_type = 'impresion'::public.workflow_type then
            'Flujo directo de impresión'
          when v_task_count > 0 then
            'Progreso de producción'
          else
            'Sin tareas registradas'
        end;

      return;
    end if;
  end if;

  return query
  select
    'solicitud'::text,
    v_solicitud.public_reference,
    v_solicitud.workflow_type,
    v_solicitud.status::text,
    v_solicitud.created_at,
    v_solicitud.desired_date,
    null::date,
    null::date,
    null::text,
    null::integer,
    null::text;
end;
$$;

revoke all on function public.consultar_estado_publico(text)
from public;

grant execute on function public.consultar_estado_publico(text)
to anon, authenticated;

comment on function public.consultar_estado_publico(text) is
  'Consulta publica controlada por public_reference. Devuelve solo estado y fechas no sensibles.';
