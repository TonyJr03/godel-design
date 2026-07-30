# Autenticación Local — Godel Diseño

## Propósito

Este documento describe cómo mantener usuarios internos de prueba en Supabase local para validar el login y el acceso al dashboard del sistema operativo de Godel Diseño.

## Concepto principal

Para acceder al sistema interno hacen falta dos cosas:

- Un usuario en Supabase Auth.
- Un perfil asociado en `public.perfiles` con `is_active = true` y `must_change_password = false`.

Supabase Auth confirma la identidad del usuario. La tabla `public.perfiles` controla el acceso interno básico al dashboard. Desde la base de creación administrativa segura, un perfil con `must_change_password = true` puede leer su propia fila para onboarding, pero no puede operar en pedidos, solicitudes, clientes, usuarios, archivos u otras entidades internas.

El signup público local está bloqueado en `supabase/config.toml`, pero el
provider email/password debe quedar disponible para que los usuarios existentes
puedan iniciar sesión:

```toml
[auth]
enable_signup = false

[auth.email]
enable_signup = true
```

`[auth].enable_signup = false` impide la creación pública de cuentas.
`[auth.email].enable_signup = true` mantiene disponible el login por correo y
contraseña para usuarios ya existentes o creados mediante Admin API. No habilita
un formulario público de signup dentro de la app.

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

Obtener variables locales en formato de entorno:

```cmd
npx supabase status -o env
```

Aplicar migraciones pendientes sin borrar datos locales:

```cmd
npx supabase migration up --local
```

Si cambias `supabase/config.toml`, reinicia Supabase para que Auth lea la configuración local:

```cmd
npx supabase stop
npx supabase start
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

## Signup público bloqueado y login habilitado

El signup público por email no debe usarse en local para crear usuarios internos
nuevos. La configuración global `[auth].enable_signup = false` debe mantenerse
para bloquear ese flujo.

La configuración `[auth.email].enable_signup = true` debe mantenerse para que
el inicio de sesión email/password siga disponible. Si una prueba de login
devuelve `email_provider_disabled`, el provider quedó deshabilitado y hay que
revisar `supabase/config.toml` y reiniciar Supabase local.

La Admin API puede crear usuarios Auth desde código server-side aislado. El
servicio backend `createInternalUser()` usa esa ruta con metadata segura en
`raw_app_meta_data.godel_provisioning`; el trigger de base crea el perfil con
`must_change_password = true`. La UI productiva de alta completa todavía no está
conectada.

Después de modificar `supabase/config.toml`, reinicia Supabase local con:

```cmd
npx.cmd supabase stop
npx.cmd supabase start
```

Los usuarios de desarrollo que ya existían antes de este cambio no requieren cambio de contraseña inicial y sus perfiles permanecen con `must_change_password = false`.

## Clave administrativa local

La Etapa 2 introduce el contrato técnico del cliente Admin server-side. Para desarrollo local, `.env.local` debe definir:

```text
SUPABASE_SECRET_KEY=
```

Obtén las variables locales con `npx supabase status -o env` y copia localmente el valor de `SECRET_KEY` a `SUPABASE_SECRET_KEY` en `.env.local`. `SERVICE_ROLE_KEY` queda como alternativa legacy local, pero el código del proyecto usa únicamente `SUPABASE_SECRET_KEY`.

Reglas:

- nunca versiones el valor real;
- nunca lo muestres en reportes;
- nunca lo compartas en prompts;
- nunca uses prefijo `NEXT_PUBLIC`;
- recuerda que la clave administrativa omite RLS;
- el proyecto no está enlazado a Supabase remoto;
- la configuración remota se realizará en preproducción.

## Crear perfil asociado en `public.perfiles`

El `id` del perfil debe coincidir exactamente con el UUID del usuario en Auth.

Ejemplo para crear un perfil admin:

```sql
insert into public.perfiles (
  id,
  full_name,
  role,
  is_active,
  must_change_password
)
values (
  'PEGA_AQUI_EL_UUID_DEL_USUARIO',
  'Administrador Godel',
  'admin',
  true,
  false
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  must_change_password = excluded.must_change_password,
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
insert into public.perfiles (id, full_name, role, is_active, must_change_password)
values (
  'UUID_DEL_USUARIO_ADMIN',
  'Administrador Godel',
  'admin',
  true,
  false
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  must_change_password = excluded.must_change_password,
  updated_at = now();
```

Supervisor:

```sql
insert into public.perfiles (id, full_name, role, is_active, must_change_password)
values (
  'UUID_DEL_USUARIO_SUPERVISOR',
  'Supervisor Godel',
  'supervisor',
  true,
  false
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  must_change_password = excluded.must_change_password,
  updated_at = now();
```

Trabajador:

```sql
insert into public.perfiles (id, full_name, role, is_active, must_change_password)
values (
  'UUID_DEL_USUARIO_TRABAJADOR',
  'Trabajador Godel',
  'trabajador',
  true,
  false
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  must_change_password = excluded.must_change_password,
  updated_at = now();
```

## Usuario sin perfil

Un usuario que existe en Supabase Auth pero no tiene fila asociada en `public.perfiles` puede autenticarse en Auth, pero no puede acceder al dashboard.

El sistema lo redirige a `/acceso-denegado`.

## Usuario inactivo

Si `is_active = false`, el usuario no puede acceder al dashboard y será redirigido a `/acceso-denegado`.

Si `must_change_password = true`, el usuario tiene una contraseña temporal pendiente. RLS bloquea la operación interna aunque pueda leer su propia fila para completar onboarding en una etapa posterior.

Desactivar un usuario:

```sql
update public.perfiles
set is_active = false, updated_at = now()
where id = 'UUID_DEL_USUARIO';
```

Reactivar un usuario:

```sql
update public.perfiles
set is_active = true, updated_at = now()
where id = 'UUID_DEL_USUARIO';
```

## Flujo de prueba recomendado

1. Usar un usuario de desarrollo existente.
2. Confirmar que su perfil en `perfiles` tiene `is_active = true` y `must_change_password = false`.
3. Ejecutar `npm run dev`.
4. Ir a `/login`.
5. Iniciar sesión.
6. Confirmar redirección a `/dashboard`.
7. Cerrar sesión.
8. Probar usuario sin perfil.
9. Probar usuario inactivo.
10. Probar perfil con `must_change_password = true` solo cuando exista la pantalla de onboarding correspondiente.

## Problemas comunes

- Si el login funciona pero va a `/acceso-denegado`, falta perfil o está inactivo.
- Si el dashboard redirige a `/login`, no hay sesión válida.
- Si no se puede crear el perfil, revisar que el UUID sea correcto.
- Si no aparecen cambios de schema, revisar que se haya ejecutado `npx supabase migration up --local`.
- Si Supabase no abre, revisar Docker Desktop.

## Seguridad

- No usar service role key en frontend.
- No crear signup público.
- No crear nuevos usuarios mediante signup público local.
- Mantener login email/password habilitado para usuarios existentes.
- No subir `.env.local`.
- Los usuarios de prueba no deben usarse como credenciales reales de producción.

## Qué queda fuera

- Invitaciones por correo.
- Recuperación de contraseña.
- Cambio inicial real de contraseña desde UI.
- Conexión UI productiva del alta completa de usuarios Auth desde panel admin.

## Cierre

La siguiente subfase será la revisión final de la Fase 3 antes de pasar a roles y permisos internos.
