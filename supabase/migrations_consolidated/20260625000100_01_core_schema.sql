-- Beta 1 consolidated structural schema.
-- Scope: extensions, schemas, enums, tables, constraints, indexes, structural functions, and triggers.
-- Access-control DDL, business RPCs, Storage DDL, backfills, and application code are intentionally excluded.

create extension if not exists pgcrypto;

create schema if not exists private;

create type public.app_role as enum (
  'admin',
  'supervisor',
  'trabajador'
);

create type public.workflow_type as enum (
  'encargo',
  'impresion'
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

create type public.pedido_pago_estado as enum (
  'sin_pago',
  'parcial',
  'pagado'
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
  'tarea_progreso_actualizado',
  'pago_actualizado'
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
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.current_business_date()
returns date
language sql
set search_path = pg_catalog
as $$
  select (clock_timestamp() at time zone 'America/Havana')::date;
$$;

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
  public_reference text not null default (
    'GD-' ||
    upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 4)) ||
    '-' ||
    upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 5, 4))
  ),
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
  workflow_type public.workflow_type not null default 'encargo',
  reviewed_by uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solicitudes_public_reference_format_check
    check (public_reference ~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  constraint solicitudes_public_reference_key unique (public_reference),
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
    raise exception 'Se agoto la secuencia anual de pedidos para el ano %.', v_year
      using errcode = '22000';
  end if;

  return 'P-' ||
    right(v_year::text, 2) ||
    '-' ||
    lpad(v_next_number::text, 4, '0');
end;
$$;

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

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default '',
  public_reference text not null default (
    'GD-' ||
    upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 4)) ||
    '-' ||
    upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 5, 4))
  ),
  cliente_id uuid references public.clientes(id) on delete set null,
  solicitud_id uuid references public.solicitudes(id) on delete set null,
  title text not null,
  description text not null,
  status public.pedido_estado not null default 'solicitud_recibida',
  workflow_type public.workflow_type not null default 'encargo',
  priority public.pedido_prioridad not null default 'normal',
  estimated_delivery_date date,
  actual_delivery_date date,
  created_by uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedidos_public_reference_format_check
    check (public_reference ~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  constraint pedidos_public_reference_key unique (public_reference),
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

create or replace function private.calculate_pedido_payment_status(
  p_total_amount numeric,
  p_paid_cash_amount numeric,
  p_paid_transfer_amount numeric
)
returns public.pedido_pago_estado
language sql
immutable
set search_path = public
as $$
  select case
    when p_total_amount = 0
      then 'pagado'::public.pedido_pago_estado
    when p_paid_cash_amount + p_paid_transfer_amount = 0
      then 'sin_pago'::public.pedido_pago_estado
    when p_paid_cash_amount + p_paid_transfer_amount < p_total_amount
      then 'parcial'::public.pedido_pago_estado
    else 'pagado'::public.pedido_pago_estado
  end;
$$;

create or replace function private.set_pedido_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  new.total_amount := coalesce(new.total_amount, 0);
  new.paid_cash_amount := coalesce(new.paid_cash_amount, 0);
  new.paid_transfer_amount := coalesce(new.paid_transfer_amount, 0);

  new.payment_status := private.calculate_pedido_payment_status(
    new.total_amount,
    new.paid_cash_amount,
    new.paid_transfer_amount
  );

  if new.payment_status = 'pagado'::public.pedido_pago_estado then
    new.paid_at := coalesce(new.paid_at, now());
  else
    new.paid_at := null;
  end if;

  return new;
end;
$$;

create table public.pedido_pagos (
  pedido_id uuid primary key references public.pedidos(id) on delete cascade,
  total_amount numeric(12,2) not null default 0,
  paid_cash_amount numeric(12,2) not null default 0,
  paid_transfer_amount numeric(12,2) not null default 0,
  payment_status public.pedido_pago_estado not null default 'pagado',
  paid_at timestamptz,
  created_by uuid references public.perfiles(id) on delete set null,
  updated_by uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedido_pagos_total_amount_non_negative
    check (total_amount >= 0),
  constraint pedido_pagos_paid_cash_amount_non_negative
    check (paid_cash_amount >= 0),
  constraint pedido_pagos_paid_transfer_amount_non_negative
    check (paid_transfer_amount >= 0),
  constraint pedido_pagos_paid_amount_not_over_total
    check (paid_cash_amount + paid_transfer_amount <= total_amount),
  constraint pedido_pagos_payment_status_consistent check (
    payment_status = private.calculate_pedido_payment_status(
      total_amount,
      paid_cash_amount,
      paid_transfer_amount
    )
  ),
  constraint pedido_pagos_paid_at_consistent check (
    (
      payment_status = 'pagado'::public.pedido_pago_estado
      and paid_at is not null
    )
    or (
      payment_status <> 'pagado'::public.pedido_pago_estado
      and paid_at is null
    )
  )
);

create trigger set_pedido_pagos_payment_status
before insert or update of total_amount, paid_cash_amount, paid_transfer_amount, payment_status, paid_at
on public.pedido_pagos
for each row
execute function private.set_pedido_payment_status();

create trigger set_pedido_pagos_updated_at
before update on public.pedido_pagos
for each row
execute function public.set_updated_at();

create or replace function private.generate_public_reference()
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_code := private.generate_public_reference_candidate();

    if not exists (
      select 1
      from public.solicitudes
      where public_reference = v_code
    )
    and not exists (
      select 1
      from public.pedidos
      where public_reference = v_code
    ) then
      return v_code;
    end if;

    if v_attempt >= 50 then
      raise exception 'No se pudo generar una referencia publica unica.'
        using errcode = '23505';
    end if;
  end loop;
end;
$$;

create or replace function private.generate_public_reference_candidate()
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_token text := '';
  v_index integer;
begin
  for v_index in 0..7 loop
    v_token := v_token ||
      substr(
        v_alphabet,
        (get_byte(v_bytes, v_index) % length(v_alphabet)) + 1,
        1
      );
  end loop;

  return 'GD-' || substr(v_token, 1, 4) || '-' || substr(v_token, 5, 4);
end;
$$;

create or replace function private.set_solicitud_public_reference()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.public_reference is null or btrim(new.public_reference) = '' then
    new.public_reference := private.generate_public_reference_candidate();
  else
    new.public_reference := upper(btrim(new.public_reference));
  end if;

  if new.public_reference !~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'La referencia publica debe tener formato GD-XXXX-XXXX.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.pedidos
    where public_reference = new.public_reference
  ) then
    raise exception 'La referencia publica ya existe.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

create or replace function private.set_pedido_public_reference()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.public_reference is null or btrim(new.public_reference) = '' then
    new.public_reference := private.generate_public_reference_candidate();
  else
    new.public_reference := upper(btrim(new.public_reference));
  end if;

  if new.public_reference !~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'La referencia publica debe tener formato GD-XXXX-XXXX.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.solicitudes as s
    where s.public_reference = new.public_reference
      and (
        new.solicitud_id is null
        or s.id <> new.solicitud_id
      )
  ) then
    raise exception 'La referencia publica ya existe.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

create trigger set_solicitud_public_reference
before insert on public.solicitudes
for each row
execute function private.set_solicitud_public_reference();

create trigger set_pedido_public_reference
before insert on public.pedidos
for each row
execute function private.set_pedido_public_reference();

create or replace function private.ensure_active_order_assignment_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.perfiles as p
    where p.id = new.assigned_profile_id
      and p.is_active = true
  ) then
    raise exception 'El perfil asignado debe estar activo'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.ensure_perfil_admin_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_remaining_admins integer;
begin
  if tg_op = 'UPDATE'
    and v_actor_id is not null
    and old.id = v_actor_id
    and old.role = 'admin'
    and old.is_active = true
    and (
      new.role <> 'admin'
      or new.is_active = false
    ) then
    raise exception 'No puedes quitarte tu propio rol admin ni desactivarte'
      using errcode = '42501';
  end if;

  if (
    tg_op = 'DELETE'
    and old.role = 'admin'
    and old.is_active = true
  ) or (
    tg_op = 'UPDATE'
    and old.role = 'admin'
    and old.is_active = true
    and (
      new.role <> 'admin'
      or new.is_active = false
    )
  ) then
    perform pg_advisory_xact_lock(hashtext('perfiles_active_admin_guard'));

    select count(*)
      into v_remaining_admins
    from public.perfiles as p
    where p.role = 'admin'
      and p.is_active = true
      and p.id <> old.id;

    if v_remaining_admins = 0 then
      raise exception 'Debe existir al menos un administrador activo'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger ensure_perfil_admin_integrity
before update of role, is_active or delete on public.perfiles
for each row
execute function private.ensure_perfil_admin_integrity();

create trigger ensure_active_order_assignment_profile
before insert or update of assigned_profile_id on public.pedido_trabajadores
for each row
execute function private.ensure_active_order_assignment_profile();

create or replace function private.insert_pedido_historial_pedido_creado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    new.created_by,
    'pedido_creado'::public.pedido_historial_action,
    'Pedido creado en el sistema: ' || new.order_number,
    null,
    new.order_number,
    jsonb_build_object(
      'order_number', new.order_number,
      'title', new.title,
      'solicitud_id', new.solicitud_id,
      'origen', case
        when new.solicitud_id is null then 'manual'
        else 'solicitud'
      end
    )
  );

  return new;
end;
$$;

create or replace function private.insert_pedido_historial_trabajador_asignado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_trabajador_nombre text;
begin
  select p.full_name
  into v_trabajador_nombre
  from public.perfiles as p
  where p.id = new.assigned_profile_id;

  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.pedido_id,
    new.assigned_by,
    'trabajador_asignado'::public.pedido_historial_action,
    'Personal asignado al pedido: ' ||
      coalesce(v_trabajador_nombre, new.assigned_profile_id::text),
    null,
    coalesce(v_trabajador_nombre, new.assigned_profile_id::text),
    jsonb_build_object(
      'assigned_profile_id', new.assigned_profile_id,
      'assigned_by', new.assigned_by,
      'assigned_at', new.assigned_at
    )
  );

  return new;
end;
$$;

create or replace function private.insert_pedido_historial_trabajador_removido()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_trabajador_nombre text;
  v_removed_by uuid;
begin
  select p.full_name
  into v_trabajador_nombre
  from public.perfiles as p
  where p.id = old.assigned_profile_id;

  v_removed_by := auth.uid();

  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    old.pedido_id,
    v_removed_by,
    'trabajador_removido'::public.pedido_historial_action,
    'Personal removido del pedido: ' ||
      coalesce(v_trabajador_nombre, old.assigned_profile_id::text),
    coalesce(v_trabajador_nombre, old.assigned_profile_id::text),
    null,
    jsonb_build_object(
      'assigned_profile_id', old.assigned_profile_id,
      'removed_by', v_removed_by
    )
  );

  return old;
end;
$$;

create or replace function private.insert_pedido_historial_archivo_subido()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.pedido_id is null then
    return new;
  end if;

  if new.visibility not in (
    'interno_pedido'::public.archivo_visibility,
    'avance'::public.archivo_visibility,
    'final_entrega'::public.archivo_visibility
  ) then
    return new;
  end if;

  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.pedido_id,
    new.uploaded_by,
    'archivo_subido'::public.pedido_historial_action,
    'Archivo agregado al pedido: ' || new.file_name,
    null,
    new.file_name,
    jsonb_build_object(
      'archivo_id', new.id,
      'file_name', new.file_name,
      'file_type', new.file_type,
      'file_size', new.file_size,
      'visibility', new.visibility
    )
  );

  return new;
end;
$$;

create or replace function private.insert_pedido_historial_tarea_creada()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.pedido_id,
    coalesce(new.created_by, auth.uid()),
    'tarea_creada'::public.pedido_historial_action,
    'Tarea creada en el pedido: ' || new.title,
    null,
    new.title,
    jsonb_strip_nulls(
      jsonb_build_object(
        'task_id', new.id,
        'title', new.title,
        'task_type', new.task_type::text,
        'target_quantity', new.target_quantity,
        'completed_quantity', new.completed_quantity,
        'is_completed', new.is_completed,
        'sort_order', new.sort_order
      )
    )
  );

  return new;
end;
$$;

create or replace function private.insert_pedido_historial_tarea_actualizada()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor_id uuid;
  v_action public.pedido_historial_action;
  v_summary text;
  v_old_value text;
  v_new_value text;
  v_metadata jsonb;
begin
  if old.is_completed = false and new.is_completed = true then
    v_action := 'tarea_completada'::public.pedido_historial_action;
    v_summary := 'Tarea completada en el pedido: ' || new.title;
    v_old_value := old.title;
    v_new_value := new.title;
  elsif old.is_completed = true and new.is_completed = false then
    v_action := 'tarea_reabierta'::public.pedido_historial_action;
    v_summary := 'Tarea reabierta en el pedido: ' || new.title;
    v_old_value := old.title;
    v_new_value := new.title;
  elsif old.completed_quantity is distinct from new.completed_quantity then
    v_action := 'tarea_progreso_actualizado'::public.pedido_historial_action;
    v_summary := 'Progreso actualizado en tarea del pedido: ' || new.title;
    v_old_value := old.completed_quantity::text;
    v_new_value := new.completed_quantity::text;
  elsif old.title is distinct from new.title
    or old.task_type is distinct from new.task_type
    or old.target_quantity is distinct from new.target_quantity
    or old.sort_order is distinct from new.sort_order then
    v_action := 'tarea_actualizada'::public.pedido_historial_action;
    v_summary := 'Tarea actualizada en el pedido: ' || new.title;
    v_old_value := old.title;
    v_new_value := new.title;
  else
    return new;
  end if;

  v_actor_id := coalesce(new.updated_by, auth.uid());
  v_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'task_id', new.id,
      'title', new.title,
      'previous_title', old.title,
      'task_type', new.task_type::text,
      'previous_task_type', old.task_type::text,
      'target_quantity', new.target_quantity,
      'previous_target_quantity', old.target_quantity,
      'completed_quantity', new.completed_quantity,
      'previous_completed_quantity', old.completed_quantity,
      'is_completed', new.is_completed,
      'previous_is_completed', old.is_completed,
      'sort_order', new.sort_order,
      'previous_sort_order', old.sort_order,
      'completed_at', new.completed_at,
      'completed_by', new.completed_by
    )
  );

  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.pedido_id,
    v_actor_id,
    v_action,
    v_summary,
    v_old_value,
    v_new_value,
    v_metadata
  );

  return new;
end;
$$;

create or replace function private.insert_pedido_historial_tarea_eliminada()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.pedido_historial (
    pedido_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    old.pedido_id,
    coalesce(auth.uid(), old.updated_by, old.created_by),
    'tarea_eliminada'::public.pedido_historial_action,
    'Tarea eliminada del pedido: ' || old.title,
    old.title,
    null,
    jsonb_strip_nulls(
      jsonb_build_object(
        'task_id', old.id,
        'title', old.title,
        'task_type', old.task_type::text,
        'target_quantity', old.target_quantity,
        'completed_quantity', old.completed_quantity,
        'is_completed', old.is_completed,
        'sort_order', old.sort_order
      )
    )
  );

  return old;
end;
$$;

create or replace function private.solicitud_estado_label(
  p_estado public.solicitud_estado
)
returns text
language sql
immutable
set search_path = public, private
as $$
  select case p_estado
    when 'nueva'::public.solicitud_estado then 'Nueva'
    when 'en_revision'::public.solicitud_estado then 'En revision'
    when 'contactada'::public.solicitud_estado then 'Contactada'
    when 'aprobada'::public.solicitud_estado then 'Aprobada'
    when 'rechazada'::public.solicitud_estado then 'Rechazada'
    when 'convertida'::public.solicitud_estado then 'Convertida'
    else p_estado::text
  end;
$$;

create or replace function private.insert_solicitud_historial_solicitud_creada()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    auth.uid(),
    'solicitud_creada'::public.solicitud_historial_action,
    'Solicitud registrada: ' || new.service_type,
    null,
    new.service_type,
    jsonb_strip_nulls(
      jsonb_build_object(
        'service_type', new.service_type,
        'origen', case
          when auth.uid() is null then 'publica'
          else 'interna'
        end
      )
    )
  );

  return new;
end;
$$;

create or replace function private.insert_solicitud_historial_archivo_adjuntado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.solicitud_id is null then
    return new;
  end if;

  if new.visibility <> 'cliente_solicitud'::public.archivo_visibility then
    return new;
  end if;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.solicitud_id,
    new.uploaded_by,
    'archivos_adjuntados'::public.solicitud_historial_action,
    'Archivo adjuntado a la solicitud: ' || new.file_name,
    null,
    new.file_name,
    jsonb_strip_nulls(
      jsonb_build_object(
        'archivo_id', new.id,
        'file_name', new.file_name,
        'file_type', new.file_type,
        'file_size', new.file_size,
        'visibility', new.visibility
      )
    )
  );

  return new;
end;
$$;

create or replace function private.insert_solicitud_historial_estado_cambiado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.converted_order_id is null
    and new.converted_order_id is not null
    and new.status = 'convertida'::public.solicitud_estado then
    return new;
  end if;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    coalesce(auth.uid(), new.reviewed_by),
    'estado_cambiado'::public.solicitud_historial_action,
    'Estado cambiado de ' ||
      private.solicitud_estado_label(old.status) ||
      ' a ' ||
      private.solicitud_estado_label(new.status),
    old.status::text,
    new.status::text,
    jsonb_build_object('source', 'solicitud_estado_trigger')
  );

  return new;
end;
$$;

create or replace function private.insert_solicitud_historial_cliente_asociado()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_client_name text;
begin
  if old.cliente_id is not distinct from new.cliente_id then
    return new;
  end if;

  if new.cliente_id is null then
    return new;
  end if;

  select c.name
  into v_client_name
  from public.clientes as c
  where c.id = new.cliente_id;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    auth.uid(),
    'cliente_asociado'::public.solicitud_historial_action,
    'Cliente asociado a la solicitud: ' ||
      coalesce(v_client_name, new.cliente_id::text),
    null,
    coalesce(v_client_name, new.cliente_id::text),
    jsonb_strip_nulls(
      jsonb_build_object(
        'cliente_id', new.cliente_id,
        'client_name', v_client_name
      )
    )
  );

  return new;
end;
$$;

create or replace function private.insert_solicitud_historial_convertida_a_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_order_number text;
  v_order_title text;
begin
  if old.converted_order_id is not null
    or new.converted_order_id is null then
    return new;
  end if;

  select p.order_number, p.title
  into v_order_number, v_order_title
  from public.pedidos as p
  where p.id = new.converted_order_id;

  insert into public.solicitud_historial (
    solicitud_id,
    actor_id,
    action,
    summary,
    old_value,
    new_value,
    metadata
  )
  values (
    new.id,
    coalesce(auth.uid(), new.reviewed_by),
    'convertida_a_pedido'::public.solicitud_historial_action,
    'Solicitud convertida a pedido: ' ||
      coalesce(v_order_number, new.converted_order_id::text),
    null,
    coalesce(v_order_number, new.converted_order_id::text),
    jsonb_strip_nulls(
      jsonb_build_object(
        'pedido_id', new.converted_order_id,
        'order_number', v_order_number,
        'title', v_order_title,
        'status', new.status
      )
    )
  );

  return new;
end;
$$;

create trigger insert_pedido_historial_pedido_creado
after insert on public.pedidos
for each row
execute function private.insert_pedido_historial_pedido_creado();

create trigger insert_pedido_historial_trabajador_asignado
after insert on public.pedido_trabajadores
for each row
execute function private.insert_pedido_historial_trabajador_asignado();

create trigger insert_pedido_historial_trabajador_removido
after delete on public.pedido_trabajadores
for each row
execute function private.insert_pedido_historial_trabajador_removido();

create trigger insert_pedido_historial_archivo_subido
after insert on public.archivos
for each row
execute function private.insert_pedido_historial_archivo_subido();

create trigger insert_pedido_historial_tarea_creada
after insert on public.pedido_tareas
for each row
execute function private.insert_pedido_historial_tarea_creada();

create trigger insert_pedido_historial_tarea_actualizada
after update on public.pedido_tareas
for each row
execute function private.insert_pedido_historial_tarea_actualizada();

create trigger insert_pedido_historial_tarea_eliminada
after delete on public.pedido_tareas
for each row
execute function private.insert_pedido_historial_tarea_eliminada();

create trigger insert_solicitud_historial_solicitud_creada
after insert on public.solicitudes
for each row
execute function private.insert_solicitud_historial_solicitud_creada();

create trigger insert_solicitud_historial_archivo_adjuntado
after insert on public.archivos
for each row
execute function private.insert_solicitud_historial_archivo_adjuntado();

create trigger insert_solicitud_historial_estado_cambiado
after update of status on public.solicitudes
for each row
execute function private.insert_solicitud_historial_estado_cambiado();

create trigger insert_solicitud_historial_cliente_asociado
after update of cliente_id on public.solicitudes
for each row
execute function private.insert_solicitud_historial_cliente_asociado();

create trigger insert_solicitud_historial_convertida_a_pedido
after update of converted_order_id on public.solicitudes
for each row
execute function private.insert_solicitud_historial_convertida_a_pedido();

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

create index solicitudes_workflow_type_idx
on public.solicitudes(workflow_type);

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

create index pedidos_workflow_type_idx
on public.pedidos(workflow_type);

create index pedido_trabajadores_assigned_profile_id_idx
on public.pedido_trabajadores(assigned_profile_id);

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

create index pedido_pagos_payment_status_idx
on public.pedido_pagos(payment_status);
