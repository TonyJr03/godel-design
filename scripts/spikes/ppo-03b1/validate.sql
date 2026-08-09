\set ON_ERROR_STOP on

begin;

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
    or not (select allowed_mime_types @> array['application/vnd.rar', 'application/vnd.corel-draw']::text[] from storage.buckets where id = 'godel-files') then
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
    v_public_session_id, v_solicitud_id, repeat('a', 64), now() + interval '15 minutes'
  );

  insert into public.archivo_carga_items (
    id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility
  ) values (
    v_public_item_id, v_public_session_id, 0, v_public_path, 'qa-file.pdf', 'application/pdf', 1, 'cliente_solicitud'
  );

  insert into public.archivo_carga_items (
    id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility
  ) values (
    v_public_part_item_id, v_public_session_id, 1, v_public_part_path, 'qa-file.pdf', 'application/pdf', 1, 'cliente_solicitud'
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
    v_expired_session_id, v_solicitud_id, repeat('b', 64), 'expired', now() - interval '2 minutes', now() - interval '1 minute'
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
        'godel_files_insert_ppo03_public_tus',
        'godel_files_select_ppo03_committed',
        'godel_files_delete_ppo03_managed'
      )
    group by schemaname, tablename
    having count(*) = 5
  ) then
    raise exception 'PPO-03B.1 Storage policies are missing';
  end if;
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

select 'PPO-03B.1 schema, constraints and positive Storage-policy checks passed' as result;

rollback;
