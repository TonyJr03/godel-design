# Modelo de Roles y Permisos — Godel Diseño

## Propósito

Este documento define la matriz vigente de roles y permisos internos del
sistema web de gestión operativa de Godel Diseño.

## Conceptos base

| Concepto | Descripción |
| --- | --- |
| Autenticación | Confirma la identidad del usuario mediante Supabase Auth. |
| Perfil interno activo | Confirma que el usuario autenticado tiene una fila en `public.perfiles` con `is_active = true`. |
| Autorización por rol | Decide qué puede ver o ejecutar un usuario interno según `perfiles.role`. |
| Navegación visible | Oculta o muestra enlaces del dashboard según rol. Es una mejora de UX, no una barrera de seguridad suficiente. |
| Protección de rutas | Bloquea acceso manual por URL a secciones no permitidas mediante el proxy. |
| Row Level Security | Políticas de Supabase que protegen los datos en la base de datos. Es la última línea de defensa. |

## Roles iniciales

| Rol | Responsabilidad general |
| --- | --- |
| `admin` | Administra el sistema interno, usuarios, configuración y todos los módulos operativos. |
| `supervisor` | Gestiona la operación diaria: solicitudes, pedidos y clientes. |
| `trabajador` | Ejecuta trabajo asignado sobre pedidos y actualiza estados cuando los módulos reales lo permitan. |

## Matriz de navegación por sección

| Sección | Admin | Supervisor | Trabajador |
| --- | --- | --- | --- |
| Dashboard | Sí | Sí | Sí |
| Solicitudes | Sí | Sí | No |
| Pedidos | Sí | Sí | Sí |
| Clientes | Sí | Sí | No |
| Usuarios | Sí | No | No |
| Configuración | Sí | No | No |

## Matriz de permisos internos

| Permiso | Admin | Supervisor | Trabajador |
| --- | --- | --- | --- |
| `dashboard.view` | Sí | Sí | Sí |
| `solicitudes.view` | Sí | Sí | No |
| `solicitudes.manage` | Sí | Sí | No |
| `pedidos.view` | Sí | Sí | Sí |
| `pedidos.manage` | Sí | Sí | No |
| `pedidos.change_status` | Sí | Sí | Sí |
| `clientes.view` | Sí | Sí | No |
| `clientes.manage` | Sí | Sí | No |
| `usuarios.view` | Sí | No | No |
| `usuarios.manage` | Sí | No | No |
| `configuracion.view` | Sí | No | No |
| `configuracion.manage` | Sí | No | No |

## Reglas por rol

### Admin

- Tiene acceso completo.
- Puede gestionar usuarios.
- Puede acceder a configuración.
- Puede gestionar solicitudes, pedidos y clientes.

### Supervisor

- Puede gestionar solicitudes.
- Puede gestionar pedidos.
- Puede gestionar clientes.
- No puede gestionar usuarios.
- No puede acceder a configuración administrativa.

### Trabajador

- Puede ver dashboard.
- Puede ver pedidos.
- Puede cambiar el estado de pedidos asignados.
- No puede ver solicitudes.
- No puede ver clientes.
- No puede gestionar usuarios.
- No puede acceder a configuración.

## Protección de rutas

`canAccessDashboardRoute(role, pathname)` es la fuente central para decidir acceso a rutas internas del dashboard. La misma función se usa para navegación visible y para protección por URL directa.

| Ruta | Roles permitidos |
| --- | --- |
| `/dashboard` | `admin`, `supervisor`, `trabajador` |
| `/dashboard/solicitudes` | `admin`, `supervisor` |
| `/dashboard/pedidos` | `admin`, `supervisor`, `trabajador` |
| `/dashboard/clientes` | `admin`, `supervisor` |
| `/dashboard/usuarios` | `admin` |
| `/dashboard/configuracion` | `admin` |

Las subrutas heredan la regla de la sección padre. Por ejemplo, `/dashboard/pedidos/123` usa la regla de `/dashboard/pedidos`.

Las rutas desconocidas bajo `/dashboard` se bloquean por defecto. Si se agrega una nueva ruta interna, debe registrarse en `src/lib/permissions/routes.ts`.

## Paginas especiales de acceso

| Ruta | Uso |
| --- | --- |
| `/login` | Acceso para autenticación. |
| `/acceso-denegado` | Usuario autenticado sin perfil interno activo. |
| `/sin-permisos` | Usuario interno activo sin permiso para una sección. |

## Capas de seguridad

El sistema usa varias capas complementarias:

1. Supabase Auth.
2. `perfiles.is_active`.
3. Helpers de permisos.
4. Navegación filtrada.
5. Proxy de rutas.
6. RLS en base de datos.

Ocultar enlaces en el sidebar es solo UX. No debe considerarse seguridad suficiente ni reemplaza la protección por rutas, las validaciones server-side o RLS.

## Relación con RLS

Los helpers de permisos y la protección de rutas no sustituyen Row Level Security.

- RLS sigue siendo la última línea de defensa.
- Las consultas deben respetar permisos.
- Las acciones server-side deben validar permisos antes de modificar datos.
- No se debe confiar solo en el frontend.

Para comentarios e historial de pedidos, las tablas oficiales normalizadas son `pedido_comentarios` y `pedido_historial`. Sus reglas siguen el acceso del pedido: `admin` y `supervisor` sobre cualquier pedido, y `trabajador` solo sobre pedidos asignados. Los comentarios de pedido están implementados en el detalle de pedido, son append-only inicialmente y toman el autor desde el usuario autenticado en servidor. El historial de pedido está visible en el detalle de pedido, se lista mediante la RPC segura `public.listar_pedido_historial` y se escribe mediante flujos controlados. Los cambios de estado los registra `actualizar_estado_pedido`; creación de pedido, asignación/remoción de personal y subida de archivos propios de pedido se registran automáticamente mediante triggers de base de datos.

Para solicitudes, las tablas oficiales son `solicitud_comentarios` y `solicitud_historial`. Ambas quedan reservadas a `admin` y `supervisor`; `trabajador` y usuarios anónimos no acceden. Los comentarios de solicitudes están implementados en el detalle de solicitud, son append-only inicialmente y toman el autor desde el usuario autenticado en servidor mediante `solicitud_comentarios.author_id`. El historial de solicitudes está visible en el detalle de solicitud, es append-only y registra automáticamente eventos de creación, archivos adjuntados, cambios de estado, asociación de cliente, creación de cliente desde solicitud y conversión a pedido. Ningún rol de aplicación tiene inserción directa sobre `solicitud_historial`; la escritura queda limitada a triggers y RPCs controladas.

La consulta pública por código de seguimiento no abre lectura anónima directa
sobre `solicitudes` ni `pedidos`. Se expone únicamente mediante la RPC
controlada `public.consultar_estado_publico(text)`, con ejecución para `anon` y
`authenticated`, y devuelve solo datos públicos mínimos asociados a
`public_reference`: tipo de registro, flujo, estado público, fechas no
sensibles, número interno de pedido cuando aplica y progreso agregado sin
nombres de tareas. No expone cliente, contacto, archivos, comentarios,
historial, usuarios internos ni UUIDs.

Los usuarios internos autorizados pueden ver y copiar `public_reference` desde
el detalle de solicitud o pedido para compartirlo con el cliente. Eso no cambia
la matriz de permisos ni abre lecturas anónimas directas: el acceso público se
mantiene limitado a la RPC de consulta por código.

## Gestión de Usuarios Internos

La Fase 12 mantiene la matriz actual: solo `admin` tiene `usuarios.view`, `usuarios.manage` y acceso a `/dashboard/usuarios`.

La estrategia vigente gestiona únicamente `public.perfiles`. La creación de
usuarios en Supabase Auth queda fuera de la app y se realiza manualmente desde
Supabase Studio o CLI. Esta decisión evita introducir service role key y
conserva RLS como defensa final.

Las acciones del módulo de usuarios validan permisos server-side:

- `usuarios.view` para listar o ver detalles de perfiles.
- `usuarios.manage` para editar perfil operativo, cambiar rol o activar/desactivar usuarios.

`supervisor` y `trabajador` no deben gestionar usuarios. El acceso parcial de `trabajador` a perfiles asignados por pedido existe solo para mostrar información operativa mínima en pedidos, no para listar ni administrar personal.

La subfase 12.2 implementa el listado read-only de usuarios internos en `/dashboard/usuarios`. La carga se hace server-side desde `public.perfiles`, valida `usuarios.view`, respeta RLS, no consulta `auth.users`, no muestra email y no implementa creación ni edición.

La subfase 12.3 implementa el detalle read-only en `/dashboard/usuarios/[id]` con las mismas reglas: solo `admin`, validación server-side de `usuarios.view`, consulta limitada a `public.perfiles`, sin email, sin `auth.users`, sin service role y sin acciones de modificación.

La subfase 12.4 implementa edición controlada en `/dashboard/usuarios/[id]/editar`. Solo `admin` puede editar mediante validación server-side de `usuarios.manage`. La edición se limita a `full_name`, `phone`, `avatar_url`, `role` e `is_active`, no consulta `auth.users`, no muestra email, no cambia contraseñas, no elimina usuarios y no usa service role key. El servicio impide desactivar el propio admin, quitarse el rol admin y dejar el sistema sin al menos un admin activo.

La subfase 12.5 implementa creación de perfil interno en `/dashboard/usuarios/nuevo` para usuarios Auth ya existentes. Solo `admin` puede crear perfiles mediante validación server-side de `usuarios.manage`. La app no crea credenciales, no consulta `auth.users`, no pide email ni contraseña, no envía invitaciones y no usa service role key. El UUID se valida por formato y la base confirma su existencia mediante la clave foránea de `public.perfiles.id`.

## Uso en módulos

- Las páginas server-side deben leer el perfil actual.
- Las acciones server-side deben validar permisos.
- Las consultas deben apoyarse en RLS.
- Los componentes cliente no deben decidir permisos críticos por sí solos.

## Relación con el dashboard operativo

El diseño del dashboard operativo se documenta en `docs/DASHBOARD_OPERATIVE_MODEL.md`. Ese modelo no cambia la matriz de permisos vigente: `admin` y `supervisor` pueden ver métricas globales de operación, mientras que `trabajador` solo puede recibir métricas y listas derivadas de pedidos asignados.

Las consultas del dashboard se ejecutan server-side, usan el cliente normal de
Supabase, respetan RLS, no consultan `auth.users` y no usan service role key.

## Qué no está incluido todavía

- Permisos granulares por pedido específico en UI.
- Gestión avanzada de usuarios.
- Permisos granulares configurables por pedido desde interfaz administrativa.
- Auditoría avanzada.
- Permisos configurables desde base de datos.
- Creación de credenciales Auth desde la app.
- Invitaciones, cambio de contraseña y eliminación física de usuarios.

## Evolución futura

La matriz ya se aplica en pedidos, asignaciones, comentarios, historial,
dashboard y gestión de perfiles internos. Podrá refinarse si la operación real
lo exige, mediante una decisión separada y manteniendo RLS como defensa final.

## Cierre

La Fase 4 quedó como base de permisos. Las fases posteriores mantienen la misma matriz: `trabajador` puede trabajar sobre pedidos asignados, pero no gestiona usuarios, clientes ni solicitudes generales.
