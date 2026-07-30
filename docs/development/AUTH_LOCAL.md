# Autenticacion Local - Godel Diseno

## Proposito

Este documento describe como mantener usuarios internos de prueba en Supabase
local para validar login, acceso al dashboard y alta administrativa segura.

## Concepto principal

Para acceder al sistema interno hacen falta dos cosas:

- Un usuario en Supabase Auth.
- Un perfil asociado en `public.perfiles` con `is_active = true` y
  `must_change_password = false`.

Supabase Auth confirma la identidad del usuario. `public.perfiles` controla el
acceso interno basico al dashboard. Un perfil con `must_change_password = true`
puede leer su propia fila para onboarding, pero no puede operar en pedidos,
solicitudes, clientes, usuarios, archivos u otras entidades internas.

## Signup publico bloqueado y login habilitado

El signup publico local esta bloqueado en `supabase/config.toml`, pero el
provider email/password debe quedar disponible para que los usuarios existentes
o creados mediante Admin API puedan iniciar sesion:

```toml
[auth]
enable_signup = false

[auth.email]
enable_signup = true
```

`[auth].enable_signup = false` impide la creacion publica de cuentas.
`[auth.email].enable_signup = true` mantiene disponible el login por correo y
contrasena. No habilita un formulario publico de signup dentro de la app.

## Requisitos previos

- Docker Desktop en ejecucion.
- Supabase local iniciado.
- Migraciones aplicadas.
- `.env.local` configurado.
- Next.js en ejecucion.

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

Si cambias `supabase/config.toml`, reinicia Supabase para que Auth lea la
configuracion local:

```cmd
npx supabase stop
npx supabase start
```

Iniciar Next.js:

```cmd
npm run dev
```

## Supabase Studio

Supabase Studio normalmente esta disponible en:

```text
http://localhost:54323
```

Desde Studio puedes usar:

- Authentication > Users
- Table Editor
- SQL Editor

## Clave administrativa local

El alta administrativa segura usa el cliente Admin server-side. Para desarrollo
local, `.env.local` debe definir:

```text
SUPABASE_SECRET_KEY=
```

Obten las variables locales con `npx supabase status -o env` y copia localmente
el valor de `SECRET_KEY` a `SUPABASE_SECRET_KEY` en `.env.local`.
`SERVICE_ROLE_KEY` queda como alternativa legacy local, pero el codigo del
proyecto usa `SUPABASE_SECRET_KEY`.

Reglas:

- nunca versiones el valor real;
- nunca lo muestres en reportes;
- nunca lo compartas en prompts;
- nunca uses prefijo `NEXT_PUBLIC`;
- recuerda que la clave administrativa omite RLS;
- el proyecto no esta enlazado a Supabase remoto;
- la configuracion remota se realizara en preproduccion.

## Crear usuarios internos en local

El flujo recomendado es entrar como admin operativo y usar el dialogo de
Usuarios en `/dashboard/configuracion/usuarios`.

El formulario crea:

- el usuario Auth con correo y contrasena temporal;
- el perfil interno por trigger de base;
- `is_active = true`;
- `must_change_password = true`;
- `created_by` con el admin creador.

El formulario no envia correo ni invitacion. Entrega la contrasena temporal por
un canal externo seguro. El sistema no la muestra de nuevo.

La pantalla de cambio inicial real de contrasena todavia no esta implementada.
Por eso los usuarios nuevos creados por este flujo quedan bloqueados para
operacion interna hasta completar la etapa de onboarding.

## Seed o reparacion puntual de desarrollo

Para disponer de un admin inicial de desarrollo puede seguir siendo necesario
crear manualmente un usuario Auth en Supabase Studio y asociarle un perfil. Este
camino es solo para bootstrap local o reparacion puntual; no es el flujo
productivo de alta.

El `id` del perfil debe coincidir exactamente con el UUID del usuario en Auth.

Ejemplo para un perfil admin local existente:

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

Los usuarios de desarrollo que ya existian antes de `must_change_password` no
requieren cambio inicial y sus perfiles permanecen con
`must_change_password = false`.

## Usuario sin perfil

Un usuario que existe en Supabase Auth pero no tiene fila asociada en
`public.perfiles` puede autenticarse en Auth, pero no puede acceder al
dashboard.

El sistema lo redirige a `/acceso-denegado`.

## Usuario inactivo o con onboarding pendiente

Si `is_active = false`, el usuario no puede acceder al dashboard y sera
redirigido a `/acceso-denegado`.

Si `must_change_password = true`, el usuario tiene una contrasena temporal
pendiente. RLS bloquea la operacion interna aunque pueda leer su propia fila
para completar onboarding en una etapa posterior.

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

1. Usar un usuario admin de desarrollo existente.
2. Confirmar que su perfil tiene `is_active = true` y `must_change_password = false`.
3. Ejecutar `npm run dev`.
4. Ir a `/login`.
5. Iniciar sesion.
6. Confirmar redireccion a `/dashboard`.
7. Abrir `/dashboard/configuracion/usuarios`.
8. Crear un usuario nuevo con correo y contrasena temporal.
9. Confirmar que aparece en el listado como activo y con cambio inicial pendiente.
10. Cerrar sesion.
11. Probar usuario sin perfil.
12. Probar usuario inactivo.

No hagas pruebas E2E completas ni visual QA si la tarea actual solo pide validar
la conexion del alta segura.

## Problemas comunes

- Si el login funciona pero va a `/acceso-denegado`, falta perfil, esta inactivo
  o conserva `must_change_password = true`.
- Si el dashboard redirige a `/login`, no hay sesion valida.
- Si el alta falla por configuracion, revisar `SUPABASE_SECRET_KEY` local sin
  imprimir su valor.
- Si una prueba de login devuelve `email_provider_disabled`, revisar
  `supabase/config.toml` y reiniciar Supabase local.
- Si no aparecen cambios de schema, revisar que se haya ejecutado
  `npx supabase migration up --local`.
- Si Supabase no abre, revisar Docker Desktop.

## Seguridad

- No usar service role key en frontend.
- No crear signup publico.
- No crear nuevos usuarios mediante signup publico local.
- Mantener login email/password habilitado para usuarios existentes y creados
  por Admin API.
- No subir `.env.local`.
- No imprimir secretos ni contrasenas reales.
- Los usuarios de prueba no deben usarse como credenciales reales de produccion.

## Que queda fuera

- Invitaciones por correo.
- Recuperacion de contrasena.
- Cambio inicial real de contrasena desde UI.
- Onboarding que complete `must_change_password = false` despues del cambio real.

## Cierre

El alta administrativa segura ya esta conectada a la UI, pero el flujo completo
no debe considerarse listo para produccion hasta implementar el cambio inicial
obligatorio de contrasena.
