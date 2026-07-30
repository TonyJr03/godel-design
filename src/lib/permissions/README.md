# Permisos internos

`src/lib/permissions` centraliza la autorización interna por rol para el
dashboard de Godel Diseño. Expone helpers puros: no consulta Supabase, no
redirige y no protege rutas por sí solo.

## Matriz actual

| Rol | Permisos |
| --- | --- |
| `admin` | Todos los permisos |
| `supervisor` | `dashboard.view`, `solicitudes.view`, `solicitudes.manage`, `pedidos.view`, `pedidos.manage`, `pedidos.change_status`, `clientes.view`, `clientes.manage` |
| `trabajador` | `dashboard.view`, `pedidos.view`, `pedidos.change_status` |

Permisos definidos:

- `dashboard.view`
- `solicitudes.view`
- `solicitudes.manage`
- `pedidos.view`
- `pedidos.manage`
- `pedidos.change_status`
- `clientes.view`
- `clientes.manage`
- `usuarios.view`
- `usuarios.manage`
- `configuracion.view`
- `configuracion.manage`

## Autenticación, perfil y autorización

La autenticación confirma la identidad del usuario mediante Supabase Auth. El
perfil activo confirma que existe una fila interna en `public.perfiles` para
ese usuario y que `is_active = true`. La autorización por rol decide qué puede
ver o ejecutar ese perfil activo según `perfiles.role`.

Un perfil con `must_change_password = true` todavía no se considera operativo.
Puede completar `/cambiar-contrasena-inicial`, pero no debe entrar al dashboard
ni ejecutar flujos internos hasta que el cambio real de contraseña finalice y la
RPC privilegiada marque `must_change_password = false`.

Los helpers de permisos trabajan con roles válidos del sistema y devuelven
booleanos. Los helpers de rutas permiten evaluar si un rol puede acceder
conceptualmente a una ruta del dashboard, pero no hacen redirecciones ni
reemplazan los controles de servidor.

La navegación del dashboard usa `canAccessDashboardRoute` para ocultar enlaces
no permitidos según el rol. Esto es una mejora de UX, no la única protección.

La protección real por URL directa se realiza en el proxy de Next.js. El proxy
también usa `canAccessDashboardRoute`, de modo que la navegación y el bloqueo
de rutas comparten la misma fuente de reglas. El proxy resuelve primero el
estado de primer acceso: usuarios activos con `must_change_password = true` son
redirigidos a `/cambiar-contrasena-inicial` antes de evaluar rutas del
dashboard.

## Rutas del dashboard

La matriz de rutas actual queda así:

| Ruta | Roles permitidos |
| --- | --- |
| `/dashboard` | `admin`, `supervisor`, `trabajador` |
| `/dashboard/solicitudes` | `admin`, `supervisor` |
| `/dashboard/pedidos` | `admin`, `supervisor`, `trabajador` |
| `/dashboard/clientes` | `admin`, `supervisor` |
| `/dashboard/configuracion` | `admin` |
| `/dashboard/configuracion/usuarios` | `admin` |

Las subrutas heredan la regla del prefijo. En Beta 2.5.4 se mantiene
explícitamente el comportamiento de `/dashboard/pedidos/nuevo`: el rol
`trabajador` puede alcanzar la ruta por la regla general de
`/dashboard/pedidos`, y la página/action bloquean la operación porque no tiene
`pedidos.manage`. Esta decisión queda documentada como deuda posterior; no se
resuelve cambiando permisos ni rutas en esta subfase.

## Usuarios internos

`usuarios.view` y `usuarios.manage` pertenecen solo a `admin`. La ruta
`/dashboard/configuracion/usuarios` también está limitada a `admin`.

La gestión de usuarios internos opera sobre Supabase Auth y `public.perfiles`
desde código server-side. La creación segura de usuarios Auth entra por una
Server Action fina que valida `usuarios.manage` y delega en `createInternalUser`;
las ediciones normales siguen modificando solo campos permitidos de
`public.perfiles`.

La subfase 12.2 usa `usuarios.view` para el listado read-only de perfiles
internos. La página carga datos server-side, consulta solo `public.perfiles`,
no consulta `auth.users` y no expone correos electrónicos.

La subfase 12.3 introdujo la carga read-only de perfil por UUID. En la estructura
actual esa carga alimenta la edición desde Configuración, con validación de UUID
y respeto de RLS.

La subfase 12.4 usa `usuarios.manage` para editar perfiles internos en
`/dashboard/configuracion/usuarios/[id]/editar`. El servicio actualiza solo
campos permitidos de `public.perfiles` y aplica guardas para conservar al menos
un administrador activo.

La subfase 12.5 dejó histórico el flujo manual por UUID Auth. El alta vigente
usa `usuarios.manage` desde `/dashboard/configuracion/usuarios`, crea el usuario
Auth con correo y contraseña temporal en servidor, y deja que el trigger de base
provisione el perfil interno. La app no consulta `auth.users`, no inserta
manualmente en `perfiles` y no expone el cliente Admin a componentes.

El cambio inicial obligatorio usa `/cambiar-contrasena-inicial` y no depende de
`usuarios.manage`: el propio usuario autenticado cambia su contraseña temporal
mediante Auth, y el servicio server-side finaliza `must_change_password` con el
RPC privilegiado correspondiente.

El restablecimiento administrativo de contraseña temporal sí depende de
`usuarios.manage` y vive como acción separada de la edición de perfil. Solo un
admin operativo puede iniciar el flujo, no puede aplicarlo sobre su propio
perfil y no envía correo. El servicio server-side y las RPCs vuelven a validar
actor admin activo, `must_change_password = false`, objetivo existente, bloqueo
temporal, rollback y estado final `must_change_password = true`. La recuperación
de intentos usa un `attemptId` generado por el servicio y una RPC de estado que
solo devuelve intentos propios del actor, sin datos personales.

## Relación con RLS

Estos helpers no reemplazan Row Level Security. RLS sigue siendo la última
línea de defensa en Supabase y debe proteger los datos aunque exista una
validación previa en Next.js.

## Cambios futuros de permisos

No se debe cambiar `PERMISSIONS_BY_ROLE`, `canAccessDashboardRoute`, el enum
`app_role`, RLS o el proxy como refactor aislado. Cualquier cambio funcional de
permisos debe tener fase explícita con TypeScript, SQL/RLS, documentación y QA
por rol en la misma entrega.
