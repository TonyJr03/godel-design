# Permisos internos

`src/lib/permissions` centraliza la autorización interna por rol para el dashboard de Godel Diseño. Expone helpers puros: no consulta Supabase, no redirige y no protege rutas por sí solo.

## Matriz inicial

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

La autenticación confirma la identidad del usuario mediante Supabase Auth. El perfil activo confirma que existe una fila interna en `public.profiles` para ese usuario y que `is_active = true`. La autorización por rol decide qué puede ver o ejecutar ese perfil activo según `profiles.role`.

Los helpers de permisos trabajan con roles válidos del sistema y devuelven booleanos. Los helpers de rutas permiten evaluar si un rol puede acceder conceptualmente a una ruta del dashboard, pero no hacen redirecciones ni reemplazan los controles de servidor.

La navegación del dashboard usa `canAccessDashboardRoute` para ocultar enlaces no permitidos según el rol. Esto es una mejora de UX, no la única protección.

La protección real por URL directa se realiza en el proxy de Next.js. El proxy también usa `canAccessDashboardRoute`, de modo que la navegación y el bloqueo de rutas comparten la misma fuente de reglas.

## Usuarios internos

`usuarios.view` y `usuarios.manage` pertenecen solo a `admin`. La ruta `/dashboard/usuarios` también está limitada a `admin`.

La Fase 12 recomienda implementar primero gestión de perfiles internos sobre `public.profiles`, sin crear usuarios Auth desde la app y sin usar service role key. Las futuras Server Actions del módulo deben validar permisos en servidor antes de leer o modificar perfiles.

La subfase 12.2 usa `usuarios.view` para el listado read-only de perfiles internos. La página carga datos server-side, consulta solo `public.profiles`, no consulta `auth.users` y no expone correos electrónicos.

La subfase 12.3 usa el mismo permiso para el detalle read-only de `/dashboard/usuarios/[id]`. El servicio valida UUID, respeta RLS y no habilita acciones de edición, cambio de rol ni activación.

La subfase 12.4 usa `usuarios.manage` para editar perfiles internos en `/dashboard/usuarios/[id]/editar`. El servicio actualiza solo campos permitidos de `public.profiles` y aplica guardas para conservar al menos un administrador activo.

La subfase 12.5 usa `usuarios.manage` para crear perfiles internos en `/dashboard/usuarios/nuevo`. La app inserta solo en `public.profiles`, no crea usuarios Auth, no consulta `auth.users`, no pide email ni contraseña y no usa service role key.

## Relación con RLS

Estos helpers no reemplazan Row Level Security. RLS sigue siendo la última línea de defensa en Supabase y debe proteger los datos aunque exista una validación previa en Next.js.
