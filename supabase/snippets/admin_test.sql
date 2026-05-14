insert into public.profiles (
  id,
  full_name,
  role,
  is_active
)
values (
  'df5f4730-e28e-4826-8686-04f90b012c2c',
  'Administrador Godel',
  'admin',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active;