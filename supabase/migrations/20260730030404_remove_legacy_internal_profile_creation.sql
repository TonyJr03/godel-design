drop policy if exists perfiles_insert_admin
on public.perfiles;

revoke insert
on table public.perfiles
from authenticated;
