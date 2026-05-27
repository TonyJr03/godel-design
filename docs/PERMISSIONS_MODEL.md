# Modelo de Roles y Permisos — Godel Diseño

## Propósito

Este documento define la matriz inicial de roles y permisos internos del sistema web de gestión operativa de Godel Diseño. Su objetivo es dejar una referencia clara para mantenimiento, futuras fases y revisiones de seguridad.

## Conceptos base

| Concepto | Descripción |
| --- | --- |
| Autenticación | Confirma la identidad del usuario mediante Supabase Auth. |
| Perfil interno activo | Confirma que el usuario autenticado tiene una fila en `public.profiles` con `is_active = true`. |
| Autorización por rol | Decide qué puede ver o ejecutar un usuario interno según `profiles.role`. |
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
- Puede cambiar estado de pedidos asignados cuando los módulos reales lo implementen.
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
2. `profiles.is_active`.
3. Helpers de permisos.
4. Navegación filtrada.
5. Proxy de rutas.
6. RLS en base de datos.

Ocultar enlaces en el sidebar es solo UX. No debe considerarse seguridad suficiente ni reemplaza la protección por rutas, las validaciones server-side o RLS.

## Relación con RLS

Los helpers de permisos y la protección de rutas no sustituyen Row Level Security.

- RLS sigue siendo la última línea de defensa.
- Las consultas futuras deben respetar permisos.
- Las acciones server-side deben validar permisos antes de modificar datos.
- No se debe confiar solo en el frontend.

## Uso esperado en futuros módulos

Cuando se implementen módulos reales:

- Las páginas server-side deben leer el perfil actual.
- Las acciones server-side deben validar permisos.
- Las consultas deben apoyarse en RLS.
- Los componentes cliente no deben decidir permisos críticos por sí solos.

## Qué no está incluido todavía

- Gestión real de usuarios.
- Permisos granulares por pedido específico en UI.
- Gestión avanzada de usuarios.
- Permisos granulares configurables por pedido desde interfaz administrativa.
- Auditoría avanzada.
- Permisos configurables desde base de datos.
- Panel para editar roles.

## Pendiente para fases posteriores

- Fase 8 y Fase 9 aplicaron estos permisos en pedidos y asignación de personal interno.
- La Fase 11 diseña comentarios internos e historial operativo en `docs/COMMENTS_AND_HISTORY_MODEL.md`, sin cambiar todavía la matriz de permisos de código.
- Fase 12 implementará gestión de usuarios internos.
- Fases futuras podrán refinar permisos si la operación real lo exige.

## Cierre

La Fase 4 quedó como base de permisos. Las fases posteriores mantienen la misma matriz: `trabajador` puede trabajar sobre pedidos asignados, pero no gestiona usuarios, clientes ni solicitudes generales.
