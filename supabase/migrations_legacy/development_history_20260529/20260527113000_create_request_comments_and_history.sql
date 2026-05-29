-- Base tables and RLS for internal request comments and request history.

create type public.solicitud_historial_action as enum (
  'solicitud_creada',
  'archivos_adjuntados',
  'estado_cambiado',
  'cliente_asociado',
  'cliente_creado_desde_solicitud',
  'convertida_a_pedido'
);

create table public.solicitud_comentarios (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  autor_id uuid not null references public.profiles(id) on delete restrict,
  contenido text not null,
  created_at timestamptz not null default now(),
  constraint solicitud_comentarios_contenido_not_empty check (length(btrim(contenido)) > 0),
  constraint solicitud_comentarios_contenido_max_length check (length(contenido) <= 2000)
);

create table public.solicitud_historial (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action public.solicitud_historial_action not null,
  resumen text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint solicitud_historial_resumen_not_empty check (length(btrim(resumen)) > 0),
  constraint solicitud_historial_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create index solicitud_comentarios_solicitud_created_at_idx
on public.solicitud_comentarios(solicitud_id, created_at);

create index solicitud_comentarios_autor_id_idx
on public.solicitud_comentarios(autor_id);

create index solicitud_historial_solicitud_created_at_idx
on public.solicitud_historial(solicitud_id, created_at);

create index solicitud_historial_actor_id_idx
on public.solicitud_historial(actor_id);

create index solicitud_historial_action_idx
on public.solicitud_historial(action);

alter table public.solicitud_comentarios enable row level security;
alter table public.solicitud_historial enable row level security;

revoke all on table
  public.solicitud_comentarios,
  public.solicitud_historial
from public, anon;

revoke all on type public.solicitud_historial_action from public, anon;
grant usage on type public.solicitud_historial_action to authenticated;

grant select, insert on table
  public.solicitud_comentarios,
  public.solicitud_historial
to authenticated;

revoke update, delete on table public.pedido_comentarios from authenticated;
revoke insert, update, delete on table public.pedido_historial from authenticated;

drop policy if exists pedido_comentarios_update_by_role on public.pedido_comentarios;
drop policy if exists pedido_comentarios_delete_by_role on public.pedido_comentarios;
drop policy if exists pedido_historial_insert_by_role on public.pedido_historial;

create policy solicitud_comentarios_select_manager
on public.solicitud_comentarios
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy solicitud_comentarios_insert_manager
on public.solicitud_comentarios
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
  and autor_id = (select auth.uid())
);

create policy solicitud_historial_select_manager
on public.solicitud_historial
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
);

create policy solicitud_historial_insert_manager
on public.solicitud_historial
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and private.is_admin_or_supervisor()
  and (
    actor_id is null
    or actor_id = (select auth.uid())
  )
);
