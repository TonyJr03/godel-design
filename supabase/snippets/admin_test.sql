insert into public.profiles (
  id,
  full_name,
  role,
  is_active
)
values (
  '64b272e2-b6fb-4de0-bc81-a2a793fce903',
  'Administrador Godel',
  'admin',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active;