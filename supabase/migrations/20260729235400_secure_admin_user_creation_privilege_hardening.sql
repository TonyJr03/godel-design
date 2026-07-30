-- Etapa 1 - hardening incremental de privilegios para perfiles internos.
-- Mantiene RLS y limita actualizaciones directas de authenticated a columnas editables.

revoke update on table public.perfiles from authenticated;

grant update (
  full_name,
  phone,
  avatar_url,
  role,
  is_active
)
on table public.perfiles
to authenticated;

alter function private.provision_internal_profile_from_auth_user()
set search_path = '';

alter function public.complete_initial_password_change(uuid)
set search_path = '';
