-- Baseline final 04 - Storage.
-- Private bucket and reserved-object access for the upload control plane.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'godel-files',
  'godel-files',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.rar',
    'application/vnd.corel-draw'
  ]
);
create function private.can_sign_public_upload(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select object_bucket_id = 'godel-files'
    and exists (
      select 1
      from public.archivo_carga_items as i
      join public.archivo_carga_sesiones as s on s.id = i.session_id
      join public.solicitudes as q on q.id = s.solicitud_id
      where i.object_path = object_name
        and i.status = 'reserved'
        and i.visibility = 'cliente_solicitud'::public.archivo_visibility
        and s.status = 'open'
        and s.expires_at > now()
        and s.solicitud_id is not null
        and s.pedido_id is null
        and s.created_by is null
        and s.public_token_hash ~ '^[0-9a-f]{64}$'
        and private.is_valid_upload_file_descriptor(
          i.original_name,
          i.normalized_mime,
          i.expected_size
        )
    );
$$;

create function private.can_create_internal_upload(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select object_bucket_id = 'godel-files'
    and auth.uid() is not null
    and private.current_user_is_active()
    and exists (
      select 1
      from public.archivo_carga_items as i
      join public.archivo_carga_sesiones as s on s.id = i.session_id
      join public.pedidos as p on p.id = s.pedido_id
      where i.object_path = object_name
        and i.status = 'reserved'
        and s.status = 'open'
        and s.expires_at > now()
        and s.pedido_id is not null
        and s.solicitud_id is null
        and s.created_by = auth.uid()
        and private.can_access_pedido(p.id)
        and i.visibility = private.pedido_file_visibility_for_status(p.status)
        and private.is_valid_upload_file_descriptor(
          i.original_name,
          i.normalized_mime,
          i.expected_size
        )
    );
$$;

create function private.can_read_committed_storage_object(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select object_bucket_id = 'godel-files'
    and auth.uid() is not null
    and private.current_user_is_active()
    and exists (
      select 1
      from public.archivo_carga_items as i
      join public.archivo_carga_sesiones as s on s.id = i.session_id
      join public.archivos as a on a.id = i.archivo_id
      where i.object_path = object_name
        and i.status = 'committed'
        and i.archivo_id is not null
        and a.bucket = object_bucket_id
        and a.file_path = object_name
        and a.visibility = i.visibility
        and a.file_name = i.original_name
        and a.file_type = i.normalized_mime
        and a.file_size = i.expected_size
        and (
          (
            s.pedido_id is not null
            and a.pedido_id = s.pedido_id
            and private.can_access_pedido(s.pedido_id)
          )
          or (
            s.solicitud_id is not null
            and a.solicitud_id = s.solicitud_id
            and (
              private.is_admin_or_supervisor()
              or (
                a.pedido_id is not null
                and a.visibility = 'cliente_solicitud'::public.archivo_visibility
                and private.can_access_pedido(a.pedido_id)
              )
            )
          )
        )
    );
$$;

create function private.can_manage_upload_storage_object(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select object_bucket_id = 'godel-files'
    and auth.uid() is not null
    and private.current_user_is_active()
    and private.is_admin()
    and exists (
      select 1
      from public.archivo_carga_items as i
      join public.archivo_carga_sesiones as s on s.id = i.session_id
      where i.object_path = object_name
        and i.status = 'expired'::public.archivo_carga_item_estado
        and i.archivo_id is null
        and s.status in (
          'expired'::public.archivo_carga_sesion_estado,
          'partial'::public.archivo_carga_sesion_estado
        )
        and s.expires_at <= now() - private.upload_cleanup_grace()
        and not exists (
          select 1
          from public.archivos as a
          where a.bucket = 'godel-files'
            and a.file_path = i.object_path
        )
    );
$$;
revoke all on function private.can_sign_public_upload(text, text) from public, anon, authenticated, service_role;
revoke all on function private.can_create_internal_upload(text, text) from public, anon, authenticated, service_role;
revoke all on function private.can_read_committed_storage_object(text, text) from public, anon, authenticated, service_role;
revoke all on function private.can_manage_upload_storage_object(text, text) from public, anon, authenticated, service_role;

grant execute on function private.can_sign_public_upload(text, text) to anon;
grant execute on function private.can_create_internal_upload(text, text) to authenticated;
grant execute on function private.can_read_committed_storage_object(text, text) to authenticated;
grant execute on function private.can_manage_upload_storage_object(text, text) to authenticated;

grant usage on schema private to anon;

create policy godel_files_insert_reserved_internal_tus
on storage.objects
for insert
to authenticated
with check (
  storage.allow_any_operation(array[
    'storage.tus.upload.create',
    'storage.tus.upload.part'
  ])
  and private.can_create_internal_upload(bucket_id, name)
);

create policy godel_files_insert_reserved_public_sign
on storage.objects
for insert
to anon
with check (
  storage.allow_only_operation('storage.object.sign_upload_url')
  and private.can_sign_public_upload(bucket_id, name)
);

create policy godel_files_select_committed
on storage.objects
for select
to authenticated
using (
  (
    storage.allow_any_operation(array[
      'storage.object.sign',
      'storage.object.get_signed',
      'storage.object.get_authenticated'
    ])
    and private.can_read_committed_storage_object(bucket_id, name)
  )
  or (
    storage.allow_any_operation(array[
      'storage.object.delete',
      'storage.object.delete_many'
    ])
    and private.can_manage_upload_storage_object(bucket_id, name)
  )
);

create policy godel_files_delete_managed
on storage.objects
for delete
to authenticated
using (
  private.can_manage_upload_storage_object(bucket_id, name)
);
