create table public.trabajo_plantillas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.perfiles(id) on delete set null,
  updated_by uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trabajo_plantillas_name_length_check
    check (length(btrim(name)) between 2 and 120),
  constraint trabajo_plantillas_description_max_length
    check (description is null or length(description) <= 2000)
);

create trigger set_trabajo_plantillas_updated_at
before update on public.trabajo_plantillas
for each row
execute function public.set_updated_at();

create table public.trabajo_plantilla_tareas (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.trabajo_plantillas(id) on delete cascade,
  title text not null,
  task_type public.pedido_tarea_tipo not null,
  target_quantity integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trabajo_plantilla_tareas_title_not_empty
    check (length(btrim(title)) > 0),
  constraint trabajo_plantilla_tareas_title_max_length
    check (length(title) <= 200),
  constraint trabajo_plantilla_tareas_sort_order_non_negative
    check (sort_order >= 0),
  constraint trabajo_plantilla_tareas_simple_quantity_check check (
    task_type <> 'simple'::public.pedido_tarea_tipo
    or target_quantity is null
  ),
  constraint trabajo_plantilla_tareas_quantified_quantity_check check (
    task_type <> 'cuantificada'::public.pedido_tarea_tipo
    or (
      target_quantity is not null
      and target_quantity > 0
    )
  )
);

create trigger set_trabajo_plantilla_tareas_updated_at
before update on public.trabajo_plantilla_tareas
for each row
execute function public.set_updated_at();

create index trabajo_plantillas_is_active_idx
on public.trabajo_plantillas(is_active);

create index trabajo_plantillas_name_idx
on public.trabajo_plantillas(name, id);

create index trabajo_plantillas_created_at_idx
on public.trabajo_plantillas(created_at desc, id desc);

create index trabajo_plantilla_tareas_template_id_idx
on public.trabajo_plantilla_tareas(template_id);

create index trabajo_plantilla_tareas_template_sort_order_idx
on public.trabajo_plantilla_tareas(template_id, sort_order, created_at, id);

alter table public.trabajo_plantillas enable row level security;
alter table public.trabajo_plantilla_tareas enable row level security;

grant select, insert, update, delete on table
  public.trabajo_plantillas,
  public.trabajo_plantilla_tareas
to authenticated;

revoke all on table
  public.trabajo_plantillas,
  public.trabajo_plantilla_tareas
from anon;

create policy trabajo_plantillas_select_visible
on public.trabajo_plantillas
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and (
    is_active = true
    or private.is_admin()
  )
);

create policy trabajo_plantillas_insert_admin
on public.trabajo_plantillas
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
);

create policy trabajo_plantillas_update_admin
on public.trabajo_plantillas
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
)
with check (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
);

create policy trabajo_plantillas_delete_admin
on public.trabajo_plantillas
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
);

create policy trabajo_plantilla_tareas_select_visible
on public.trabajo_plantilla_tareas
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and exists (
    select 1
    from public.trabajo_plantillas as tp
    where tp.id = trabajo_plantilla_tareas.template_id
      and (
        tp.is_active = true
        or private.is_admin()
      )
  )
);

create policy trabajo_plantilla_tareas_insert_admin
on public.trabajo_plantilla_tareas
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
);

create policy trabajo_plantilla_tareas_update_admin
on public.trabajo_plantilla_tareas
for update
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
)
with check (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
);

create policy trabajo_plantilla_tareas_delete_admin
on public.trabajo_plantilla_tareas
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and private.current_user_is_active()
  and private.is_admin()
);
