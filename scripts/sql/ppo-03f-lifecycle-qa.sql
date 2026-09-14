\set ON_ERROR_STOP on
\set VERBOSITY terse

begin;

create temp table qa_lifecycle_cases (
  case_name text primary key,
  session_id uuid not null,
  item_id uuid not null,
  object_path text not null,
  committed_item_id uuid,
  committed_object_path text
) on commit drop;

grant select on qa_lifecycle_cases to authenticated, anon;

do $$
declare
  v_service_id uuid := (select id from public.tipos_servicio order by created_at asc limit 1);
  v_abandoned_solicitud_id uuid := gen_random_uuid();
  v_partial_solicitud_id uuid := gen_random_uuid();
  v_completed_solicitud_id uuid := gen_random_uuid();
  v_before_grace_solicitud_id uuid := gen_random_uuid();
  v_abandoned_session_id uuid := gen_random_uuid();
  v_partial_session_id uuid := gen_random_uuid();
  v_completed_session_id uuid := gen_random_uuid();
  v_before_grace_session_id uuid := gen_random_uuid();
  v_abandoned_item_id uuid := gen_random_uuid();
  v_partial_expired_item_id uuid := gen_random_uuid();
  v_partial_committed_item_id uuid := gen_random_uuid();
  v_completed_item_id uuid := gen_random_uuid();
  v_before_grace_item_id uuid := gen_random_uuid();
  v_partial_archivo_id uuid := gen_random_uuid();
  v_completed_archivo_id uuid := gen_random_uuid();
  v_abandoned_path text;
  v_partial_expired_path text;
  v_partial_committed_path text;
  v_completed_path text;
  v_before_grace_path text;
  v_qa_token text := 'ppo-03f-qa-token';
begin
  if v_service_id is null then
    raise exception 'PPO-03F QA requires a seeded service.';
  end if;

  insert into public.solicitudes (id, client_name, client_phone, service_id, description)
  values
    (v_abandoned_solicitud_id, 'PPO-03F QA abandoned', '5551001', v_service_id, 'QA lifecycle'),
    (v_partial_solicitud_id, 'PPO-03F QA partial', '5551002', v_service_id, 'QA lifecycle'),
    (v_completed_solicitud_id, 'PPO-03F QA completed', '5551003', v_service_id, 'QA lifecycle'),
    (v_before_grace_solicitud_id, 'PPO-03F QA grace', '5551004', v_service_id, 'QA lifecycle');

  insert into public.archivo_carga_sesiones (id, solicitud_id, public_token_hash, created_at, expires_at)
  values
    (v_abandoned_session_id, v_abandoned_solicitud_id, encode(extensions.digest(v_qa_token, 'sha256'), 'hex'), timestamptz '1999-01-01 00:00:00+00', timestamptz '2000-01-01 00:00:00+00'),
    (v_partial_session_id, v_partial_solicitud_id, repeat('b', 64), timestamptz '1999-01-01 00:00:00+00', timestamptz '2000-01-01 00:00:00+00'),
    (v_completed_session_id, v_completed_solicitud_id, repeat('c', 64), timestamptz '1999-01-01 00:00:00+00', timestamptz '2000-01-01 00:00:00+00'),
    (v_before_grace_session_id, v_before_grace_solicitud_id, repeat('d', 64), now() - interval '45 minutes', now() - interval '30 minutes');

  v_abandoned_path := format('cargas/v1/%s/%s/%s-abandoned.pdf', v_abandoned_session_id, v_abandoned_item_id, repeat('1', 32));
  v_partial_expired_path := format('cargas/v1/%s/%s/%s-partial.pdf', v_partial_session_id, v_partial_expired_item_id, repeat('2', 32));
  v_partial_committed_path := format('cargas/v1/%s/%s/%s-committed.pdf', v_partial_session_id, v_partial_committed_item_id, repeat('3', 32));
  v_completed_path := format('cargas/v1/%s/%s/%s-completed.pdf', v_completed_session_id, v_completed_item_id, repeat('4', 32));
  v_before_grace_path := format('cargas/v1/%s/%s/%s-grace.pdf', v_before_grace_session_id, v_before_grace_item_id, repeat('5', 32));

  insert into public.archivos (id, solicitud_id, file_name, file_path, file_type, file_size, bucket, visibility)
  values
    (v_partial_archivo_id, v_partial_solicitud_id, 'committed.pdf', v_partial_committed_path, 'application/pdf', 3, 'godel-files', 'cliente_solicitud'),
    (v_completed_archivo_id, v_completed_solicitud_id, 'completed.pdf', v_completed_path, 'application/pdf', 3, 'godel-files', 'cliente_solicitud');

  insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility, status, archivo_id, committed_at)
  values
    (v_abandoned_item_id, v_abandoned_session_id, 0, v_abandoned_path, 'abandoned.pdf', 'application/pdf', 3, 'cliente_solicitud', 'reserved', null, null),
    (v_partial_expired_item_id, v_partial_session_id, 0, v_partial_expired_path, 'partial.pdf', 'application/pdf', 3, 'cliente_solicitud', 'reserved', null, null),
    (v_partial_committed_item_id, v_partial_session_id, 1, v_partial_committed_path, 'committed.pdf', 'application/pdf', 3, 'cliente_solicitud', 'committed', v_partial_archivo_id, now() - interval '2 hours'),
    (v_completed_item_id, v_completed_session_id, 0, v_completed_path, 'completed.pdf', 'application/pdf', 3, 'cliente_solicitud', 'committed', v_completed_archivo_id, now() - interval '2 hours'),
    (v_before_grace_item_id, v_before_grace_session_id, 0, v_before_grace_path, 'grace.pdf', 'application/pdf', 3, 'cliente_solicitud', 'expired', null, null);

  update public.archivo_carga_sesiones
  set status = 'expired'
  where id = v_before_grace_session_id;

  insert into storage.objects (bucket_id, name, metadata)
  values
    ('godel-files', v_abandoned_path, '{"size":3,"mimetype":"application/pdf"}'::jsonb),
    ('godel-files', v_partial_expired_path, '{"size":3,"mimetype":"application/pdf"}'::jsonb),
    ('godel-files', v_partial_committed_path, '{"size":3,"mimetype":"application/pdf"}'::jsonb),
    ('godel-files', v_completed_path, '{"size":3,"mimetype":"application/pdf"}'::jsonb),
    ('godel-files', v_before_grace_path, '{"size":3,"mimetype":"application/pdf"}'::jsonb);

  insert into qa_lifecycle_cases
  values
    ('abandoned', v_abandoned_session_id, v_abandoned_item_id, v_abandoned_path, null, null),
    ('partial', v_partial_session_id, v_partial_expired_item_id, v_partial_expired_path, v_partial_committed_item_id, v_partial_committed_path),
    ('completed', v_completed_session_id, v_completed_item_id, v_completed_path, v_completed_item_id, v_completed_path),
    ('before_grace', v_before_grace_session_id, v_before_grace_item_id, v_before_grace_path, null, null);
end;
$$;

select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

do $$
declare
  v_session_id uuid := (select session_id from qa_lifecycle_cases where case_name = 'abandoned');
  v_item_id uuid := (select item_id from qa_lifecycle_cases where case_name = 'abandoned');
begin
  perform public.autorizar_firma_carga_publica(v_session_id, v_item_id, 'ppo-03f-qa-token');
  raise exception 'PPO-03F expired open session allowed public signing.';
exception when insufficient_privilege then null;
end;
$$;

do $$
declare
  v_session_id uuid := (select session_id from qa_lifecycle_cases where case_name = 'abandoned');
  v_item_id uuid := (select item_id from qa_lifecycle_cases where case_name = 'abandoned');
begin
  perform public.finalizar_carga_publica(v_session_id, v_item_id, 'ppo-03f-qa-token');
  raise exception 'PPO-03F expired open session allowed public finalize.';
exception when insufficient_privilege then null;
end;
$$;

reset role;

select set_config('request.jwt.claim.sub', (select id::text from public.perfiles where role = 'admin' and is_active limit 1), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  v_result record;
  v_repeat record;
begin
  select * into v_result from public.reconciliar_cargas_expiradas(100, 100);

  if v_result.expired_sessions < 1
    or v_result.partial_sessions < 1
    or v_result.completed_sessions < 1
    or v_result.expired_items < 2 then
    raise exception 'PPO-03F lifecycle reconciliation result mismatch.';
  end if;

  if (select count(*) from jsonb_array_elements(v_result.candidates) as candidate where candidate ->> 'item_id' = (select item_id::text from qa_lifecycle_cases where case_name = 'abandoned')) <> 1
    or (select count(*) from jsonb_array_elements(v_result.candidates) as candidate where candidate ->> 'item_id' = (select item_id::text from qa_lifecycle_cases where case_name = 'partial')) <> 1
    or (select count(*) from jsonb_array_elements(v_result.candidates) as candidate where candidate ->> 'item_id' = (select committed_item_id::text from qa_lifecycle_cases where case_name = 'partial')) <> 0
    or (select count(*) from jsonb_array_elements(v_result.candidates) as candidate where candidate ->> 'item_id' = (select item_id::text from qa_lifecycle_cases where case_name = 'completed')) <> 0
    or (select count(*) from jsonb_array_elements(v_result.candidates) as candidate where candidate ->> 'item_id' = (select item_id::text from qa_lifecycle_cases where case_name = 'before_grace')) <> 0 then
    raise exception 'PPO-03F cleanup candidate fixture matrix mismatch.';
  end if;

  if not private.can_manage_upload_storage_object('godel-files', (select object_path from qa_lifecycle_cases where case_name = 'abandoned'))
    or private.can_manage_upload_storage_object('godel-files', (select object_path from qa_lifecycle_cases where case_name = 'before_grace'))
    or private.can_manage_upload_storage_object('godel-files', (select committed_object_path from qa_lifecycle_cases where case_name = 'partial')) then
    raise exception 'PPO-03F cleanup policy candidate matrix mismatch.';
  end if;

  select * into v_repeat from public.reconciliar_cargas_expiradas(100, 100);

  if (select count(*) from jsonb_array_elements(v_repeat.candidates) as candidate where candidate ->> 'item_id' = (select item_id::text from qa_lifecycle_cases where case_name = 'abandoned')) <> 1
    or (select count(*) from jsonb_array_elements(v_repeat.candidates) as candidate where candidate ->> 'item_id' = (select item_id::text from qa_lifecycle_cases where case_name = 'partial')) <> 1
    or (select count(*) from jsonb_array_elements(v_repeat.candidates) as candidate where candidate ->> 'item_id' = (select committed_item_id::text from qa_lifecycle_cases where case_name = 'partial')) <> 0
    or (select count(*) from jsonb_array_elements(v_repeat.candidates) as candidate where candidate ->> 'item_id' = (select item_id::text from qa_lifecycle_cases where case_name = 'completed')) <> 0
    or (select count(*) from jsonb_array_elements(v_repeat.candidates) as candidate where candidate ->> 'item_id' = (select item_id::text from qa_lifecycle_cases where case_name = 'before_grace')) <> 0 then
    raise exception 'PPO-03F reconciliation retry is not target-idempotent.';
  end if;
end;
$$;

reset role;

do $$
begin
  if (select status from public.archivo_carga_sesiones where id = (select session_id from qa_lifecycle_cases where case_name = 'abandoned')) <> 'expired'
    or (select completed_at from public.archivo_carga_sesiones where id = (select session_id from qa_lifecycle_cases where case_name = 'abandoned')) is not null
    or (select status from public.archivo_carga_items where id = (select item_id from qa_lifecycle_cases where case_name = 'abandoned')) <> 'expired' then
    raise exception 'PPO-03F abandoned lifecycle mismatch.';
  end if;

  if (select status from public.archivo_carga_sesiones where id = (select session_id from qa_lifecycle_cases where case_name = 'partial')) <> 'partial'
    or (select completed_at from public.archivo_carga_sesiones where id = (select session_id from qa_lifecycle_cases where case_name = 'partial')) is null
    or (select status from public.archivo_carga_items where id = (select item_id from qa_lifecycle_cases where case_name = 'partial')) <> 'expired'
    or (select archivo_id from public.archivo_carga_items where id = (select item_id from qa_lifecycle_cases where case_name = 'partial')) is not null
    or (select status from public.archivo_carga_items where id = (select committed_item_id from qa_lifecycle_cases where case_name = 'partial')) <> 'committed'
    or not exists (select 1 from public.archivos where id = (select archivo_id from public.archivo_carga_items where id = (select committed_item_id from qa_lifecycle_cases where case_name = 'partial')))
    or not exists (select 1 from storage.objects where bucket_id = 'godel-files' and name = (select committed_object_path from qa_lifecycle_cases where case_name = 'partial')) then
    raise exception 'PPO-03F partial lifecycle committed protection mismatch.';
  end if;

  if (select status from public.archivo_carga_sesiones where id = (select session_id from qa_lifecycle_cases where case_name = 'completed')) <> 'completed'
    or (select completed_at from public.archivo_carga_sesiones where id = (select session_id from qa_lifecycle_cases where case_name = 'completed')) is null
    or (select status from public.archivo_carga_items where id = (select item_id from qa_lifecycle_cases where case_name = 'completed')) <> 'committed' then
    raise exception 'PPO-03F all-committed lifecycle mismatch.';
  end if;

  if (select status from public.archivo_carga_sesiones where id = (select session_id from qa_lifecycle_cases where case_name = 'before_grace')) <> 'expired'
    or (select status from public.archivo_carga_items where id = (select item_id from qa_lifecycle_cases where case_name = 'before_grace')) <> 'expired'
    or private.can_manage_upload_storage_object('godel-files', (select object_path from qa_lifecycle_cases where case_name = 'before_grace')) then
    raise exception 'PPO-03F before-grace lifecycle mismatch.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', (select id::text from public.perfiles where role = 'supervisor' limit 1), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $$
begin
  perform public.reconciliar_cargas_expiradas(100, 100);
  raise exception 'PPO-03F supervisor was allowed to reconcile.';
exception when insufficient_privilege then null;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', (select id::text from public.perfiles where role = 'trabajador' limit 1), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $$
begin
  perform public.reconciliar_cargas_expiradas(100, 100);
  raise exception 'PPO-03F worker was allowed to reconcile.';
exception when insufficient_privilege then null;
end;
$$;
reset role;

set local role anon;
do $$
begin
  perform public.reconciliar_cargas_expiradas(100, 100);
  raise exception 'PPO-03F anon was allowed to reconcile.';
exception when insufficient_privilege then null;
end;
$$;
reset role;

select 'PPO_03F_LIFECYCLE_QA_OK';

rollback;
