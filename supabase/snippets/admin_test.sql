insert into public.profiles (
  id,
  full_name,
  role,
  is_active
)
values (
  '154d04f2-df90-4cae-92f4-29c0ed6d4144',
  'Administrador Godel',
  'admin',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active;