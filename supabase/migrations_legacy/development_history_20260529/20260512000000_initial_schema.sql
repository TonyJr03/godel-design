-- Initial schema for Godel Design.
-- This migration creates the base domain model only. RLS is enabled at the end,
-- but complete access policies will be defined in a later migration.

create extension if not exists "pgcrypto";

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
  'solicitud_recibida',
  'en_revision',
  'cotizado',
  'aprobado_cliente',
  'en_diseno',
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

create type public.archivo_visibility as enum (
  'cliente_solicitud',
  'interno_pedido',
  'avance',
  'final_entrega'
);

create type public.historial_pedido_action as enum (
  'pedido_creado',
  'estado_cambiado',
  'trabajador_asignado',
  'trabajador_removido',
  'archivo_subido',
  'nota_agregada',
  'fecha_entrega_actualizada',
  'pedido_entregado',
  'pedido_cancelado'
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

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'trabajador',
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_not_empty check (btrim(full_name) <> '')
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  email text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clientes_nombre_not_empty check (btrim(nombre) <> ''),
  constraint clientes_telefono_not_empty check (btrim(telefono) <> '')
);

create trigger set_clientes_updated_at
before update on public.clientes
for each row
execute function public.set_updated_at();

create table public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nombre text not null,
  cliente_telefono text not null,
  cliente_email text,
  tipo_servicio text not null,
  descripcion text not null,
  cantidad integer,
  fecha_deseada date,
  observaciones text,
  estado public.solicitud_estado not null default 'nueva',
  reviewed_by uuid references public.profiles(id) on delete set null,
  -- Circular relation with pedidos: the foreign key is added after pedidos exists.
  converted_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solicitudes_cliente_nombre_not_empty check (btrim(cliente_nombre) <> ''),
  constraint solicitudes_cliente_telefono_not_empty check (btrim(cliente_telefono) <> ''),
  constraint solicitudes_tipo_servicio_not_empty check (btrim(tipo_servicio) <> ''),
  constraint solicitudes_descripcion_not_empty check (btrim(descripcion) <> ''),
  constraint solicitudes_cantidad_positive check (cantidad is null or cantidad > 0)
);

create trigger set_solicitudes_updated_at
before update on public.solicitudes
for each row
execute function public.set_updated_at();

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_pedido text not null unique,
  cliente_id uuid references public.clientes(id) on delete set null,
  solicitud_id uuid references public.solicitudes(id) on delete set null,
  titulo text not null,
  descripcion text not null,
  estado public.pedido_estado not null default 'solicitud_recibida',
  prioridad public.pedido_prioridad not null default 'normal',
  fecha_creacion timestamptz not null default now(),
  fecha_entrega_estimada date,
  fecha_entrega_real date,
  creado_por uuid references public.profiles(id) on delete set null,
  supervisor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedidos_numero_pedido_not_empty check (btrim(numero_pedido) <> ''),
  constraint pedidos_titulo_not_empty check (btrim(titulo) <> ''),
  constraint pedidos_descripcion_not_empty check (btrim(descripcion) <> '')
);

create trigger set_pedidos_updated_at
before update on public.pedidos
for each row
execute function public.set_updated_at();

alter table public.solicitudes
add constraint solicitudes_converted_order_id_fkey
foreign key (converted_order_id)
references public.pedidos(id)
on delete set null;

-- Join table for assigning one or more workers to each order.
create table public.pedido_trabajadores (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  trabajador_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  constraint pedido_trabajadores_unique_assignment unique (pedido_id, trabajador_id)
);

create table public.archivos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id) on delete cascade,
  solicitud_id uuid references public.solicitudes(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  bucket text not null,
  visibility public.archivo_visibility not null,
  created_at timestamptz not null default now(),
  constraint archivos_file_name_not_empty check (btrim(file_name) <> ''),
  constraint archivos_file_path_not_empty check (btrim(file_path) <> ''),
  constraint archivos_bucket_not_empty check (btrim(bucket) <> ''),
  constraint archivos_file_size_non_negative check (file_size is null or file_size >= 0),
  -- Every file must be attached to at least one request or order.
  constraint archivos_has_context check (pedido_id is not null or solicitud_id is not null)
);

create table public.comentarios (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  contenido text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comentarios_contenido_not_empty check (btrim(contenido) <> '')
);

create trigger set_comentarios_updated_at
before update on public.comentarios
for each row
execute function public.set_updated_at();

create table public.historial_pedidos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action public.historial_pedido_action not null,
  old_value text,
  new_value text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index solicitudes_estado_idx on public.solicitudes(estado);
create index solicitudes_cliente_id_idx on public.solicitudes(cliente_id);
create index solicitudes_created_at_idx on public.solicitudes(created_at);

-- Prevent duplicated conversions between requests and orders.
create unique index solicitudes_converted_order_id_unique_idx
on public.solicitudes(converted_order_id)
where converted_order_id is not null;

create index pedidos_estado_idx on public.pedidos(estado);
create index pedidos_cliente_id_idx on public.pedidos(cliente_id);
create index pedidos_solicitud_id_idx on public.pedidos(solicitud_id);
create index pedidos_fecha_entrega_estimada_idx on public.pedidos(fecha_entrega_estimada);

create unique index pedidos_solicitud_id_unique_idx
on public.pedidos(solicitud_id)
where solicitud_id is not null;

create index pedido_trabajadores_pedido_id_idx on public.pedido_trabajadores(pedido_id);
create index pedido_trabajadores_trabajador_id_idx on public.pedido_trabajadores(trabajador_id);

create index archivos_pedido_id_idx on public.archivos(pedido_id);
create index archivos_solicitud_id_idx on public.archivos(solicitud_id);

create index comentarios_pedido_id_idx on public.comentarios(pedido_id);

create index historial_pedidos_pedido_id_idx on public.historial_pedidos(pedido_id);

-- RLS is enabled now. Complete policies will be created in a later task.
alter table public.profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.solicitudes enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_trabajadores enable row level security;
alter table public.archivos enable row level security;
alter table public.comentarios enable row level security;
alter table public.historial_pedidos enable row level security;
