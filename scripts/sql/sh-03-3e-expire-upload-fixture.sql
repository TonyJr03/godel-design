\set ON_ERROR_STOP on
\set VERBOSITY terse

begin;
select set_config('sh03_3e.qa_public_reference', :'qa_public_reference', true);
select set_config('sh03_3e.qa_file_name', :'qa_file_name', true);

do $$
declare
  v_reference text := current_setting('sh03_3e.qa_public_reference', true);
  v_file_name text := current_setting('sh03_3e.qa_file_name', true);
  v_solicitud_id uuid;
  v_session_id uuid;
  v_item_id uuid;
  v_original_solicitud_created_at timestamptz;
  v_original_session_created_at timestamptz;
  v_original_session_expires_at timestamptz;
  v_original_item_created_at timestamptz;
  v_original_ttl interval;
  v_delta interval;
begin
  if v_reference is null or v_reference = '' then
    raise exception 'SH-03.3E QA public reference is required.';
  end if;

  if v_file_name not like 'qa-sh03e-expired-%' then
    raise exception 'SH-03.3E QA filename prefix is invalid.';
  end if;

  select s.id, s.created_at
    into strict v_solicitud_id, v_original_solicitud_created_at
  from public.solicitudes s
  where s.public_reference = v_reference
    and s.client_name like 'QA SH-03.3E Expired%';

  select
    s.id,
    i.id,
    s.created_at,
    s.expires_at,
    i.created_at,
    s.expires_at - s.created_at
  into strict
    v_session_id,
    v_item_id,
    v_original_session_created_at,
    v_original_session_expires_at,
    v_original_item_created_at,
    v_original_ttl
  from public.archivo_carga_sesiones s join public.archivo_carga_items i on i.session_id = s.id
  where s.solicitud_id = v_solicitud_id and s.status = 'open' and s.pedido_id is null
    and s.created_by is null and s.public_token_hash is not null
    and i.original_name = v_file_name and i.status = 'reserved' and i.archivo_id is null and i.committed_at is null;

  if v_original_ttl <= interval '0'
    or v_original_solicitud_created_at > v_original_session_created_at
    or v_original_session_created_at > v_original_item_created_at
    or v_original_item_created_at >= v_original_session_expires_at
    or exists (
      select 1
      from public.archivos a
      where a.solicitud_id = v_solicitud_id
        and a.file_name = v_file_name
    )
    or (
      select count(*)
      from storage.objects o
      join public.archivo_carga_items i on i.object_path = o.name
      where o.bucket_id = 'godel-files'
        and i.id = v_item_id
    ) <> 1 then
    raise exception 'SH-03.3E QA fixture guards failed.';
  end if;

  v_delta := v_original_session_created_at
    - ((clock_timestamp() - interval '2 hours') - v_original_ttl);

  update public.solicitudes set created_at = created_at - v_delta where id = v_solicitud_id;
  update public.archivo_carga_sesiones set created_at = created_at - v_delta, expires_at = expires_at - v_delta where id = v_session_id;
  update public.archivo_carga_items set created_at = created_at - v_delta where id = v_item_id;

  if not exists (
    select 1
    from public.solicitudes solicitud
    join public.archivo_carga_sesiones session on session.solicitud_id = solicitud.id
    join public.archivo_carga_items item on item.session_id = session.id
    where solicitud.id = v_solicitud_id
      and session.id = v_session_id
      and item.id = v_item_id
      and session.status = 'open'
      and item.status = 'reserved'
      and item.archivo_id is null
      and item.committed_at is null
      and session.expires_at > session.created_at
      and session.expires_at <= now() - private.upload_cleanup_grace()
      and solicitud.created_at <= session.created_at
      and session.created_at <= item.created_at
      and item.created_at < session.expires_at
      and session.expires_at - session.created_at = v_original_ttl
  )
    or exists (
      select 1
      from public.archivos a
      where a.solicitud_id = v_solicitud_id
        and a.file_name = v_file_name
    )
    or (
      select count(*)
      from storage.objects o
      join public.archivo_carga_items i on i.object_path = o.name
      where o.bucket_id = 'godel-files'
        and i.id = v_item_id
    ) <> 1 then
    raise exception 'SH-03.3E QA time-warp assertions failed.';
  end if;
end;
$$;
select 'SH_03_3E_EXPIRE_FIXTURE_OK';
commit;
