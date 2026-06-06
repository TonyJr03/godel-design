-- Consolidated core schema for Godel Design.
-- This migration represents the current public database model after the
-- development-history migrations, without changing the intended final state.

create extension if not exists "pgcrypto";

create schema if not exists private;

create type public.app_role as enum (
  'admin',
  'supervisor',
  'trabajador'
);

create type public.solicitud_estado as enum (
  'nueva',
  'en_revision',
  'contactada',
  'aprobada',
  'rechazada',
  'convertida'
);

create type public.pedido_estado as enum (
  'creado',
  'solicitud_recibida',
  'en_revision',
  'en_produccion',
  'listo_entrega',
  'entregado',
  'cancelado'
);

create type public.pedido_prioridad as enum (
  'baja',
  'normal',
  'alta',
  'urgente'
);

create type public.pedido_tarea_tipo as enum (
  'simple',
  'cuantificada'
);

create type public.archivo_visibility as enum (
  'cliente_solicitud',
  'interno_pedido',
  'avance',
  'final_entrega'
);

create type public.pedido_historial_action as enum (
  'pedido_creado',
  'estado_cambiado',
  'trabajador_asignado',
  'trabajador_removido',
  'archivo_subido',
  'nota_agregada',
  'fecha_entrega_actualizada',
  'pedido_entregado',
  'pedido_cancelado',
  'tarea_creada',
  'tarea_actualizada',
  'tarea_eliminada',
  'tarea_completada',
  'tarea_reabierta',
  'tarea_progreso_actualizado'
);

create type public.solicitud_historial_action as enum (
  'solicitud_creada',
  'archivos_adjuntados',
  'estado_cambiado',
  'cliente_asociado',
  'cliente_creado_desde_solicitud',
  'convertida_a_pedido'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at()
from public, anon, authenticated;

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'trabajador',
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint perfiles_full_name_not_empty check (btrim(full_name) <> '')
);

create trigger set_perfiles_updated_at
before update on public.perfiles
for each row
execute function public.set_updated_at();

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clientes_name_not_empty check (btrim(name) <> ''),
  constraint clientes_phone_not_empty check (btrim(phone) <> '')
);

create trigger set_clientes_updated_at
before update on public.clientes
for each row
execute function public.set_updated_at();

create table public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  converted_order_id uuid,
  client_name text not null,
  client_phone text not null,
  client_email text,
  service_type text not null,
  description text not null,
  desired_date date,
  notes text,
  status public.solicitud_estado not null default 'nueva',
  reviewed_by uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solicitudes_client_name_not_empty check (btrim(client_name) <> ''),
  constraint solicitudes_client_phone_not_empty check (btrim(client_phone) <> ''),
  constraint solicitudes_service_type_not_empty check (btrim(service_type) <> ''),
  constraint solicitudes_description_not_empty check (btrim(description) <> '')
);

create trigger set_solicitudes_updated_at
before update on public.solicitudes
for each row
execute function public.set_updated_at();

create table public.pedido_contadores (
  year smallint primary key,
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint pedido_contadores_year_check check (year between 2000 and 9999),
  constraint pedido_contadores_last_number_non_negative check (last_number >= 0)
);

create trigger set_pedido_contadores_updated_at
before update on public.pedido_contadores
for each row
execute function public.set_updated_at();

create or replace function private.current_business_date()
returns date
language sql
set search_path = pg_catalog
as $$
  select (clock_timestamp() at time zone 'America/Havana')::date;
$$;

revoke all on function private.current_business_date()
from public, anon, authenticated;

comment on function private.current_business_date() is
  'Devuelve la fecha local de negocio para America/Havana.';

create or replace function private.generar_numero_pedido()
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_year smallint :=
    extract(year from private.current_business_date())::smallint;
  v_next_number integer;
begin
  insert into public.pedido_contadores as pc (year, last_number)
  values (v_year, 1)
  on conflict (year) do update
  set
    last_number = pc.last_number + 1,
    updated_at = now()
  returning last_number
  into v_next_number;

  if v_next_number > 9999 then
    raise exception 'Se agotó la secuencia anual de pedidos para el año %.', v_year
      using errcode = '22000';
  end if;

  return 'P-' ||
    right(v_year::text, 2) ||
    '-' ||
    lpad(v_next_number::text, 4, '0');
end;
$$;

revoke all on function private.generar_numero_pedido()
from public, anon, authenticated;

create or replace function private.set_pedido_order_number()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  new.order_number = private.generar_numero_pedido();
  return new;
end;
$$;

revoke all on function private.set_pedido_order_number()
from public, anon, authenticated;

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default '',
  cliente_id uuid references public.clientes(id) on delete set null,
  solicitud_id uuid references public.solicitudes(id) on delete set null,
  title text not null,
  description text not null,
  status public.pedido_estado not null default 'solicitud_recibida',
  priority public.pedido_prioridad not null default 'normal',
  estimated_delivery_date date,
  actual_delivery_date date,
  created_by uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedidos_order_number_not_empty check (btrim(order_number) <> ''),
  constraint pedidos_order_number_format_check check (order_number ~ '^P-[0-9]{2}-[0-9]{4}$'),
  constraint pedidos_title_not_empty check (btrim(title) <> ''),
  constraint pedidos_description_not_empty check (btrim(description) <> '')
);

create trigger set_pedido_order_number
before insert on public.pedidos
for each row
execute function private.set_pedido_order_number();

create trigger set_pedidos_updated_at
before update on public.pedidos
for each row
execute function public.set_updated_at();

alter table public.solicitudes
add constraint solicitudes_converted_order_id_fkey
foreign key (converted_order_id)
references public.pedidos(id)
on delete set null;

create table public.pedido_trabajadores (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  assigned_profile_id uuid not null references public.perfiles(id) on delete cascade,
  assigned_by uuid references public.perfiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  constraint pedido_trabajadores_unique_assignment unique (pedido_id, assigned_profile_id)
);

create table public.pedido_tareas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  title text not null,
  task_type public.pedido_tarea_tipo not null,
  target_quantity integer,
  completed_quantity integer,
  is_completed boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.perfiles(id) on delete set null,
  updated_by uuid references public.perfiles(id) on delete set null,
  completed_by uuid references public.perfiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedido_tareas_title_not_empty check (length(btrim(title)) > 0),
  constraint pedido_tareas_sort_order_non_negative check (sort_order >= 0),
  constraint pedido_tareas_simple_quantity_check check (
    task_type <> 'simple'::public.pedido_tarea_tipo
    or (
      target_quantity is null
      and completed_quantity is null
    )
  ),
  constraint pedido_tareas_quantified_quantity_check check (
    task_type <> 'cuantificada'::public.pedido_tarea_tipo
    or (
      target_quantity is not null
      and target_quantity > 0
      and completed_quantity is not null
      and completed_quantity >= 0
    )
  ),
  constraint pedido_tareas_completed_quantity_valid check (
    task_type <> 'cuantificada'::public.pedido_tarea_tipo
    or completed_quantity <= target_quantity
  ),
  constraint pedido_tareas_completed_state_check check (
    not is_completed
    or (
      completed_at is not null
      and (
        task_type = 'simple'::public.pedido_tarea_tipo
        or completed_quantity = target_quantity
      )
    )
  )
);

create trigger set_pedido_tareas_updated_at
before update on public.pedido_tareas
for each row
execute function public.set_updated_at();

create table public.archivos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id) on delete cascade,
  solicitud_id uuid references public.solicitudes(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  bucket text not null,
  visibility public.archivo_visibility not null,
  uploaded_by uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint archivos_file_name_not_empty check (btrim(file_name) <> ''),
  constraint archivos_file_path_not_empty check (btrim(file_path) <> ''),
  constraint archivos_bucket_not_empty check (btrim(bucket) <> ''),
  constraint archivos_file_size_non_negative check (file_size is null or file_size >= 0),
  constraint archivos_has_context check (pedido_id is not null or solicitud_id is not null)
);

create table public.pedido_comentarios (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  content text not null,
  author_id uuid not null references public.perfiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint pedido_comentarios_content_not_empty check (length(btrim(content)) > 0),
  constraint pedido_comentarios_content_max_length check (length(content) <= 2000)
);

create table public.pedido_historial (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  action public.pedido_historial_action not null,
  summary text not null,
  old_value text,
  new_value text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  constraint pedido_historial_summary_not_empty check (length(btrim(summary)) > 0),
  constraint pedido_historial_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create table public.solicitud_comentarios (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  content text not null,
  author_id uuid not null references public.perfiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint solicitud_comentarios_content_not_empty check (length(btrim(content)) > 0),
  constraint solicitud_comentarios_content_max_length check (length(content) <= 2000)
);

create table public.solicitud_historial (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  action public.solicitud_historial_action not null,
  summary text not null,
  old_value text,
  new_value text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  constraint solicitud_historial_summary_not_empty check (length(btrim(summary)) > 0),
  constraint solicitud_historial_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create index perfiles_full_name_idx
on public.perfiles(full_name, id);

create index perfiles_active_role_full_name_idx
on public.perfiles(is_active, role, full_name, id);

create index clientes_name_idx
on public.clientes(name, id);

create index solicitudes_cliente_id_idx on public.solicitudes(cliente_id);
create index solicitudes_created_at_idx on public.solicitudes(created_at);

create index solicitudes_status_created_at_idx
on public.solicitudes(status, created_at desc, id desc);

create unique index solicitudes_converted_order_id_unique_idx
on public.solicitudes(converted_order_id)
where converted_order_id is not null;

create index pedidos_cliente_id_idx on public.pedidos(cliente_id);
create index pedidos_created_at_idx on public.pedidos(created_at);

create index pedidos_status_created_at_idx
on public.pedidos(status, created_at desc, id desc);

create index pedidos_active_created_at_idx
on public.pedidos(created_at desc, id desc)
where status <> 'entregado'::public.pedido_estado
  and status <> 'cancelado'::public.pedido_estado;

create index pedidos_active_estimated_delivery_date_idx
on public.pedidos(estimated_delivery_date)
where status <> 'entregado'::public.pedido_estado
  and status <> 'cancelado'::public.pedido_estado;

create unique index pedidos_solicitud_id_unique_idx
on public.pedidos(solicitud_id)
where solicitud_id is not null;

create index pedido_trabajadores_assigned_profile_id_idx on public.pedido_trabajadores(assigned_profile_id);

create index pedido_tareas_pedido_sort_order_idx
on public.pedido_tareas(pedido_id, sort_order, created_at, id);

create index pedido_tareas_pedido_created_at_idx
on public.pedido_tareas(pedido_id, created_at desc);

create index pedido_tareas_pedido_completed_idx
on public.pedido_tareas(pedido_id, is_completed);

create index archivos_pedido_visibility_created_at_idx
on public.archivos(pedido_id, visibility, created_at desc, id desc);

create index archivos_solicitud_visibility_created_at_idx
on public.archivos(solicitud_id, visibility, created_at desc, id desc);

create index pedido_comentarios_pedido_created_at_idx
on public.pedido_comentarios(pedido_id, created_at asc, id asc);

create index pedido_historial_pedido_created_at_idx
on public.pedido_historial(pedido_id, created_at desc, id desc);

create index pedido_historial_created_at_idx
on public.pedido_historial(created_at desc, id desc);

create index solicitud_comentarios_solicitud_created_at_idx
on public.solicitud_comentarios(solicitud_id, created_at asc, id asc);

create index solicitud_comentarios_author_id_idx
on public.solicitud_comentarios(author_id);

create index solicitud_historial_solicitud_created_at_idx
on public.solicitud_historial(solicitud_id, created_at desc, id desc);

create index solicitud_historial_created_at_idx
on public.solicitud_historial(created_at desc, id desc);

create index solicitud_historial_actor_id_idx
on public.solicitud_historial(actor_id);

create index solicitud_historial_action_idx
on public.solicitud_historial(action);

alter table public.perfiles enable row level security;
alter table public.clientes enable row level security;
alter table public.solicitudes enable row level security;
alter table public.pedido_contadores enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_trabajadores enable row level security;
alter table public.pedido_tareas enable row level security;
alter table public.archivos enable row level security;
alter table public.pedido_comentarios enable row level security;
alter table public.pedido_historial enable row level security;
alter table public.solicitud_comentarios enable row level security;
alter table public.solicitud_historial enable row level security;
