\set ON_ERROR_STOP on

begin;

create function pg_temp.expect_check(p_statement text, p_label text)
returns void
language plpgsql
as $$
begin
  execute p_statement;
  raise exception '% was accepted', p_label;
exception when check_violation then
  null;
end;
$$;

create function pg_temp.expect_unique(p_statement text, p_label text)
returns void
language plpgsql
as $$
begin
  execute p_statement;
  raise exception '% was accepted', p_label;
exception when unique_violation then
  null;
end;
$$;

do $$
declare
  v_service_id uuid;
  v_solicitud_id uuid := '11111111-1111-4111-8111-111111111111';
  v_public_session_id uuid := '22222222-2222-4222-8222-222222222222';
  v_public_item_id uuid := '33333333-3333-4333-8333-333333333333';
  v_public_part_item_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_expired_session_id uuid := '44444444-4444-4444-8444-444444444444';
  v_expired_item_id uuid := '55555555-5555-4555-8555-555555555555';
  v_internal_user_id uuid := '66666666-6666-4666-8666-666666666666';
  v_pedido_id uuid := '77777777-7777-4777-8777-777777777777';
  v_internal_session_id uuid := '88888888-8888-4888-8888-888888888888';
  v_internal_item_id uuid := '99999999-9999-4999-8999-999999999999';
  v_public_path text := 'cargas/v1/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-qa-file.pdf';
  v_public_part_path text := 'cargas/v1/22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-qa-file.pdf';
  v_expired_path text := 'cargas/v1/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-qa-file.pdf';
  v_internal_path text := 'cargas/v1/88888888-8888-4888-8888-888888888888/99999999-9999-4999-8999-999999999999/cccccccccccccccccccccccccccccccc-qa-file.pdf';
begin
  if to_regclass('public.archivo_carga_sesiones') is null
    or to_regclass('public.archivo_carga_items') is null then
    raise exception 'PPO-03B.1 tables are missing';
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace
      and typname = 'archivo_carga_sesion_estado'
  ) or not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace
      and typname = 'archivo_carga_item_estado'
  ) then
    raise exception 'PPO-03B.1 enums are missing';
  end if;

  if not exists (
    select 1 from pg_proc where oid = 'storage.allow_only_operation(text)'::regprocedure
  ) or not exists (
    select 1 from pg_proc where oid = 'storage.allow_any_operation(text[])'::regprocedure
  ) then
    raise exception 'Storage operation helpers are missing';
  end if;

  if exists (
    select 1 from pg_class
    where oid in ('public.archivo_carga_sesiones'::regclass, 'public.archivo_carga_items'::regclass)
      and not relrowsecurity
  ) then
    raise exception 'PPO-03B.1 tables do not have RLS enabled';
  end if;

  if has_table_privilege('anon', 'public.archivo_carga_sesiones', 'select')
    or has_table_privilege('authenticated', 'public.archivo_carga_sesiones', 'insert')
    or has_table_privilege('anon', 'public.archivo_carga_items', 'select')
    or has_table_privilege('authenticated', 'public.archivo_carga_items', 'insert') then
    raise exception 'PPO-03B.1 control-plane tables expose direct client privileges';
  end if;

  if (select public from storage.buckets where id = 'godel-files')
    or (select file_size_limit from storage.buckets where id = 'godel-files') <> 20971520
    or not (select allowed_mime_types @> array['application/vnd.rar', 'application/vnd.corel-draw', 'application/x-zip-compressed']::text[] from storage.buckets where id = 'godel-files') then
    raise exception 'godel-files hardening is incomplete';
  end if;

  select id into v_service_id
  from public.tipos_servicio
  order by created_at
  limit 1;

  insert into public.solicitudes (
    id, client_name, client_phone, service_id, description
  ) values (
    v_solicitud_id, 'PPO QA', '0000000000', v_service_id, 'Fixture reversible PPO-03B.1'
  );

  insert into public.archivo_carga_sesiones (
    id, solicitud_id, public_token_hash, expires_at
  ) values (
    v_public_session_id, v_solicitud_id,
    encode(digest(v_solicitud_id::text || clock_timestamp()::text, 'sha256'), 'hex'),
    now() + interval '15 minutes'
  );

  insert into public.archivo_carga_items (
    id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility
  ) values (
    v_public_item_id, v_public_session_id, 0, v_public_path, 'Factura Agosto 2026.pdf', 'application/pdf', 1, 'cliente_solicitud'
  );

  insert into public.archivo_carga_items (
    id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility
  ) values (
    v_public_part_item_id, v_public_session_id, 1, v_public_part_path, 'Informe Técnico.PDF', 'application/pdf', 1, 'cliente_solicitud'
  );

  if not private.can_sign_ppo03_public_upload('godel-files', v_public_path) then
    raise exception 'Reserved public item was not eligible for signed upload';
  end if;

  begin
    insert into public.archivo_carga_sesiones (
      solicitud_id, public_token_hash, expires_at
    ) values (
      v_solicitud_id, 'invalid', now() + interval '15 minutes'
    );
    raise exception 'Invalid public token hash was accepted';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.archivo_carga_items (
      session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility
    ) values (
      v_public_session_id, 1,
      'cargas/v1/22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/dddddddddddddddddddddddddddddddd-qa-file.pdf',
      'qa-file.pdf', 'application/pdf', 1, 'cliente_solicitud'
    );
    raise exception 'Item path with a mismatched item id was accepted';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.archivo_carga_items (
      session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility
    ) values (
      v_public_session_id, 1,
      'cargas/v1/22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/dddddddddddddddddddddddddddddddd-qa-file.exe',
      'qa-file.exe', 'application/octet-stream', 1, 'cliente_solicitud'
    );
    raise exception 'Unsupported MIME or extension was accepted';
  exception when check_violation then
    null;
  end;

  insert into public.archivo_carga_sesiones (
    id, solicitud_id, public_token_hash, status, created_at, expires_at
  ) values (
    v_expired_session_id, v_solicitud_id,
    encode(digest(v_expired_session_id::text || clock_timestamp()::text, 'sha256'), 'hex'),
    'expired', now() - interval '2 minutes', now() - interval '1 minute'
  );

  insert into public.archivo_carga_items (
    id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility
  ) values (
    v_expired_item_id, v_expired_session_id, 0, v_expired_path, 'qa-file.pdf', 'application/pdf', 1, 'cliente_solicitud'
  );

  if private.can_sign_ppo03_public_upload('godel-files', v_expired_path) then
    raise exception 'Expired public session remained eligible for signed upload';
  end if;

  insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_internal_user_id, 'authenticated', 'authenticated', 'ppo03b1@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  insert into public.perfiles (id, full_name, role)
  values (v_internal_user_id, 'PPO QA Admin', 'admin');

  insert into public.pedidos (
    id, service_id, title, description, created_by
  ) values (
    v_pedido_id, v_service_id, 'Pedido QA PPO-03B.1', 'Fixture reversible PPO-03B.1', v_internal_user_id
  );

  insert into public.archivo_carga_sesiones (
    id, pedido_id, created_by, expires_at
  ) values (
    v_internal_session_id, v_pedido_id, v_internal_user_id, now() + interval '15 minutes'
  );

  insert into public.archivo_carga_items (
    id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility
  ) values (
    v_internal_item_id, v_internal_session_id, 0, v_internal_path, 'qa-file.pdf', 'application/pdf', 1, 'interno_pedido'
  );

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in (
        'godel_files_insert_ppo03_internal_tus',
        'godel_files_insert_ppo03_public_sign',
        'godel_files_select_ppo03_committed',
        'godel_files_delete_ppo03_managed'
      )
    group by schemaname, tablename
    having count(*) = 4
  ) then
    raise exception 'PPO-03B.1 Storage policies are missing';
  end if;
end;
$$;

do $$
declare
  v_solicitud_id uuid := '11111111-1111-4111-8111-111111111111';
  v_pedido_id uuid := '77777777-7777-4777-8777-777777777777';
  v_internal_user_id uuid := '66666666-6666-4666-8666-666666666666';
  v_slots_session_id uuid := '12121212-1212-4121-8121-121212121212';
  v_max_item_id uuid := '13131313-1313-4131-8131-131313131313';
  v_archivo_id uuid := '14141414-1414-4141-8141-141414141414';
  v_item_id uuid;
  v_slot integer;
begin
  if not private.is_valid_ppo03_file_descriptor('a.pdf', 'application/pdf', 1)
    or not private.is_valid_ppo03_file_descriptor('a.jpg', 'image/jpeg', 1)
    or not private.is_valid_ppo03_file_descriptor('a.jpeg', 'image/jpeg', 1)
    or not private.is_valid_ppo03_file_descriptor('a.png', 'image/png', 1)
    or not private.is_valid_ppo03_file_descriptor('a.webp', 'image/webp', 1)
    or not private.is_valid_ppo03_file_descriptor('a.doc', 'application/msword', 1)
    or not private.is_valid_ppo03_file_descriptor('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1)
    or not private.is_valid_ppo03_file_descriptor('a.zip', 'application/zip', 1)
    or not private.is_valid_ppo03_file_descriptor('a.rar', 'application/vnd.rar', 1)
    or not private.is_valid_ppo03_file_descriptor('a.cdr', 'application/vnd.corel-draw', 1) then
    raise exception 'A canonical PPO-03 descriptor was rejected';
  end if;

  if not (select allowed_mime_types @> array[
    'application/zip', 'application/x-zip-compressed', 'application/vnd.rar', 'application/vnd.corel-draw'
  ]::text[] from storage.buckets where id = 'godel-files') then
    raise exception 'Required ZIP/RAR/CDR bucket MIME types are missing';
  end if;

  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_sesiones (solicitud_id, pedido_id, public_token_hash, expires_at)
    values ('%s', '%s', repeat('b', 64), now() + interval '1 minute')
  $sql$, v_solicitud_id, v_pedido_id), 'Both upload-session contexts');
  perform pg_temp.expect_check($sql$
    insert into public.archivo_carga_sesiones (public_token_hash, expires_at)
    values (repeat('c', 64), now() + interval '1 minute')
  $sql$, 'Upload session without context');
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_sesiones (solicitud_id, expires_at)
    values ('%s', now() + interval '1 minute')
  $sql$, v_solicitud_id), 'Public upload session without hash');
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_sesiones (solicitud_id, created_by, public_token_hash, expires_at)
    values ('%s', '%s', repeat('d', 64), now() + interval '1 minute')
  $sql$, v_solicitud_id, v_internal_user_id), 'Public upload session with creator');
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_sesiones (pedido_id, expires_at)
    values ('%s', now() + interval '1 minute')
  $sql$, v_pedido_id), 'Internal upload session without creator');
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_sesiones (pedido_id, created_by, public_token_hash, expires_at)
    values ('%s', '%s', repeat('e', 64), now() + interval '1 minute')
  $sql$, v_pedido_id, v_internal_user_id), 'Internal upload session with public hash');
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_sesiones (solicitud_id, public_token_hash, created_at, expires_at)
    values ('%s', repeat('f', 64), now(), now())
  $sql$, v_solicitud_id), 'Upload session expiring at creation');

  foreach v_slot in array array[0, 1] loop
    perform pg_temp.expect_check(format($sql$
      insert into public.archivo_carga_sesiones (solicitud_id, public_token_hash, status, expires_at, completed_at)
      values ('%s', repeat('%s', 64), '%s', now() + interval '1 minute', null)
    $sql$, v_solicitud_id, case when v_slot = 0 then 'a' else 'b' end,
      case when v_slot = 0 then 'completed' else 'partial' end), 'Completed or partial session without completion time');
  end loop;
  foreach v_slot in array array[0, 1, 2] loop
    perform pg_temp.expect_check(format($sql$
      insert into public.archivo_carga_sesiones (solicitud_id, public_token_hash, status, expires_at, completed_at)
      values ('%s', repeat('%s', 64), '%s', now() + interval '1 minute', now())
    $sql$, v_solicitud_id, case when v_slot = 0 then '1' when v_slot = 1 then '2' else '3' end,
      case when v_slot = 0 then 'open' when v_slot = 1 then 'expired' else 'cancelled' end), 'Non-finished session with completion time');
  end loop;

  insert into public.archivo_carga_sesiones (id, solicitud_id, public_token_hash, expires_at)
  values (v_slots_session_id, v_solicitud_id, repeat('9', 64), now() + interval '15 minutes');

  for v_slot in 0..9 loop
    v_item_id := case when v_slot = 9 then v_max_item_id else gen_random_uuid() end;
    insert into public.archivo_carga_items (
      id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility
    ) values (
      v_item_id, v_slots_session_id, v_slot,
      format('cargas/v1/%s/%s/%s-slot-%s.pdf', v_slots_session_id, v_item_id, repeat('a', 32), v_slot),
      format('slot-%s.pdf', v_slot), 'application/pdf',
      case when v_slot = 9 then 20971520 else 1 end, 'cliente_solicitud'
    );
  end loop;

  if not exists (select 1 from public.archivo_carga_items where session_id = v_slots_session_id and sort_order = 0)
    or not exists (select 1 from public.archivo_carga_items where session_id = v_slots_session_id and sort_order = 9) then
    raise exception 'Upload session did not accept exactly the boundary slots';
  end if;

  v_item_id := gen_random_uuid();
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility)
    values ('%s', '%s', -1, 'cargas/v1/%s/%s/%s-negative.pdf', 'negative.pdf', 'application/pdf', 1, 'cliente_solicitud')
  $sql$, v_item_id, v_slots_session_id, v_slots_session_id, v_item_id, repeat('a', 32)), 'Negative item slot');
  v_item_id := gen_random_uuid();
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility)
    values ('%s', '%s', 10, 'cargas/v1/%s/%s/%s-eleventh.pdf', 'eleventh.pdf', 'application/pdf', 1, 'cliente_solicitud')
  $sql$, v_item_id, v_slots_session_id, v_slots_session_id, v_item_id, repeat('a', 32)), 'Eleventh item without valid slot');
  v_item_id := gen_random_uuid();
  perform pg_temp.expect_unique(format($sql$
    insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility)
    values ('%s', '%s', 0, 'cargas/v1/%s/%s/%s-duplicate.pdf', 'duplicate.pdf', 'application/pdf', 1, 'cliente_solicitud')
  $sql$, v_item_id, v_slots_session_id, v_slots_session_id, v_item_id, repeat('a', 32)), 'Duplicate item slot');

  v_item_id := gen_random_uuid();
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility)
    values ('%s', '%s', 2, 'cargas/v1/%s/%s/%s-empty.pdf', 'empty.pdf', 'application/pdf', 0, 'cliente_solicitud')
  $sql$, v_item_id, '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', v_item_id, repeat('a', 32)), 'Zero-size item');
  v_item_id := gen_random_uuid();
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility)
    values ('%s', '%s', 2, 'cargas/v1/%s/%s/%s-oversize.pdf', 'oversize.pdf', 'application/pdf', 20971521, 'cliente_solicitud')
  $sql$, v_item_id, '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', v_item_id, repeat('a', 32)), 'Oversize item');
  v_item_id := gen_random_uuid();
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility)
    values ('%s', '%s', 2, 'cargas/v1/%s/%s/%s-wrong.pdf', 'wrong.pdf', 'image/jpeg', 1, 'cliente_solicitud')
  $sql$, v_item_id, '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', v_item_id, repeat('a', 32)), 'Incompatible extension and MIME');

  insert into public.archivos (id, pedido_id, file_name, file_path, file_type, file_size, bucket, visibility)
  values (v_archivo_id, v_pedido_id, 'archivo.pdf', 'cargas/v1/fixture/archivo.pdf', 'application/pdf', 1, 'godel-files', 'interno_pedido');
  v_item_id := gen_random_uuid();
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility, archivo_id)
    values ('%s', '22222222-2222-4222-8222-222222222222', 2, 'cargas/v1/22222222-2222-4222-8222-222222222222/%s/%s-attached.pdf', 'attached.pdf', 'application/pdf', 1, 'cliente_solicitud', '%s')
  $sql$, v_item_id, v_item_id, repeat('a', 32), v_archivo_id), 'Non-committed item with archivo');
  v_item_id := gen_random_uuid();
  perform pg_temp.expect_check(format($sql$
    insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility, committed_at)
    values ('%s', '22222222-2222-4222-8222-222222222222', 2, 'cargas/v1/22222222-2222-4222-8222-222222222222/%s/%s-reserved-time.pdf', 'reserved-time.pdf', 'application/pdf', 1, 'cliente_solicitud', now())
  $sql$, v_item_id, v_item_id, repeat('a', 32)), 'Reserved item with committed timestamp');

  update public.archivo_carga_items
  set status = 'cancelled'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if private.can_sign_ppo03_public_upload(
    'godel-files',
    'cargas/v1/22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-qa-file.pdf'
  ) then
    raise exception 'A non-reserved public item remained eligible for signing';
  end if;

  perform set_config('request.jwt.claim.sub', v_internal_user_id::text, true);
  update public.pedidos set status = 'entregado' where id = v_pedido_id;
  if private.can_create_ppo03_internal_upload(
    'godel-files',
    'cargas/v1/88888888-8888-4888-8888-888888888888/99999999-9999-4999-8999-999999999999/cccccccccccccccccccccccccccccccc-qa-file.pdf'
  ) then
    raise exception 'Delivered order authorized a new internal upload';
  end if;
  update public.pedidos set status = 'cancelado' where id = v_pedido_id;
  if private.can_create_ppo03_internal_upload(
    'godel-files',
    'cargas/v1/88888888-8888-4888-8888-888888888888/99999999-9999-4999-8999-999999999999/cccccccccccccccccccccccccccccccc-qa-file.pdf'
  ) then
    raise exception 'Cancelled order authorized a new internal upload';
  end if;
  update public.pedidos set status = 'solicitud_recibida' where id = v_pedido_id;
end;
$$;

set local role anon;
select set_config('storage.operation', 'storage.object.sign_upload_url', true);
insert into storage.objects (bucket_id, name)
values (
  'godel-files',
  'cargas/v1/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-qa-file.pdf'
);
select count(*) as anon_visible_reserved_objects
from storage.objects
where bucket_id = 'godel-files'
  and name = 'cargas/v1/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-qa-file.pdf';
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
select set_config('storage.operation', 'storage.object.get_authenticated', true);
do $$
begin
  if exists (
    select 1 from storage.objects
    where bucket_id = 'godel-files'
      and name = 'cargas/v1/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-qa-file.pdf'
  ) then
    raise exception 'Reserved staging object was readable through the committed policy';
  end if;
end;
$$;
reset role;

set local role anon;
select set_config('storage.operation', 'storage.tus.upload.part', true);
do $$
begin
  insert into storage.objects (bucket_id, name)
  values (
    'godel-files',
    'cargas/v1/22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-qa-file.pdf'
  );
  raise exception 'TUS part unexpectedly passed the public insert policy';
exception when insufficient_privilege then
  null;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
select set_config('storage.operation', 'storage.tus.upload.create', true);
insert into storage.objects (bucket_id, name)
values (
  'godel-files',
  'cargas/v1/88888888-8888-4888-8888-888888888888/99999999-9999-4999-8999-999999999999/cccccccccccccccccccccccccccccccc-qa-file.pdf'
);
reset role;

do $$
declare
  v_worker_id uuid := '15151515-1515-4151-8151-151515151515';
  v_unassigned_worker_id uuid := '16161616-1616-4161-8161-161616161616';
  v_archivo_id uuid := '17171717-1717-4171-8171-171717171717';
  v_path text := 'cargas/v1/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-qa-file.pdf';
begin
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_worker_id, 'authenticated', 'authenticated', 'ppo03b1-worker@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_unassigned_worker_id, 'authenticated', 'authenticated', 'ppo03b1-unassigned@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());
  insert into public.perfiles (id, full_name, role)
  values
    (v_worker_id, 'PPO QA Assigned Worker', 'trabajador'),
    (v_unassigned_worker_id, 'PPO QA Unassigned Worker', 'trabajador');
  insert into public.pedido_trabajadores (pedido_id, assigned_profile_id, assigned_by)
  values ('77777777-7777-4777-8777-777777777777', v_worker_id, '66666666-6666-4666-8666-666666666666');
  insert into public.archivos (
    id, solicitud_id, pedido_id, file_name, file_path, file_type, file_size, bucket, visibility
  ) values (
    v_archivo_id, '11111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777777',
    'Factura Agosto 2026.pdf', v_path, 'application/pdf', 1, 'godel-files', 'cliente_solicitud'
  );
  update public.archivo_carga_items
  set status = 'committed', committed_at = now(), archivo_id = v_archivo_id
  where id = '33333333-3333-4333-8333-333333333333';

  perform set_config('request.jwt.claim.sub', v_unassigned_worker_id::text, true);
  if private.can_read_ppo03_storage_object('godel-files', v_path) then
    raise exception 'Unassigned worker read a committed inherited request file';
  end if;
  perform set_config('request.jwt.claim.sub', v_worker_id::text, true);
  if not private.can_read_ppo03_storage_object('godel-files', v_path) then
    raise exception 'Assigned worker could not read committed inherited request file';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '15151515-1515-4151-8151-151515151515', true);
select set_config('storage.operation', 'storage.object.get_authenticated', true);
do $$
begin
  if (select count(*) from storage.objects
      where bucket_id = 'godel-files'
        and name = 'cargas/v1/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-qa-file.pdf') <> 1 then
    raise exception 'Committed inherited request file was not readable by assigned worker';
  end if;
end;
$$;
reset role;

select 'PPO-03B.1 schema, constraints, roles and Storage-policy checks passed' as result;

rollback;
