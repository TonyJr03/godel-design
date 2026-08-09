-- PPO-03B.1 - Upload-session control plane and operation-aware Storage policies.
-- This migration preserves all legacy Storage paths and does not implement UI or upload flows.

create type public.archivo_carga_sesion_estado as enum (
  'open',
  'completed',
  'partial',
  'expired',
  'cancelled'
);

create type public.archivo_carga_item_estado as enum (
  'reserved',
  'committed',
  'expired',
  'cancelled'
);

create table public.archivo_carga_sesiones (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid references public.solicitudes(id) on delete cascade,
  pedido_id uuid references public.pedidos(id) on delete cascade,
  created_by uuid references public.perfiles(id) on delete restrict,
  public_token_hash text,
  status public.archivo_carga_sesion_estado not null default 'open',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint archivo_carga_sesiones_exactly_one_context_check check (
    (solicitud_id is not null)::integer + (pedido_id is not null)::integer = 1
  ),
  constraint archivo_carga_sesiones_public_context_check check (
    solicitud_id is null
    or (
      pedido_id is null
      and created_by is null
      and public_token_hash ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint archivo_carga_sesiones_internal_context_check check (
    pedido_id is null
    or (
      solicitud_id is null
      and created_by is not null
      and public_token_hash is null
    )
  ),
  constraint archivo_carga_sesiones_expires_after_creation_check check (
    expires_at > created_at
  ),
  constraint archivo_carga_sesiones_completed_at_status_check check (
    (status in ('completed', 'partial') and completed_at is not null)
    or (status not in ('completed', 'partial') and completed_at is null)
  )
);

create index archivo_carga_sesiones_solicitud_id_idx
on public.archivo_carga_sesiones (solicitud_id)
where solicitud_id is not null;

create index archivo_carga_sesiones_pedido_id_idx
on public.archivo_carga_sesiones (pedido_id)
where pedido_id is not null;

create index archivo_carga_sesiones_status_expires_at_idx
on public.archivo_carga_sesiones (status, expires_at);

create unique index archivo_carga_sesiones_public_token_hash_unique_idx
on public.archivo_carga_sesiones (public_token_hash)
where public_token_hash is not null;

create or replace function private.is_valid_ppo03_file_descriptor(
  file_name text,
  mime_type text,
  file_size bigint
)
returns boolean
language sql
immutable
set search_path = public, private
as $$
  select file_name is not null
    and char_length(btrim(file_name)) between 1 and 255
    and file_name !~ E'[/\\\\]'
    and file_name !~ '[[:cntrl:]]'
    and file_name ~* '\.(pdf|jpg|jpeg|png|webp|doc|docx|zip|rar|cdr)$'
    and file_size > 0
    and file_size <= 20971520
    and (
      (file_name ~* '\.pdf$' and mime_type = 'application/pdf')
      or (file_name ~* '\.(jpg|jpeg)$' and mime_type = 'image/jpeg')
      or (file_name ~* '\.png$' and mime_type = 'image/png')
      or (file_name ~* '\.webp$' and mime_type = 'image/webp')
      or (file_name ~* '\.doc$' and mime_type = 'application/msword')
      or (file_name ~* '\.docx$' and mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      or (file_name ~* '\.zip$' and mime_type = 'application/zip')
      or (file_name ~* '\.rar$' and mime_type = 'application/vnd.rar')
      or (file_name ~* '\.cdr$' and mime_type = 'application/vnd.corel-draw')
    );
$$;

create or replace function private.is_ppo03_object_path(
  expected_session_id uuid,
  expected_item_id uuid,
  object_name text
)
returns boolean
language sql
immutable
set search_path = public, private
as $$
  select object_name ~ (
    '^cargas/v1/' || expected_session_id::text || '/' || expected_item_id::text
    || '/[0-9a-f]{32,128}-[a-z0-9][a-z0-9_-]{0,118}\.(pdf|jpg|jpeg|png|webp|doc|docx|zip|rar|cdr)$'
  );
$$;

create table public.archivo_carga_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.archivo_carga_sesiones(id) on delete cascade,
  sort_order smallint not null,
  object_path text not null,
  original_name text not null,
  normalized_mime text not null,
  expected_size bigint not null,
  visibility public.archivo_visibility not null,
  status public.archivo_carga_item_estado not null default 'reserved',
  archivo_id uuid references public.archivos(id) on delete set null,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  constraint archivo_carga_items_sort_order_range_check check (
    sort_order between 0 and 9
  ),
  constraint archivo_carga_items_object_path_shape_check check (
    private.is_ppo03_object_path(session_id, id, object_path)
    and lower(regexp_replace(object_path, '^.*\.', '')) = lower(regexp_replace(original_name, '^.*\.', ''))
  ),
  constraint archivo_carga_items_descriptor_check check (
    private.is_valid_ppo03_file_descriptor(original_name, normalized_mime, expected_size)
  ),
  constraint archivo_carga_items_committed_at_status_check check (
    (status = 'committed' and committed_at is not null)
    or (status <> 'committed' and committed_at is null and archivo_id is null)
  ),
  constraint archivo_carga_items_session_sort_order_unique unique (session_id, sort_order),
  constraint archivo_carga_items_object_path_unique unique (object_path)
);

create index archivo_carga_items_session_id_idx
on public.archivo_carga_items (session_id);

create index archivo_carga_items_session_status_idx
on public.archivo_carga_items (session_id, status);

create unique index archivo_carga_items_archivo_id_unique_idx
on public.archivo_carga_items (archivo_id)
where archivo_id is not null;

alter table public.archivo_carga_sesiones enable row level security;
alter table public.archivo_carga_items enable row level security;

revoke all on table public.archivo_carga_sesiones from public, anon, authenticated, service_role;
revoke all on table public.archivo_carga_items from public, anon, authenticated, service_role;

create or replace function private.can_sign_ppo03_public_upload(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
stable
set search_path = public, private
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
        and private.is_valid_ppo03_file_descriptor(
          i.original_name,
          i.normalized_mime,
          i.expected_size
        )
    );
$$;

create or replace function private.can_create_ppo03_internal_upload(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
stable
set search_path = public, private
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
        and private.is_valid_ppo03_file_descriptor(
          i.original_name,
          i.normalized_mime,
          i.expected_size
        )
    );
$$;

create or replace function private.can_read_ppo03_storage_object(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
stable
set search_path = public, private
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

create or replace function private.can_manage_ppo03_storage_object(
  object_bucket_id text,
  object_name text
)
returns boolean
language sql
security definer
stable
set search_path = public, private
as $$
  select object_bucket_id = 'godel-files'
    and auth.uid() is not null
    and private.current_user_is_active()
    and private.is_admin_or_supervisor()
    and exists (
      select 1
      from public.archivo_carga_items as i
      join public.archivo_carga_sesiones as s on s.id = i.session_id
      where i.object_path = object_name
        and (s.solicitud_id is not null or s.pedido_id is not null)
    );
$$;

revoke all on function private.is_valid_ppo03_file_descriptor(text, text, bigint) from public;
revoke all on function private.is_ppo03_object_path(uuid, uuid, text) from public;
revoke all on function private.can_sign_ppo03_public_upload(text, text) from public;
revoke all on function private.can_create_ppo03_internal_upload(text, text) from public;
revoke all on function private.can_read_ppo03_storage_object(text, text) from public;
revoke all on function private.can_manage_ppo03_storage_object(text, text) from public;

grant execute on function private.can_sign_ppo03_public_upload(text, text) to anon;
grant execute on function private.can_create_ppo03_internal_upload(text, text) to authenticated;
grant execute on function private.can_read_ppo03_storage_object(text, text) to authenticated;
grant execute on function private.can_manage_ppo03_storage_object(text, text) to authenticated;

create policy godel_files_insert_ppo03_internal_tus
on storage.objects
for insert
to authenticated
with check (
  storage.allow_any_operation(array[
    'storage.tus.upload.create',
    'storage.tus.upload.part'
  ])
  and private.can_create_ppo03_internal_upload(bucket_id, name)
);

create policy godel_files_insert_ppo03_public_sign
on storage.objects
for insert
to anon
with check (
  storage.allow_only_operation('storage.object.sign_upload_url')
  and private.can_sign_ppo03_public_upload(bucket_id, name)
);

create policy godel_files_select_ppo03_committed
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
    and private.can_read_ppo03_storage_object(bucket_id, name)
  )
  or (
    storage.allow_any_operation(array[
      'storage.object.delete',
      'storage.object.delete_many'
    ])
    and private.can_manage_ppo03_storage_object(bucket_id, name)
  )
);

create policy godel_files_delete_ppo03_managed
on storage.objects
for delete
to authenticated
using (
  private.can_manage_ppo03_storage_object(bucket_id, name)
);

update storage.buckets
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array[
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
where id = 'godel-files';

comment on table public.archivo_carga_sesiones is
  'Control plane PPO-03: sesiones reservadas; no expone CRUD directo.';
comment on table public.archivo_carga_items is
  'Control plane PPO-03: items reservados o committed; no representa archivos en UI.';
