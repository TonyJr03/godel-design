alter table public.solicitudes
add column public_reference text;

alter table public.pedidos
add column public_reference text;

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

revoke all on function private.generate_public_reference()
from public, anon, authenticated;

comment on function private.generate_public_reference() is
  'Genera codigos publicos no secuenciales con formato GD-XXXX-XXXX.';

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

revoke all on function private.generate_public_reference_candidate()
from public, anon, authenticated;

comment on function private.generate_public_reference_candidate() is
  'Genera un candidato aleatorio GD-XXXX-XXXX sin consultar tablas.';

do $$
declare
  v_solicitud_id uuid;
begin
  for v_solicitud_id in
    select id
    from public.solicitudes
    where public_reference is null
    order by created_at, id
  loop
    update public.solicitudes
    set public_reference = private.generate_public_reference()
    where id = v_solicitud_id;
  end loop;
end;
$$;

update public.pedidos as p
set public_reference = s.public_reference
from public.solicitudes as s
where p.solicitud_id = s.id
  and p.public_reference is null;

do $$
declare
  v_pedido_id uuid;
begin
  for v_pedido_id in
    select id
    from public.pedidos
    where public_reference is null
    order by created_at, id
  loop
    update public.pedidos
    set public_reference = private.generate_public_reference()
    where id = v_pedido_id;
  end loop;
end;
$$;

alter table public.solicitudes
alter column public_reference set default (
  'GD-' ||
  upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 4)) ||
  '-' ||
  upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 5, 4))
);

alter table public.pedidos
alter column public_reference set default (
  'GD-' ||
  upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 4)) ||
  '-' ||
  upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 5, 4))
);

alter table public.solicitudes
alter column public_reference set not null;

alter table public.pedidos
alter column public_reference set not null;

alter table public.solicitudes
add constraint solicitudes_public_reference_key unique (public_reference);

alter table public.pedidos
add constraint pedidos_public_reference_key unique (public_reference);

alter table public.solicitudes
add constraint solicitudes_public_reference_format_check
check (public_reference ~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$');

alter table public.pedidos
add constraint pedidos_public_reference_format_check
check (public_reference ~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$');

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

revoke all on function private.set_solicitud_public_reference()
from public, anon, authenticated;

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

revoke all on function private.set_pedido_public_reference()
from public, anon, authenticated;

create trigger set_solicitud_public_reference
before insert on public.solicitudes
for each row
execute function private.set_solicitud_public_reference();

create trigger set_pedido_public_reference
before insert on public.pedidos
for each row
execute function private.set_pedido_public_reference();

create or replace function public.convertir_solicitud_a_pedido(
  p_solicitud_id uuid,
  p_title text,
  p_description text,
  p_priority public.pedido_prioridad,
  p_estimated_delivery_date date
)
returns public.pedidos
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_solicitud public.solicitudes;
  v_pedido public.pedidos;
  v_title text := btrim(p_title);
  v_description text := btrim(p_description);
  v_business_date date := private.current_business_date();
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado.';
  end if;

  if not private.current_user_is_active() then
    raise exception 'Usuario inactivo o sin perfil válido.';
  end if;

  if not private.is_admin_or_supervisor() then
    raise exception 'No tienes permiso para convertir solicitudes en pedidos.';
  end if;

  if v_title is null or v_title = '' then
    raise exception 'El título del pedido es obligatorio.';
  end if;

  if char_length(v_title) > 160 then
    raise exception 'El título del pedido no puede superar 160 caracteres.';
  end if;

  if v_description is null or v_description = '' then
    raise exception 'La descripción del pedido es obligatoria.';
  end if;

  if char_length(v_description) > 3000 then
    raise exception 'La descripción del pedido no puede superar 3000 caracteres.';
  end if;

  if p_priority is null then
    raise exception 'Selecciona una prioridad válida.';
  end if;

  if p_estimated_delivery_date is not null
    and p_estimated_delivery_date < v_business_date then
    raise exception 'La fecha estimada de entrega no puede ser anterior al día actual.';
  end if;

  select *
  into v_solicitud
  from public.solicitudes
  where id = p_solicitud_id
  for update;

  if not found then
    raise exception 'La solicitud no existe.';
  end if;

  if v_solicitud.converted_order_id is not null then
    raise exception 'Esta solicitud ya fue convertida en pedido.';
  end if;

  if exists (
    select 1
    from public.pedidos
    where solicitud_id = v_solicitud.id
  ) then
    raise exception 'Esta solicitud ya tiene un pedido asociado.';
  end if;

  if v_solicitud.status <> 'aprobada'::public.solicitud_estado then
    raise exception 'La solicitud debe estar aprobada antes de convertirse en pedido.';
  end if;

  if v_solicitud.cliente_id is null then
    raise exception 'Asocia un cliente antes de convertir esta solicitud en pedido.';
  end if;

  insert into public.pedidos (
    cliente_id,
    solicitud_id,
    public_reference,
    workflow_type,
    title,
    description,
    status,
    priority,
    estimated_delivery_date,
    created_by
  )
  values (
    v_solicitud.cliente_id,
    v_solicitud.id,
    v_solicitud.public_reference,
    v_solicitud.workflow_type,
    v_title,
    v_description,
    'solicitud_recibida'::public.pedido_estado,
    p_priority,
    p_estimated_delivery_date,
    auth.uid()
  )
  returning * into v_pedido;

  update public.solicitudes
  set
    status = 'convertida'::public.solicitud_estado,
    converted_order_id = v_pedido.id,
    reviewed_by = auth.uid(),
    updated_at = now()
  where id = v_solicitud.id;

  update public.archivos
  set pedido_id = v_pedido.id
  where solicitud_id = v_solicitud.id
    and pedido_id is null
    and visibility = 'cliente_solicitud'::public.archivo_visibility;

  return v_pedido;
end;
$$;

revoke all on function public.convertir_solicitud_a_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date
) from public;

revoke all on function public.convertir_solicitud_a_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date
) from anon;

grant execute on function public.convertir_solicitud_a_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date
) to authenticated;

comment on function public.convertir_solicitud_a_pedido(
  uuid,
  text,
  text,
  public.pedido_prioridad,
  date
) is
  'Convierte una solicitud aprobada en un pedido del mismo flujo, hereda public_reference y archivos en una unica transaccion.';
