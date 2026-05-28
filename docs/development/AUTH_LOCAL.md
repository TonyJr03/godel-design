# Autenticación Local — Godel Diseño

## Propósito

Este documento describe cómo crear usuarios internos de prueba en Supabase local para validar el login y el acceso al dashboard del sistema operativo de Godel Diseño.

## Concepto principal

Para acceder al sistema interno hacen falta dos cosas:

- Un usuario en Supabase Auth.
- Un perfil asociado en `public.profiles` con `is_active = true`.

Supabase Auth confirma la identidad del usuario. La tabla `public.profiles` controla el acceso interno básico al dashboard.

## Requisitos previos

- Docker Desktop en ejecución.
- Supabase local iniciado.
- Migraciones aplicadas.
- `.env.local` configurado.
- Next.js en ejecución.

## Comandos en CMD de Windows

Entrar al proyecto:

```cmd
cd /d "RUTA_DEL_PROYECTO"
```

Iniciar Supabase:

```cmd
npx supabase start
```

Ver estado:

```cmd
npx supabase status
```

Reiniciar la base local si hace falta:

```cmd
npx supabase db reset
```

Iniciar Next.js:

```cmd
npm run dev
```

## Supabase Studio

Supabase Studio normalmente está disponible en:

```text
http://localhost:54323
```

Desde Studio puedes usar:

- Authentication > Users
- Table Editor
- SQL Editor

## Crear usuario en Supabase Auth

1. Abrir Supabase Studio.
2. Ir a Authentication > Users.
3. Crear un usuario nuevo.
4. Usar un correo de prueba, por ejemplo:
   - `admin@godel.test`
   - `supervisor@godel.test`
   - `trabajador@godel.test`
5. Definir una contraseña de desarrollo.
6. Copiar el UUID del usuario creado.

Estos usuarios son solo para desarrollo local.

## Crear perfil asociado en `public.profiles`

El `id` del perfil debe coincidir exactamente con el UUID del usuario en Auth.

Ejemplo para crear un perfil admin:

```sql
insert into public.profiles (
  id,
  full_name,
  role,
  is_active
)
values (
  'PEGA_AQUI_EL_UUID_DEL_USUARIO',
  'Administrador Godel',
  'admin',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();
```

## Ejemplos por rol

Roles válidos:

- `admin`
- `supervisor`
- `trabajador`

En Fase 3 todavía no se aplican permisos por rol en la interfaz, pero los roles ya existen en la base para la Fase 4.

Admin:

```sql
insert into public.profiles (id, full_name, role, is_active)
values (
  'UUID_DEL_USUARIO_ADMIN',
  'Administrador Godel',
  'admin',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();
```

Supervisor:

```sql
insert into public.profiles (id, full_name, role, is_active)
values (
  'UUID_DEL_USUARIO_SUPERVISOR',
  'Supervisor Godel',
  'supervisor',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();
```

Trabajador:

```sql
insert into public.profiles (id, full_name, role, is_active)
values (
  'UUID_DEL_USUARIO_TRABAJADOR',
  'Trabajador Godel',
  'trabajador',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();
```

## Usuario sin perfil

Un usuario que existe en Supabase Auth pero no tiene fila asociada en `public.profiles` puede autenticarse en Auth, pero no puede acceder al dashboard.

El sistema lo redirige a `/acceso-denegado`.

## Usuario inactivo

Si `is_active = false`, el usuario no puede acceder al dashboard y será redirigido a `/acceso-denegado`.

Desactivar un usuario:

```sql
update public.profiles
set is_active = false, updated_at = now()
where id = 'UUID_DEL_USUARIO';
```

Reactivar un usuario:

```sql
update public.profiles
set is_active = true, updated_at = now()
where id = 'UUID_DEL_USUARIO';
```

## Flujo de prueba recomendado

1. Crear usuario en Auth.
2. Crear perfil asociado en `profiles`.
3. Ejecutar `npm run dev`.
4. Ir a `/login`.
5. Iniciar sesión.
6. Confirmar redirección a `/dashboard`.
7. Cerrar sesión.
8. Probar usuario sin perfil.
9. Probar usuario inactivo.

## Problemas comunes

- Si el login funciona pero va a `/acceso-denegado`, falta perfil o está inactivo.
- Si el dashboard redirige a `/login`, no hay sesión válida.
- Si no se puede crear el perfil, revisar que el UUID sea correcto.
- Si no aparecen tablas, revisar que se haya ejecutado `npx supabase db reset`.
- Si Supabase no abre, revisar Docker Desktop.

## Seguridad

- No usar service role key en frontend.
- No crear signup público.
- No subir `.env.local`.
- Los usuarios de prueba no deben usarse como credenciales reales de producción.

## Qué queda fuera

- Gestión de usuarios desde panel admin.
- Invitaciones por correo.
- Recuperación de contraseña.
- Permisos por rol.
- Auditoría avanzada.
- Creación automática de perfiles.

## Cierre

La siguiente subfase será la revisión final de la Fase 3 antes de pasar a roles y permisos internos.
