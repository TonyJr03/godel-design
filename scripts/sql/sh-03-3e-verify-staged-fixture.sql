\set ON_ERROR_STOP on
\set VERBOSITY terse

begin read only;
select set_config('sh03_3e.qa_public_reference', :'qa_public_reference', true);
select set_config('sh03_3e.qa_file_name', :'qa_file_name', true);

do $$
declare
  v_reference text := current_setting('sh03_3e.qa_public_reference', true);
  v_file_name text := current_setting('sh03_3e.qa_file_name', true);
  v_solicitud_id uuid;
  v_session_id uuid;
  v_item_id uuid;
begin
  if v_reference is null or v_reference = '' then
    raise exception 'SH-03.3E QA public reference is required.';
  end if;

  if v_file_name not like 'qa-sh03e-expired-%' then
    raise exception 'SH-03.3E QA filename prefix is invalid.';
  end if;

  select s.id
    into strict v_solicitud_id
  from public.solicitudes s
  where s.public_reference = v_reference
    and s.client_name like 'QA SH-03.3E Expired%';

  select session.id, item.id
    into strict v_session_id, v_item_id
  from public.archivo_carga_sesiones session
  join public.archivo_carga_items item on item.session_id = session.id
  where session.solicitud_id = v_solicitud_id
    and session.status = 'open'
    and session.pedido_id is null
    and session.created_by is null
    and session.public_token_hash is not null
    and item.original_name = v_file_name
    and item.status = 'reserved'
    and item.archivo_id is null
    and item.committed_at is null;

  if exists (
    select 1
    from public.archivos a
    where a.solicitud_id = v_solicitud_id
      and a.file_name = v_file_name
  )
    or (
      select count(*)
      from storage.objects o
      join public.archivo_carga_items item on item.object_path = o.name
      where o.bucket_id = 'godel-files'
        and item.id = v_item_id
    ) <> 1 then
    raise exception 'SH-03.3E staged fixture verification failed.';
  end if;
end;
$$;

select 'SH_03_3E_STAGED_TARGET_OK';
commit;
