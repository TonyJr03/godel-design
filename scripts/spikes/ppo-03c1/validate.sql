-- PPO-03C.1 reversible hardening validator. Local Supabase only.
begin;

create function pg_temp.expect_error(p_sql text, p_expected text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'Expected failure containing "%"', p_expected;
exception when others then
  if sqlerrm not ilike '%' || p_expected || '%' then raise; end if;
end;
$$;

do $$
begin
  if not has_function_privilege('anon',
    'public.crear_solicitud_publica_con_reserva_carga(text,uuid,text,text,text,jsonb,text,text,date,text,integer,text,text,text)', 'execute')
    or not has_function_privilege('anon', 'public.autorizar_firma_carga_publica(uuid,uuid,text)', 'execute')
    or not has_function_privilege('anon', 'public.finalizar_carga_publica(uuid,uuid,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.reservar_carga_pedido(uuid,jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.finalizar_carga_pedido(uuid,uuid)', 'execute')
    or has_function_privilege('public',
      'public.crear_solicitud_publica_con_reserva_carga(text,uuid,text,text,text,jsonb,text,text,date,text,integer,text,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.finalizar_carga_publica(uuid,uuid,text)', 'execute')
    or has_function_privilege('anon', 'public.finalizar_carga_pedido(uuid,uuid)', 'execute')
    or has_function_privilege('service_role', 'public.finalizar_carga_publica(uuid,uuid,text)', 'execute')
    or has_function_privilege('anon', 'private.ppo03_public_token_hash(text)', 'execute')
    or has_function_privilege('authenticated', 'private.insert_ppo03_reservation_items(uuid,jsonb,public.archivo_visibility)', 'execute') then
    raise exception 'grant matrix failed';
  end if;
end;
$$;

create temporary table pg_temp.fx (
  service_id uuid,
  token text,
  token_hash text,
  session_id uuid,
  item0_id uuid,
  item1_id uuid,
  item2_id uuid,
  path0 text,
  path1 text,
  path2 text,
  rejected_session_id uuid,
  rejected_item_id uuid,
  pedido_id uuid,
  internal_session_id uuid,
  internal_item_id uuid,
  committed_session_id uuid,
  committed_item_id uuid,
  committed_archivo_id uuid,
  committed_retry_archivo_id uuid,
  admin_id uuid,
  supervisor_id uuid,
  worker_id uuid,
  unassigned_id uuid,
  inactive_id uuid
);
grant select, update on pg_temp.fx to anon, authenticated;

insert into pg_temp.fx(service_id, token, token_hash)
select id, repeat('A', 43), lower(pg_catalog.encode(extensions.digest(repeat('A', 43), 'sha256'), 'hex'))
from public.tipos_servicio where is_publicly_available and workflow_type = 'encargo' limit 1;

select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-0000-0000', (select service_id from pg_temp.fx), 'Cliente', '0',
    repeat('a',64), '[]'::jsonb, null, 'x', null, null, null, null, null, null)
$sql$, 'invalid_upload_items');

select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C303-C303', (select service_id from pg_temp.fx), null, '0',
    repeat('a',64), '[{"original_name":"a.pdf","safe_name":"a.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, 'x', null, null)
$sql$, 'invalid_public_request');
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C304-C304', (select service_id from pg_temp.fx), 'Cliente', null,
    repeat('a',64), '[{"original_name":"a.pdf","safe_name":"a.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, 'x', null, null)
$sql$, 'invalid_public_request');
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C305-C305', (select service_id from pg_temp.fx), 'Cliente', '0',
    repeat('a',64), '[{"original_name":"a.pdf","safe_name":"a.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, null, null, null)
$sql$, 'invalid_public_request');
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C306-C306', (select service_id from pg_temp.fx), 'Cliente', '0',
    repeat('a',64), '[{"original_name":"a.pdf","safe_name":"a.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, 'x', current_date - 1, null)
$sql$, 'invalid_public_request');
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C307-C307', (select service_id from pg_temp.fx), 'Cliente', '0',
    repeat('a',64), '[{"original_name":"a.pdf","safe_name":"a.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, 'x', null, null, 1)
$sql$, 'invalid_public_request');

select * from public.crear_solicitud_publica_con_reserva_carga(
  'GD-C308-C308', (select service_id from pg_temp.fx), 'Cliente diez', '0',
  repeat('d',64),
  (select jsonb_agg(jsonb_build_object(
    'original_name', 'archivo-' || n || '.pdf',
    'safe_name', 'archivo-' || n || '.pdf',
    'normalized_mime', 'application/pdf',
    'expected_size', n
  ) order by n) from generate_series(1,10) as n),
  null, 'diez', null, null
);
do $$
begin
  if (select count(*) from public.archivo_carga_items i join public.archivo_carga_sesiones s on s.id=i.session_id
      where s.public_token_hash=repeat('d',64)) <> 10
    or (select array_agg(sort_order order by sort_order) from public.archivo_carga_items i join public.archivo_carga_sesiones s on s.id=i.session_id
      where s.public_token_hash=repeat('d',64)) <> array[0,1,2,3,4,5,6,7,8,9]::smallint[] then
    raise exception 'ten-item reservation failed';
  end if;
end;
$$;
do $$
declare v_items jsonb;
begin
  select items into v_items from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C30A-C30A', (select service_id from pg_temp.fx), 'Cliente orden', '0',
    repeat('f',64),
    '[{"original_name":"primero.pdf","safe_name":"primero.pdf","normalized_mime":"application/pdf","expected_size":1},{"original_name":"segundo.pdf","safe_name":"segundo.pdf","normalized_mime":"application/pdf","expected_size":2},{"original_name":"tercero.pdf","safe_name":"tercero.pdf","normalized_mime":"application/pdf","expected_size":3}]'::jsonb,
    null, 'orden', null, null
  );
  if v_items -> 0 ->> 'sort_order' <> '0'
    or v_items -> 1 ->> 'sort_order' <> '1'
    or v_items -> 2 ->> 'sort_order' <> '2'
    or v_items -> 0 ->> 'original_name' <> 'primero.pdf'
    or v_items -> 1 ->> 'original_name' <> 'segundo.pdf'
    or v_items -> 2 ->> 'original_name' <> 'tercero.pdf' then
    raise exception 'returned JSON order failed';
  end if;
end;
$$;
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C309-C309', (select service_id from pg_temp.fx), 'Cliente', '0',
    repeat('e',64), '[{"original_name":"a.pdf","safe_name":"a.pdf","normalized_mime":"application/pdf","expected_size":1},{"original_name":"bad.exe","safe_name":"bad.exe","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, 'x', null, null)
$sql$, 'invalid_upload_items');
do $$
begin
  if exists (select 1 from public.solicitudes where public_reference='GD-C309-C309')
    or exists (select 1 from public.archivo_carga_sesiones where public_token_hash=repeat('e',64))
    or exists (
      select 1 from public.archivo_carga_items i
      join public.archivo_carga_sesiones s on s.id=i.session_id
      join public.solicitudes q on q.id=s.solicitud_id
      where q.public_reference='GD-C309-C309'
    ) then
    raise exception 'invalid descriptor left public reservation residue';
  end if;
end;
$$;

select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-0000-0000', (select service_id from pg_temp.fx), 'Cliente', '0',
    repeat('a',64), (select jsonb_agg(jsonb_build_object('original_name','a.pdf','safe_name','a.pdf','normalized_mime','application/pdf','expected_size',1)) from generate_series(1,11)),
    null, 'x', null, null, null, null, null, null)
$sql$, 'invalid_upload_items');

-- Impression fields are all server-validated and cannot carry Encargo data.
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C30C-C30C', (select id from public.tipos_servicio where workflow_type='impresion' limit 1), 'Cliente', '0', repeat('1',64),
    '[{"original_name":"print.pdf","safe_name":"print.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, null, null, null, 0, 'color', 'a4', 'una_cara')
$sql$, 'invalid_public_request');
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C30C-C30C', (select id from public.tipos_servicio where workflow_type='impresion' limit 1), 'Cliente', '0', repeat('2',64),
    '[{"original_name":"print.pdf","safe_name":"print.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, null, null, null, 10001, 'color', 'a4', 'una_cara')
$sql$, 'invalid_public_request');
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C30C-C30C', (select id from public.tipos_servicio where workflow_type='impresion' limit 1), 'Cliente', '0', repeat('3',64),
    '[{"original_name":"print.pdf","safe_name":"print.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, null, null, null, 1, 'sepia', 'a4', 'una_cara')
$sql$, 'invalid_public_request');
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C30C-C30C', (select id from public.tipos_servicio where workflow_type='impresion' limit 1), 'Cliente', '0', repeat('4',64),
    '[{"original_name":"print.pdf","safe_name":"print.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, null, null, null, 1, 'color', 'tabloide', 'una_cara')
$sql$, 'invalid_public_request');
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C30C-C30C', (select id from public.tipos_servicio where workflow_type='impresion' limit 1), 'Cliente', '0', repeat('5',64),
    '[{"original_name":"print.pdf","safe_name":"print.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, null, null, null, 1, 'color', 'a4', 'triple_cara')
$sql$, 'invalid_public_request');
select pg_temp.expect_error($sql$
  select * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C30C-C30C', (select id from public.tipos_servicio where workflow_type='impresion' limit 1), 'Cliente', '0', repeat('6',64),
    '[{"original_name":"print.pdf","safe_name":"print.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, null, current_date, null, 1, 'color', 'a4', 'una_cara')
$sql$, 'invalid_public_request');

set local role anon;
select * from public.crear_solicitud_publica_con_reserva_carga(
  'GD-C301-C301', (select service_id from pg_temp.fx), 'Cliente PPO C', '0000000000',
  (select token_hash from pg_temp.fx),
  '[{"original_name":"Mismo.pdf","safe_name":"mismo-a.pdf","normalized_mime":"application/pdf","expected_size":3},{"original_name":"Mismo.pdf","safe_name":"mismo-b.pdf","normalized_mime":"application/pdf","expected_size":4},{"original_name":"Tercero.rar","safe_name":"tercero.rar","normalized_mime":"application/vnd.rar","expected_size":5}]'::jsonb,
  'cliente@example.invalid', 'Encargo ordenado', current_date, null, null, null, null, null
);
reset role;

update pg_temp.fx as f
set session_id = s.id,
    item0_id = (select id from public.archivo_carga_items where session_id=s.id and sort_order=0),
    item1_id = (select id from public.archivo_carga_items where session_id=s.id and sort_order=1),
    item2_id = (select id from public.archivo_carga_items where session_id=s.id and sort_order=2),
    path0 = (select object_path from public.archivo_carga_items where session_id=s.id and sort_order=0),
    path1 = (select object_path from public.archivo_carga_items where session_id=s.id and sort_order=1),
    path2 = (select object_path from public.archivo_carga_items where session_id=s.id and sort_order=2)
from public.archivo_carga_sesiones s where s.public_token_hash=f.token_hash;

do $$
begin
  if (select count(*) from public.archivo_carga_items where session_id=(select session_id from pg_temp.fx)) <> 3
    or (select array_agg(sort_order order by sort_order) from public.archivo_carga_items where session_id=(select session_id from pg_temp.fx)) <> array[0,1,2]::smallint[]
    or exists (select 1 from public.archivos where solicitud_id=(select solicitud_id from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx))) then
    raise exception 'reservation order or pre-finalize metadata failed';
  end if;
  if (select expires_at between now() + interval '3 hours 59 minutes' and now() + interval '4 hours 1 minute'
      from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx)) is not true then
    raise exception 'reservation TTL failed';
  end if;
end;
$$;

set local role anon;
select * from public.autorizar_firma_carga_publica(
  (select session_id from pg_temp.fx), (select item0_id from pg_temp.fx), (select token from pg_temp.fx)
);
select pg_temp.expect_error(format(
  'select * from public.autorizar_firma_carga_publica(%L::uuid,%L::uuid,%L)',
  (select session_id from pg_temp.fx), (select item0_id from pg_temp.fx), (select token_hash from pg_temp.fx)
), 'not_authorized');
select pg_temp.expect_error(format(
  'select * from public.autorizar_firma_carga_publica(%L::uuid,%L::uuid,%L)',
  (select session_id from pg_temp.fx), (select item0_id from pg_temp.fx), repeat('B',43)
), 'not_authorized');
reset role;

set local role anon;
select pg_temp.expect_error(format(
  'select * from public.finalizar_carga_publica(%L::uuid,%L::uuid,%L)',
  (select session_id from pg_temp.fx), (select item0_id from pg_temp.fx), (select token from pg_temp.fx)
), 'object_not_ready');
reset role;
insert into storage.objects(bucket_id,name,metadata)
select 'godel-files', path0, '{"size":"2","mimetype":"application/pdf"}'::jsonb from pg_temp.fx;
set local role anon;
select pg_temp.expect_error(format(
  'select * from public.finalizar_carga_publica(%L::uuid,%L::uuid,%L)',
  (select session_id from pg_temp.fx), (select item0_id from pg_temp.fx), (select token from pg_temp.fx)
), 'object_mismatch');
reset role;
do $$
begin
  if exists (
    select 1 from public.archivos where solicitud_id=(
      select solicitud_id from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx)
    )
  ) then raise exception 'metadata was created for mismatch'; end if;
end;
$$;
update storage.objects set metadata='{"size":"3","mimetype":"application/pdf"}'::jsonb
where name=(select path0 from pg_temp.fx);
insert into storage.objects(bucket_id,name,metadata)
select 'godel-files', path1, '{"size":"4","mimetype":"application/pdf"}'::jsonb from pg_temp.fx;
insert into storage.objects(bucket_id,name,metadata)
select 'godel-files', path2, '{"size":"5","mimetype":"application/vnd.rar"}'::jsonb from pg_temp.fx;

set local role anon;
select * from public.finalizar_carga_publica(
  (select session_id from pg_temp.fx), (select item0_id from pg_temp.fx), (select token from pg_temp.fx)
);
reset role;
do $$
begin
  if (select status from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx)) <> 'open'
    or (select completed_at from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx)) is not null then
    raise exception 'multi-item session completed too early';
  end if;
end;
$$;

set local role anon;
select * from public.finalizar_carga_publica(
  (select session_id from pg_temp.fx), (select item1_id from pg_temp.fx), (select token from pg_temp.fx)
);
select * from public.finalizar_carga_publica(
  (select session_id from pg_temp.fx), (select item2_id from pg_temp.fx), (select token from pg_temp.fx)
);
select * from public.finalizar_carga_publica(
  (select session_id from pg_temp.fx), (select item2_id from pg_temp.fx), (select token from pg_temp.fx)
);
reset role;

do $$
declare v_history integer;
begin
  if (select status from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx)) <> 'completed'
    or (select count(*) from public.archivos where solicitud_id=(select solicitud_id from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx))) <> 3 then
    raise exception 'public commit final state failed';
  end if;
  select count(*) into v_history from public.solicitud_historial
  where solicitud_id=(select solicitud_id from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx))
    and action='archivos_adjuntados'::public.solicitud_historial_action;
  if v_history <> 3 then raise exception 'retry created extra history'; end if;
end;
$$;

-- A rejected public request cannot finalize a reserved item; an already committed
-- item remains safely idempotent even after its request state changes.
do $$
declare v_session_id uuid; v_item_id uuid;
begin
  select session_id into v_session_id
  from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C30B-C30B', (select service_id from pg_temp.fx), 'Cliente rechazado', '0',
    lower(pg_catalog.encode(extensions.digest(repeat('E', 43), 'sha256'), 'hex')),
    '[{"original_name":"rechazado.pdf","safe_name":"rechazado.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, 'rechazado'
  );
  select id into v_item_id from public.archivo_carga_items where session_id=v_session_id;
  update public.solicitudes set status='rechazada'::public.solicitud_estado
  where id=(select solicitud_id from public.archivo_carga_sesiones where id=v_session_id);
  update pg_temp.fx set rejected_session_id=v_session_id, rejected_item_id=v_item_id;
end;
$$;
set local role anon;
select pg_temp.expect_error(format(
  'select * from public.finalizar_carga_publica(%L::uuid,%L::uuid,%L)',
  (select rejected_session_id from pg_temp.fx), (select rejected_item_id from pg_temp.fx), repeat('E',43)
), 'not_authorized');
reset role;
update public.solicitudes set status='rechazada'::public.solicitud_estado
where id=(select solicitud_id from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx));
set local role anon;
select * from public.finalizar_carga_publica(
  (select session_id from pg_temp.fx), (select item2_id from pg_temp.fx), (select token from pg_temp.fx)
);
reset role;
do $$
begin
  if (select count(*) from public.archivos where solicitud_id=(
      select solicitud_id from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx)
    )) <> 3
    or (select count(*) from public.solicitud_historial where solicitud_id=(
      select solicitud_id from public.archivo_carga_sesiones where id=(select session_id from pg_temp.fx)
    ) and action='archivos_adjuntados'::public.solicitud_historial_action) <> 3 then
    raise exception 'public retry after state change created duplicates';
  end if;
end;
$$;

-- Printing parity: PostgreSQL constructs the same canonical description, not caller text.
do $$
declare v_print_service uuid; v_service_name text; v_description text; v_expected text;
begin
  select id, name into v_print_service, v_service_name
  from public.tipos_servicio where workflow_type='impresion' limit 1;
  if v_print_service is null then raise exception 'print service fixture missing'; end if;
  perform * from public.crear_solicitud_publica_con_reserva_carga(
    'GD-C302-C302', v_print_service, 'Cliente print', '0000000000',
    repeat('c',64), '[{"original_name":"print.pdf","safe_name":"print.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb,
    null, null, null, 'nota', 2, 'color', 'a4', 'doble_cara'
  );
  select description into v_description from public.solicitudes where public_reference='GD-C302-C302';
  v_expected := 'Tipo de trabajo: ' || v_service_name || E'\n\n' ||
    'Cantidad de copias: 2' || E'\n' ||
    'Modo de color: Color' || E'\n' ||
    'Tama' || chr(241) || 'o de papel: A4' || E'\n' ||
    'Caras: Doble cara' || E'\n\nObservaciones:\nnota';
  if v_description is distinct from v_expected then
    raise exception 'print canonical description failed: %', v_description;
  end if;
end;
$$;

-- Internal authorization, state binding, and idempotency use local disposable users.
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_supervisor uuid := gen_random_uuid();
  v_worker uuid := gen_random_uuid();
  v_unassigned uuid := gen_random_uuid();
  v_inactive uuid := gen_random_uuid();
  v_pedido uuid;
begin
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_admin, 'authenticated', 'authenticated', 'ppo03c1-admin@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_supervisor, 'authenticated', 'authenticated', 'ppo03c1-supervisor@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_worker, 'authenticated', 'authenticated', 'ppo03c1-worker@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_unassigned, 'authenticated', 'authenticated', 'ppo03c1-unassigned@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_inactive, 'authenticated', 'authenticated', 'ppo03c1-inactive@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());
  insert into public.perfiles (id, full_name, role, is_active, must_change_password)
  values
    (v_admin, 'PPO 03C1 Admin', 'admin', true, false),
    (v_supervisor, 'PPO 03C1 Supervisor', 'supervisor', true, false),
    (v_worker, 'PPO 03C1 Worker', 'trabajador', true, false),
    (v_unassigned, 'PPO 03C1 Unassigned', 'trabajador', true, false),
    (v_inactive, 'PPO 03C1 Inactive', 'trabajador', false, false);
  insert into public.pedidos (service_id, title, description, status, workflow_type, created_by)
  values ((select service_id from pg_temp.fx), 'PPO 03C1 internal', 'QA local', 'en_revision', 'encargo', v_admin)
  returning id into v_pedido;
  insert into public.pedido_trabajadores (pedido_id, assigned_profile_id, assigned_by)
  values (v_pedido, v_worker, v_admin);
  update pg_temp.fx set pedido_id=v_pedido, admin_id=v_admin, supervisor_id=v_supervisor,
    worker_id=v_worker, unassigned_id=v_unassigned, inactive_id=v_inactive;
end;
$$;

select pg_temp.expect_error($sql$
  select * from public.reservar_carga_pedido(
    (select pedido_id from pg_temp.fx),
    '[{"original_name":"interno.pdf","safe_name":"interno.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb
  )
$sql$, 'not_authorized');
set local role authenticated;
select set_config('request.jwt.claim.sub', (select inactive_id::text from pg_temp.fx), true);
select pg_temp.expect_error($sql$
  select * from public.reservar_carga_pedido(
    (select pedido_id from pg_temp.fx),
    '[{"original_name":"interno.pdf","safe_name":"interno.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb
  )
$sql$, 'not_authorized');
select set_config('request.jwt.claim.sub', (select unassigned_id::text from pg_temp.fx), true);
select pg_temp.expect_error($sql$
  select * from public.reservar_carga_pedido(
    (select pedido_id from pg_temp.fx),
    '[{"original_name":"interno.pdf","safe_name":"interno.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb
  )
$sql$, 'not_authorized');
select set_config('request.jwt.claim.sub', (select worker_id::text from pg_temp.fx), true);
with reservation as (
  select * from public.reservar_carga_pedido(
    (select pedido_id from pg_temp.fx),
    '[{"original_name":"interno.pdf","safe_name":"interno.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb
  )
)
update pg_temp.fx set internal_session_id=reservation.session_id,
  internal_item_id=(reservation.items -> 0 ->> 'item_id')::uuid
from reservation;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_id::text from pg_temp.fx), true);
select * from public.reservar_carga_pedido(
  (select pedido_id from pg_temp.fx),
  '[{"original_name":"admin.pdf","safe_name":"admin.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb
);
select set_config('request.jwt.claim.sub', (select supervisor_id::text from pg_temp.fx), true);
select * from public.reservar_carga_pedido(
  (select pedido_id from pg_temp.fx),
  '[{"original_name":"supervisor.pdf","safe_name":"supervisor.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb
);
reset role;

-- A visibility reservation becomes stale when the order changes state before finalize.
update public.pedidos set status='en_produccion'::public.pedido_estado
where id=(select pedido_id from pg_temp.fx);
insert into storage.objects(bucket_id, name, metadata)
select 'godel-files', i.object_path, jsonb_build_object('size', i.expected_size::text, 'mimetype', i.normalized_mime)
from public.archivo_carga_items i where i.id=(select internal_item_id from pg_temp.fx);
set local role authenticated;
select set_config('request.jwt.claim.sub', (select worker_id::text from pg_temp.fx), true);
select pg_temp.expect_error(format(
  'select * from public.finalizar_carga_pedido(%L::uuid,%L::uuid)',
  (select internal_session_id from pg_temp.fx), (select internal_item_id from pg_temp.fx)
), 'not_authorized');
reset role;

-- A committed internal item remains idempotent even if the order changes later.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select worker_id::text from pg_temp.fx), true);
with reservation as (
  select * from public.reservar_carga_pedido(
    (select pedido_id from pg_temp.fx),
    '[{"original_name":"retry.pdf","safe_name":"retry.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb
  )
)
update pg_temp.fx set committed_session_id=reservation.session_id,
  committed_item_id=(reservation.items -> 0 ->> 'item_id')::uuid
from reservation;
reset role;
insert into storage.objects(bucket_id, name, metadata)
select 'godel-files', i.object_path, jsonb_build_object('size', i.expected_size::text, 'mimetype', i.normalized_mime)
from public.archivo_carga_items i where i.id=(select committed_item_id from pg_temp.fx);
set local role authenticated;
select set_config('request.jwt.claim.sub', (select worker_id::text from pg_temp.fx), true);
with committed as (
  select * from public.finalizar_carga_pedido(
    (select committed_session_id from pg_temp.fx), (select committed_item_id from pg_temp.fx)
  )
)
update pg_temp.fx set committed_archivo_id=committed.archivo_id from committed;
reset role;
update public.pedidos set status='entregado'::public.pedido_estado where id=(select pedido_id from pg_temp.fx);
set local role authenticated;
select set_config('request.jwt.claim.sub', (select worker_id::text from pg_temp.fx), true);
with retried as (
  select * from public.finalizar_carga_pedido(
    (select committed_session_id from pg_temp.fx), (select committed_item_id from pg_temp.fx)
  )
)
update pg_temp.fx set committed_retry_archivo_id=retried.archivo_id from retried;
select pg_temp.expect_error($sql$
  select * from public.reservar_carga_pedido(
    (select pedido_id from pg_temp.fx),
    '[{"original_name":"entregado.pdf","safe_name":"entregado.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb
  )
$sql$, 'pedido_not_uploadable');
reset role;
do $$
begin
  if (select committed_archivo_id from pg_temp.fx) is distinct from (select committed_retry_archivo_id from pg_temp.fx)
    or (select count(*) from public.archivos where pedido_id=(select pedido_id from pg_temp.fx)) <> 1
    or (select count(*) from public.pedido_historial
        where pedido_id=(select pedido_id from pg_temp.fx) and action='archivo_subido'::public.pedido_historial_action) <> 1 then
    raise exception 'internal idempotent retry created duplicate metadata or history';
  end if;
end;
$$;
update public.pedidos set status='cancelado'::public.pedido_estado where id=(select pedido_id from pg_temp.fx);
set local role authenticated;
select set_config('request.jwt.claim.sub', (select worker_id::text from pg_temp.fx), true);
select pg_temp.expect_error($sql$
  select * from public.reservar_carga_pedido(
    (select pedido_id from pg_temp.fx),
    '[{"original_name":"cancelado.pdf","safe_name":"cancelado.pdf","normalized_mime":"application/pdf","expected_size":1}]'::jsonb
  )
$sql$, 'pedido_not_uploadable');
reset role;

select 'PPO-03C.1 hardening validation passed' as result;
rollback;
