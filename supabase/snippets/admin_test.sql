insert into public.profiles (
  id,
  full_name,
  role,
  is_active
)
values (
  '4b77b9a3-8a5c-4742-94ed-f56baa8b99f1',
  'Administrador Godel',
  'admin',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active;