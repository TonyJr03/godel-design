-- PPO-03C.1 - Local reservation control plane and authoritative finalize.
-- Only hashes of public capabilities are persisted; paths and identifiers are
-- generated in PostgreSQL and never accepted from callers.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function private.ppo03_public_token_hash(p_public_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_public_token ~ '^[A-Za-z0-9_-]{43}$'
      then lower(pg_catalog.encode(extensions.digest(p_public_token, 'sha256'), 'hex'))
    else null
  end;
$$;

create or replace function private.is_valid_ppo03_safe_name(
  p_safe_name text,
  p_original_name text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_safe_name is not null
    and p_safe_name ~ '^[a-z0-9][a-z0-9_-]{0,118}\.(pdf|jpg|jpeg|png|webp|doc|docx|zip|rar|cdr)$'
    and p_safe_name !~ '[[:cntrl:]]'
    and p_safe_name !~ E'[/\\\\]'
    and lower(regexp_replace(p_safe_name, '^.*\.', '')) =
      lower(regexp_replace(p_original_name, '^.*\.', ''));
$$;

create or replace function private.validate_ppo03_reservation_items(p_items jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_original_name text;
  v_safe_name text;
  v_normalized_mime text;
  v_expected_size bigint;
begin
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'invalid_upload_items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or (select count(*) from jsonb_object_keys(v_item)) <> 4
      or not (v_item ?& array['original_name', 'safe_name', 'normalized_mime', 'expected_size'])
      or exists (
        select 1 from jsonb_object_keys(v_item) as key_name
        where key_name not in ('original_name', 'safe_name', 'normalized_mime', 'expected_size')
      )
      or jsonb_typeof(v_item -> 'original_name') <> 'string'
      or jsonb_typeof(v_item -> 'safe_name') <> 'string'
      or jsonb_typeof(v_item -> 'normalized_mime') <> 'string'
      or jsonb_typeof(v_item -> 'expected_size') <> 'number'
      or (v_item ->> 'expected_size') !~ '^[0-9]+$' then
      raise exception 'invalid_upload_items' using errcode = '22023';
    end if;

    v_original_name := v_item ->> 'original_name';
    v_safe_name := v_item ->> 'safe_name';
    v_normalized_mime := v_item ->> 'normalized_mime';
    v_expected_size := (v_item ->> 'expected_size')::bigint;
    if not private.is_valid_ppo03_file_descriptor(v_original_name, v_normalized_mime, v_expected_size)
      or not private.is_valid_ppo03_safe_name(v_safe_name, v_original_name) then
      raise exception 'invalid_upload_items' using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function private.insert_ppo03_reservation_items(
  p_session_id uuid,
  p_items jsonb,
  p_visibility public.archivo_visibility
)
returns table (
  sort_order smallint,
  item_id uuid,
  object_path text,
  original_name text,
  normalized_mime text,
  expected_size bigint,
  visibility public.archivo_visibility
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_item_id uuid;
  v_sort_order smallint := 0;
  v_safe_name text;
  v_nonce text;
begin
  perform private.validate_ppo03_reservation_items(p_items);
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := gen_random_uuid();
    v_safe_name := v_item ->> 'safe_name';
    v_nonce := replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '');

    insert into public.archivo_carga_items (
      id, session_id, sort_order, object_path, original_name,
      normalized_mime, expected_size, visibility
    ) values (
      v_item_id, p_session_id, v_sort_order,
      'cargas/v1/' || p_session_id::text || '/' || v_item_id::text || '/' ||
        v_nonce || '-' || v_safe_name,
      v_item ->> 'original_name', v_item ->> 'normalized_mime',
      (v_item ->> 'expected_size')::bigint, p_visibility
    );

    sort_order := v_sort_order;
    item_id := v_item_id;
    object_path := 'cargas/v1/' || p_session_id::text || '/' || v_item_id::text ||
      '/' || v_nonce || '-' || v_safe_name;
    original_name := v_item ->> 'original_name';
    normalized_mime := v_item ->> 'normalized_mime';
    expected_size := (v_item ->> 'expected_size')::bigint;
    visibility := p_visibility;
    return next;
    v_sort_order := v_sort_order + 1;
  end loop;
end;
$$;

create or replace function private.assert_ppo03_storage_object(
  p_object_path text,
  p_expected_size bigint,
  p_normalized_mime text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_metadata jsonb;
  v_size_text text;
  v_mime text;
begin
  select o.metadata into v_metadata
  from storage.objects as o
  where o.bucket_id = 'godel-files' and o.name = p_object_path;
  if not found then raise exception 'object_not_ready' using errcode = 'P0001'; end if;

  v_size_text := v_metadata ->> 'size';
  v_mime := v_metadata ->> 'mimetype';
  if v_size_text is null or v_size_text !~ '^[0-9]+$'
    or v_size_text::bigint <> p_expected_size
    or (v_mime is not null and v_mime <> p_normalized_mime) then
    raise exception 'object_mismatch' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.refresh_ppo03_upload_session_completion(p_session_id uuid)
returns public.archivo_carga_sesion_estado
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_all_committed boolean;
  v_status public.archivo_carga_sesion_estado;
begin
  select not exists (
    select 1 from public.archivo_carga_items as i
    where i.session_id = p_session_id
      and i.status <> 'committed'::public.archivo_carga_item_estado
  ) into v_all_committed;

  update public.archivo_carga_sesiones as s
  set status = case when v_all_committed then 'completed'::public.archivo_carga_sesion_estado
                    else 'open'::public.archivo_carga_sesion_estado end,
      completed_at = case when v_all_committed then now() else null end
  where s.id = p_session_id
  returning s.status into v_status;
  return v_status;
end;
$$;

create or replace function public.crear_solicitud_publica_con_reserva_carga(
  p_public_reference text,
  p_service_id uuid,
  p_client_name text,
  p_client_phone text,
  p_public_token_hash text,
  p_items jsonb,
  p_client_email text default null,
  p_description text default null,
  p_desired_date date default null,
  p_notes text default null,
  p_print_copies integer default null,
  p_print_color_mode text default null,
  p_print_paper_size text default null,
  p_print_sides text default null
)
returns table (
  solicitud_id uuid,
  public_reference text,
  session_id uuid,
  expires_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow public.workflow_type;
  v_service_name text;
  v_description text;
  v_solicitud_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '4 hours';
begin
  if auth.uid() is not null
    or p_public_reference is null
    or p_public_reference !~ '^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$'
    or p_public_token_hash is null or p_public_token_hash !~ '^[0-9a-f]{64}$'
    or p_client_name is null
    or char_length(btrim(p_client_name)) not between 1 and 120
    or p_client_phone is null
    or char_length(btrim(p_client_phone)) not between 1 and 40
    or (p_client_email is not null and (
      char_length(btrim(p_client_email)) not between 3 and 254
      or btrim(p_client_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
    or (p_notes is not null and char_length(btrim(p_notes)) > 1000) then
    raise exception 'invalid_public_request' using errcode = '22023';
  end if;
  perform private.validate_ppo03_reservation_items(p_items);

  select ts.workflow_type, ts.name into v_workflow, v_service_name
  from public.tipos_servicio as ts
  where ts.id = p_service_id and ts.is_publicly_available = true;
  if not found then raise exception 'invalid_public_request' using errcode = '22023'; end if;

  if v_workflow = 'encargo'::public.workflow_type then
    if p_description is null
      or char_length(btrim(p_description)) not between 1 and 2000
      or (p_desired_date is not null and p_desired_date < private.current_business_date())
      or p_print_copies is not null or p_print_color_mode is not null
      or p_print_paper_size is not null or p_print_sides is not null then
      raise exception 'invalid_public_request' using errcode = '22023';
    end if;
    v_description := btrim(p_description);
  else
    if p_description is not null or p_desired_date is not null
      or p_print_copies is null or p_print_copies not between 1 and 10000
      or p_print_color_mode is null or p_print_color_mode not in ('blanco_negro', 'color')
      or p_print_paper_size is null or p_print_paper_size not in ('carta', 'a4', 'oficio', 'otro')
      or p_print_sides is null or p_print_sides not in ('una_cara', 'doble_cara') then
      raise exception 'invalid_public_request' using errcode = '22023';
    end if;
    v_description := 'Tipo de trabajo: ' || v_service_name || E'\n\n' ||
      'Cantidad de copias: ' || p_print_copies::text || E'\n' ||
      'Modo de color: ' || case p_print_color_mode
        when 'blanco_negro' then 'Blanco y negro' else 'Color' end || E'\n' ||
      'Tamaño de papel: ' || case p_print_paper_size
        when 'carta' then 'Carta' when 'a4' then 'A4'
        when 'oficio' then 'Oficio' else 'Otro' end || E'\n' ||
      'Caras: ' || case p_print_sides
        when 'una_cara' then 'Una cara' else 'Doble cara' end ||
      E'\n\nObservaciones:\n' || coalesce(nullif(btrim(p_notes), ''), 'Sin observaciones.');
  end if;

  insert into public.solicitudes (
    public_reference, service_id, client_name, client_phone, client_email,
    description, desired_date, notes, workflow_type
  ) values (
    p_public_reference, p_service_id, btrim(p_client_name), btrim(p_client_phone),
    nullif(btrim(p_client_email), ''), v_description,
    case when v_workflow = 'impresion'::public.workflow_type then null else p_desired_date end,
    nullif(btrim(p_notes), ''), v_workflow
  ) returning id into v_solicitud_id;

  insert into public.archivo_carga_sesiones (id, solicitud_id, public_token_hash, expires_at)
  values (v_session_id, v_solicitud_id, p_public_token_hash, v_expires_at);

  select coalesce(jsonb_agg(jsonb_build_object(
    'sort_order', r.sort_order, 'item_id', r.item_id, 'object_path', r.object_path,
    'original_name', r.original_name, 'normalized_mime', r.normalized_mime,
    'expected_size', r.expected_size
  ) order by r.sort_order), '[]'::jsonb)
  into items
  from private.insert_ppo03_reservation_items(
    v_session_id, p_items, 'cliente_solicitud'::public.archivo_visibility
  ) as r;

  solicitud_id := v_solicitud_id;
  public_reference := p_public_reference;
  session_id := v_session_id;
  expires_at := v_expires_at;
  return next;
end;
$$;

create or replace function public.reservar_carga_pedido(p_pedido_id uuid, p_items jsonb)
returns table (session_id uuid, expires_at timestamptz, items jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_session_id uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '4 hours';
  v_visibility public.archivo_visibility;
begin
  if auth.uid() is null or not private.current_user_is_active() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform private.validate_ppo03_reservation_items(p_items);
  select p.* into v_pedido from public.pedidos as p where p.id = p_pedido_id for update;
  if not found or not private.can_access_pedido(p_pedido_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_visibility := private.pedido_file_visibility_for_status(v_pedido.status);
  if v_visibility is null then raise exception 'pedido_not_uploadable' using errcode = '22023'; end if;

  insert into public.archivo_carga_sesiones (id, pedido_id, created_by, expires_at)
  values (v_session_id, p_pedido_id, auth.uid(), v_expires_at);
  select coalesce(jsonb_agg(jsonb_build_object(
    'sort_order', r.sort_order, 'item_id', r.item_id, 'object_path', r.object_path,
    'original_name', r.original_name, 'normalized_mime', r.normalized_mime,
    'expected_size', r.expected_size, 'visibility', r.visibility
  ) order by r.sort_order), '[]'::jsonb)
  into items
  from private.insert_ppo03_reservation_items(v_session_id, p_items, v_visibility) as r;

  session_id := v_session_id;
  expires_at := v_expires_at;
  return next;
end;
$$;

create or replace function public.autorizar_firma_carga_publica(
  p_session_id uuid,
  p_item_id uuid,
  p_public_token text
)
returns table (object_path text, normalized_mime text, expected_size bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_presented_hash text := private.ppo03_public_token_hash(p_public_token);
begin
  if auth.uid() is not null then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  select i.object_path, i.normalized_mime, i.expected_size
  from public.archivo_carga_sesiones as s
  join public.solicitudes as q on q.id = s.solicitud_id
  join public.archivo_carga_items as i on i.id = p_item_id and i.session_id = s.id
  where s.id = p_session_id and s.solicitud_id is not null and s.pedido_id is null
    and s.created_by is null and s.status = 'open'::public.archivo_carga_sesion_estado
    and s.expires_at > now() and s.public_token_hash = v_presented_hash
    and i.status = 'reserved'::public.archivo_carga_item_estado
    and q.status in ('nueva'::public.solicitud_estado, 'en_revision'::public.solicitud_estado,
      'contactada'::public.solicitud_estado, 'aprobada'::public.solicitud_estado);
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
end;
$$;

create or replace function public.finalizar_carga_publica(
  p_session_id uuid,
  p_item_id uuid,
  p_public_token text
)
returns table (
  result text,
  archivo_id uuid,
  item_status public.archivo_carga_item_estado,
  session_status public.archivo_carga_sesion_estado
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.archivo_carga_sesiones%rowtype;
  v_item public.archivo_carga_items%rowtype;
  v_archivo_id uuid;
  v_presented_hash text := private.ppo03_public_token_hash(p_public_token);
begin
  if auth.uid() is not null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select s.* into v_session from public.archivo_carga_sesiones as s where s.id = p_session_id for update;
  if not found or v_session.solicitud_id is null or v_session.pedido_id is not null
    or v_session.created_by is not null or v_session.public_token_hash <> v_presented_hash
    or v_session.expires_at <= now() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select i.* into v_item from public.archivo_carga_items as i
  where i.id = p_item_id and i.session_id = v_session.id for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;

  if v_item.status = 'committed'::public.archivo_carga_item_estado then
    result := 'already_committed'; archivo_id := v_item.archivo_id;
    item_status := v_item.status; session_status := v_session.status;
    return next; return;
  end if;
  if v_session.status <> 'open'::public.archivo_carga_sesion_estado
    or v_item.status <> 'reserved'::public.archivo_carga_item_estado
    or not exists (
      select 1 from public.solicitudes as q
      where q.id = v_session.solicitud_id and q.status in (
        'nueva'::public.solicitud_estado, 'en_revision'::public.solicitud_estado,
        'contactada'::public.solicitud_estado, 'aprobada'::public.solicitud_estado
      )
    ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform private.assert_ppo03_storage_object(v_item.object_path, v_item.expected_size, v_item.normalized_mime);
  insert into public.archivos (solicitud_id, file_name, file_path, file_type, file_size, bucket, visibility)
  values (v_session.solicitud_id, v_item.original_name, v_item.object_path,
    v_item.normalized_mime, v_item.expected_size, 'godel-files', v_item.visibility)
  returning id into v_archivo_id;
  update public.archivo_carga_items set status = 'committed'::public.archivo_carga_item_estado,
    committed_at = now(), archivo_id = v_archivo_id where id = v_item.id;
  result := 'committed'; archivo_id := v_archivo_id;
  item_status := 'committed'::public.archivo_carga_item_estado;
  session_status := private.refresh_ppo03_upload_session_completion(v_session.id);
  return next;
end;
$$;

create or replace function public.finalizar_carga_pedido(p_session_id uuid, p_item_id uuid)
returns table (
  result text,
  archivo_id uuid,
  item_status public.archivo_carga_item_estado,
  session_status public.archivo_carga_sesion_estado
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.archivo_carga_sesiones%rowtype;
  v_item public.archivo_carga_items%rowtype;
  v_pedido public.pedidos%rowtype;
  v_archivo_id uuid;
  v_visibility public.archivo_visibility;
begin
  if auth.uid() is null or not private.current_user_is_active() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select s.* into v_session from public.archivo_carga_sesiones as s where s.id = p_session_id for update;
  if not found or v_session.pedido_id is null or v_session.solicitud_id is not null
    or v_session.created_by <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select p.* into v_pedido from public.pedidos as p where p.id = v_session.pedido_id for update;
  if not found or not private.can_access_pedido(v_session.pedido_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select i.* into v_item from public.archivo_carga_items as i
  where i.id = p_item_id and i.session_id = v_session.id for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;

  if v_item.status = 'committed'::public.archivo_carga_item_estado then
    result := 'already_committed'; archivo_id := v_item.archivo_id;
    item_status := v_item.status; session_status := v_session.status;
    return next; return;
  end if;
  v_visibility := private.pedido_file_visibility_for_status(v_pedido.status);
  if v_session.status <> 'open'::public.archivo_carga_sesion_estado
    or v_session.expires_at <= now()
    or v_item.status <> 'reserved'::public.archivo_carga_item_estado
    or v_visibility is null or v_item.visibility <> v_visibility then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform private.assert_ppo03_storage_object(v_item.object_path, v_item.expected_size, v_item.normalized_mime);
  insert into public.archivos (
    pedido_id, file_name, file_path, file_type, file_size, bucket, visibility, uploaded_by
  ) values (
    v_session.pedido_id, v_item.original_name, v_item.object_path,
    v_item.normalized_mime, v_item.expected_size, 'godel-files', v_item.visibility, auth.uid()
  ) returning id into v_archivo_id;
  update public.archivo_carga_items set status = 'committed'::public.archivo_carga_item_estado,
    committed_at = now(), archivo_id = v_archivo_id where id = v_item.id;
  result := 'committed'; archivo_id := v_archivo_id;
  item_status := 'committed'::public.archivo_carga_item_estado;
  session_status := private.refresh_ppo03_upload_session_completion(v_session.id);
  return next;
end;
$$;

revoke all on function private.ppo03_public_token_hash(text) from public, anon, authenticated, service_role;
revoke all on function private.is_valid_ppo03_safe_name(text, text) from public, anon, authenticated, service_role;
revoke all on function private.validate_ppo03_reservation_items(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.insert_ppo03_reservation_items(uuid, jsonb, public.archivo_visibility) from public, anon, authenticated, service_role;
revoke all on function private.assert_ppo03_storage_object(text, bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.refresh_ppo03_upload_session_completion(uuid) from public, anon, authenticated, service_role;

revoke all on function public.crear_solicitud_publica_con_reserva_carga(text, uuid, text, text, text, jsonb, text, text, date, text, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reservar_carga_pedido(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.autorizar_firma_carga_publica(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.finalizar_carga_publica(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.finalizar_carga_pedido(uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function public.crear_solicitud_publica_con_reserva_carga(text, uuid, text, text, text, jsonb, text, text, date, text, integer, text, text, text) to anon;
grant execute on function public.autorizar_firma_carga_publica(uuid, uuid, text) to anon;
grant execute on function public.finalizar_carga_publica(uuid, uuid, text) to anon;
grant execute on function public.reservar_carga_pedido(uuid, jsonb) to authenticated;
grant execute on function public.finalizar_carga_pedido(uuid, uuid) to authenticated;
