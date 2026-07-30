# Usuarios y perfiles

`src/lib/usuarios` contiene la logica server-side del dominio interno de
usuarios/perfiles del dashboard. Supabase Auth es la autoridad de identidad y
credenciales; `public.perfiles` es la autoridad de rol, estado operativo y datos
internos.

El alta productiva vigente crea el usuario Auth y el perfil interno desde un
flujo server-side unico: Server Action -> `createInternalUser()` -> Auth Admin
-> trigger de provisionamiento.

## Mapa de archivos

- `index.ts`: barrel publico del dominio.
- `types.ts`: DTOs internos de listado, detalle y formulario.
- `roles.ts`: roles internos soportados, derivados de tipos generados.
- `user-validation.ts`: normalizacion y validacion de input editable y de alta.
- `list-internal-users.ts`: listado interno de usuarios desde `public.perfiles`.
- `get-internal-user-by-id.ts`: detalle interno por UUID de perfil/Auth.
- `create-internal-user.ts`: alta administrativa Auth + perfil por trigger.
- `update-internal-user.ts`: actualizacion de perfil, rol y estado.

## Rutas internas

- `/dashboard/configuracion/usuarios`: listado interno y dialogo de alta segura.
- `/dashboard/configuracion/usuarios/[id]/editar`: edicion interna de perfil, rol y estado.

Las rutas viven en `src/app/(interno)/dashboard/configuracion/usuarios` y deben
seguir delegando en servicios de `src/lib/usuarios`. Las Server Actions son
adaptadores finos: leen `FormData`, llaman servicios y revalidan rutas.

## Componentes principales

- `InternalUsersList`: listado responsive de usuarios internos, incluyendo el
  estado de cambio inicial pendiente.
- `UserCreateForm`: formulario de alta segura con correo y contrasena temporal.
- `UserEditForm`: formulario de edicion de perfil, rol y estado.

Los componentes son UI. No consultan Supabase, no consultan `auth.users`, no
deciden permisos criticos y no deben reutilizarse en rutas publicas.

## Servicios

- `listInternalUsers` requiere `usuarios.view` y devuelve perfiles internos para dashboard.
- `getInternalUserById` valida UUID, requiere `usuarios.view` y devuelve el detalle interno del perfil.
- `createInternalUser` autentica al admin actual, valida que su perfil exista,
  este activo, no tenga `must_change_password` pendiente y posea
  `usuarios.manage`; despues valida correo, contrasena temporal y perfil,
  reserva auditoria/rate limit con el cliente server-side normal y recien
  entonces llama a Admin API.
- `updateInternalUser` requiere `usuarios.manage`, valida UUID e input, y
  actualiza solo campos permitidos de perfil.

`createInternalUser` usa exclusivamente `app_metadata.godel_provisioning` con
`version = 1`, `source = "admin_dashboard"`, datos de perfil normalizados y
`created_by` del admin operativo. La llamada usa `email_confirm = true` para
confirmacion administrativa sin envio de email. No usa `user_metadata`, no
inserta manualmente en `perfiles`, no ejecuta RPC de cambio inicial, no devuelve
password ni objeto Auth completo y retorna solo `{ userId }`.

Supabase Auth local puede aplicar `app_metadata` despues del `INSERT` inicial
de `auth.users`. La base por eso mantiene dos triggers complementarios:
`AFTER INSERT` y `AFTER UPDATE OF raw_app_meta_data` cuando
`godel_provisioning` aparece por primera vez. Ambos llaman la misma funcion
privilegiada de provisionamiento y conservan `app_metadata` como metadata
administrativa.

`createInternalUser` no considera suficiente el objeto Auth retornado. Despues
de validar el UUID consulta `public.perfiles` con el cliente server-side normal
y verifica `id`, nombre, opcionales, rol, `is_active = true`,
`must_change_password = true` y `created_by`. Si falta el perfil o no coincide,
intenta eliminar compensatoriamente el Auth user y devuelve
`provisioning_error` con un mensaje generico.

Antes de construir `createAdminClient`, `createInternalUser` llama
`public.begin_internal_user_creation_attempt` con el cliente server-side normal.
La RPC registra el intento en `private.internal_user_creation_audit` y aplica
rate limiting de 5 intentos reales por admin en 10 minutos y 20 intentos reales
globales en 1 hora. Si se excede una ventana, el servicio devuelve
`rate_limited` sin invocar Auth Admin.

Despues de Auth Admin y de la verificacion de perfil, el servicio llama
`public.complete_internal_user_creation_attempt` para cerrar la auditoria como
`succeeded`, `failed` o `compensation_failed`. La auditoria no guarda correo,
contrasena, metadata, tokens, payloads completos ni mensajes externos. El exito
funcional depende de Auth user creado y perfil correcto; el cierre `succeeded`
es de mejor esfuerzo. Si ese cierre falla, el usuario Auth y el perfil se
conservan, el servicio devuelve exito y la fila `pending` queda como senal para
reconciliacion operativa posterior.

El flujo legacy de crear una fila de `public.perfiles` por UUID Auth ya fue
retirado del dominio productivo. No debe reintroducirse como formulario,
servicio ni Server Action.

## Tipos, roles y validacion

`types.ts` centraliza los DTOs internos del dominio. Los roles se obtienen desde
`roles.ts` para mantener alineacion con los tipos generados de base de datos.

`user-validation.ts` mantiene el contrato de edicion y el contrato de alta
completa: normaliza correo con `trim` y minusculas, no altera la contrasena
temporal, exige confirmacion exacta y requiere confirmacion explicita cuando el
rol nuevo es `admin`.

## Revalidacion

Las rutas de usuarios se revalidan con helpers centralizados en
`src/lib/actions/revalidation.ts`:

- `revalidateUsuariosList()`
- `revalidateUsuarioDetail(userId)`
- `revalidateUsuarioEdit(userId)`

Las actions de usuarios deben usar esos helpers en lugar de repetir rutas a
mano.

## Guardas admin

La edicion de usuarios conserva guardas criticas:

- un administrador no puede desactivarse a si mismo;
- un administrador no puede quitarse su propio rol admin;
- el sistema debe conservar al menos un administrador operativo.

Estas guardas viven en servidor y se complementan con restricciones/triggers de
base de datos. No deben moverse a componentes ni relajarse como cambio menor de
UI.

Un administrador operativo es `role = admin`, `is_active = true` y
`must_change_password = false`. Un admin con contrasena temporal pendiente no
impide actualizar al ultimo administrador real.

## Datos visibles en dashboard

En rutas internas puede mostrarse:

- nombre para mostrar;
- rol;
- estado activo/inactivo;
- estado de cambio inicial pendiente;
- avatar sanitizado;
- fecha de creacion;
- UUID de perfil/Auth solo dentro del dashboard cuando el componente lo necesite.

La gestion interna de perfiles no muestra ni edita email, password u otros datos
de Supabase Auth.

## Seguridad

- Validar perfil activo y permisos en servidor.
- Rechazar operaciones administrativas si el admin actual conserva
  `must_change_password = true`.
- Mantener `usuarios.view` para lecturas internas.
- Mantener `usuarios.manage` para creacion/edicion.
- Usar RLS como defensa final.
- Usar `createAdminClient` solo en `create-internal-user.ts` y solo para Admin
  API de Auth: `createUser` y compensacion `deleteUser`.
- Consultar `perfiles` desde `createInternalUser` con el cliente server-side
  normal, no con el cliente Admin.
- Usar el cliente server-side normal para las RPCs de auditoria/rate limiting de
  alta completa; nunca el cliente Admin.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No consultar `auth.users`.
- No consultar Supabase desde componentes cliente.
- No insertar manualmente en `perfiles` desde el alta completa; el trigger de
  Auth es la unica ruta de provisionamiento.
- Mantener errores y logs sanitizados: los logs pueden incluir solo contexto,
  nombre, codigo y estado; nunca correo, contrasena, metadata, tokens o payloads.
- No cambiar roles o permisos sin fase explicita con TypeScript, SQL/RLS,
  documentacion y QA por rol.

## QA e2e

`tests/e2e/usuarios.spec.ts` cubre rutas focales de usuarios para los roles
principales. Esa cobertura complementa `full-visual-qa.spec.ts` y debe
mantenerse pequena y centrada en permisos, visibilidad y errores seguros.

## Que no hacer

- No reintroducir el alta legacy por UUID Auth manual.
- No consultar `auth.users` desde app code.
- No usar el cliente Admin para consultas de tablas.
- No exponer perfiles internos en rutas publicas.
- No mover permisos a componentes.
- No confiar en ocultar botones como seguridad.
- No cambiar la matriz de permisos sin fase explicita.
- No crear `src/services`.
- No mezclar refactors de usuarios con cambios de auth, RLS o permisos.

## Pendiente antes de merge productivo

Falta implementar la pantalla de cambio inicial real de contrasena y el
onboarding protegido que complete `must_change_password = false` despues de que
Auth confirme el cambio. Hasta cerrar esa etapa, el alta segura queda conectada
pero no lista para produccion completa.
