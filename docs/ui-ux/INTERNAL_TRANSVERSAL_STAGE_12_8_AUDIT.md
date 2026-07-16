# Auditoría 12.8.1 - Pantallas internas transversales

Fecha: 2026-07-16

## Objetivo

Auditar pantallas internas transversales antes de implementar la etapa 12.8.2, sin modificar componentes, rutas, permisos, Server Actions, consultas, RLS, Storage ni modelo de datos.

El foco de esta auditoría es identificar dónde conviene reutilizar primitivas ya existentes para estados vacíos, errores, permisos y navegación de retorno en pantallas internas.

## Alcance Revisado

Pantallas y familias internas revisadas:

| Área | Rutas/piezas revisadas | Observación principal |
| --- | --- | --- |
| Dashboard | `/dashboard` | Usa paneles operativos con `Alert` y `EmptyState`; no requiere una primitiva nueva. |
| Clientes | `/dashboard/clientes`, `/dashboard/clientes/[id]`, `/dashboard/clientes/nuevo`, `/dashboard/clientes/[id]/editar` | Listado consistente; detalle/fallbacks mezclan headers propios y enlaces manuales de retorno. |
| Pedidos | `/dashboard/pedidos`, `/dashboard/pedidos/[id]`, `/dashboard/pedidos/nuevo` | Listado consistente; workspace usa alertas parciales; permiso de creación manual usa bloque manual en vez de `EmptyState`. |
| Solicitudes | `/dashboard/solicitudes`, `/dashboard/solicitudes/[id]` | Listado consistente; workspace usa alertas parciales y mensajes específicos por panel. |
| Configuración | `/dashboard/configuracion` | Hub simple con `PageHeader`; no hay estados vacíos relevantes. |
| Usuarios | `/dashboard/configuracion/usuarios`, `/dashboard/configuracion/usuarios/nuevo`, `/dashboard/configuracion/usuarios/[id]/editar` | Listado usa `EmptyState`, pero el copy de búsqueda no sigue exactamente el patrón del resto. No existe ruta page para `/dashboard/configuracion/usuarios/[id]`. |
| Plantillas | `/dashboard/configuracion/plantillas`, `/dashboard/configuracion/plantillas/nueva`, `/dashboard/configuracion/plantillas/[templateId]`, `/dashboard/configuracion/plantillas/[templateId]/editar` | Listado y detalle están bien encaminados; detalle tiene header propio por necesidad contextual. |
| Descargas internas | route handlers bajo pedidos/solicitudes | No tienen UI directa; quedan fuera de cambios visuales de 12.8.2. |

## Primitivas Existentes

| Primitiva | Uso actual | Decisión para 12.8.2 |
| --- | --- | --- |
| `EmptyState` | Estados vacíos de listados, búsqueda, permisos y errores. Variantes: `default`, `search`, `permission`, `error`. | Mantener como primitiva principal para vacíos, búsquedas sin resultados, permisos bloqueantes y errores bloqueantes simples. No crear otra primitiva equivalente. |
| `Alert` | Errores parciales, advertencias de carga, estados informativos de formularios y paneles. | Mantener para errores no bloqueantes o contextuales dentro de una página/panel. |
| `Button` | Acciones primarias/secundarias/ghost/danger/link. | Reutilizar en acciones de `EmptyState` y enlaces de retorno cuando se compongan como botón. |
| `PageHeader` | Título y descripción de páginas simples/fallback. | Mantener simple. No extenderlo de forma amplia salvo que 12.8.2 requiera normalizar retornos en varios fallbacks. |
| `ListingPageHeader` | Cabeceras de listados con acción y toolbar responsive. | Mantener para listados; no reemplazarlo con `PageHeader`. |
| Headers propios de workspace/detalle | `PedidoWorkspaceHeader`, `SolicitudWorkspaceHeader`, `TaskTemplateDetailHeader`, `InternalClienteDetail`. | Aceptables cuando necesitan estado, acciones o layout específico. En 12.8.2 conviene ajustar solo inconsistencias puntuales. |

## Listados y Estados Vacíos

Los listados principales ya comparten el patrón correcto:

| Componente | Estado vacío | Estado búsqueda/filtros | Observación |
| --- | --- | --- | --- |
| `InternalClientesList` | "No hay clientes registrados todavía." | "No encontramos clientes con esta búsqueda." | Correcto. |
| `InternalPedidosList` | "No hay pedidos registrados todavía." | "No encontramos pedidos con estos filtros." | Correcto. |
| `InternalSolicitudesList` | "No hay solicitudes registradas todavía." | "No encontramos solicitudes con estos filtros." | Correcto. |
| `InternalTaskTemplatesList` | "No hay plantillas de tareas todavía." | "No encontramos plantillas con esta búsqueda." | Correcto. |
| `InternalUsersList` | "No hay usuarios para mostrar" | "Sin resultados para estos filtros" | Funcional, pero el copy no sigue el patrón "No encontramos..." del resto. |
| `TaskTemplateTasksList` | "Esta plantilla todavía no tiene tareas" | No aplica | Correcto para detalle de plantilla. |
| Paneles dashboard | `EmptyState` en solicitudes, pedidos listos, actividad y paneles operativos | No aplica | Correcto para paneles operativos compactos. |

Inconsistencias detectadas:

- Usuarios usa títulos de vacío sin punto final y con un tono distinto al resto de listados.
- Detalles/workspaces mantienen vacíos manuales en archivos, notas, tareas o asignaciones. Esto es aceptable si son micro-estados dentro de paneles, pero 12.8.2 debe evitar convertir todos esos textos en `EmptyState` si eso aumenta ruido visual.
- En archivos de pedidos/solicitudes se repiten mensajes manuales como "No hay archivos asociados..."; se pueden conservar por ser estados locales de panel.

## Errores, Permisos y Not Found

Patrones encontrados:

- Los listados usan `Alert` para errores de carga de página.
- Dashboard y paneles operativos usan `Alert` con títulos específicos para cargas parciales fallidas.
- Detalles de clientes, pedidos, solicitudes, usuarios y plantillas usan `notFound()` cuando el recurso no existe o el identificador no es válido.
- `src/app/not-found.tsx` es una pantalla pública con `PublicHeader`, enlaces a inicio, solicitud y login. Por tanto, los `notFound()` disparados desde el área interna terminan en una experiencia no específica del dashboard.
- `/dashboard/pedidos/nuevo` renderiza "No tienes permiso para crear pedidos." con un `section` manual de peligro, aunque existe `EmptyState` variante `permission`.

Decisiones propuestas:

- Usar `EmptyState variant="permission"` para permisos bloqueantes de páginas internas.
- Usar `EmptyState variant="error"` para errores bloqueantes sin recuperación contextual clara.
- Mantener `Alert variant="danger"` o `warning` para errores parciales dentro de paneles, formularios o listas.
- Evaluar en 12.8.2 una pantalla `not-found` específica bajo el segmento interno/dashboard, con acción primaria de retorno a `/dashboard` o al listado padre cuando sea viable.
- No exponer mensajes técnicos ni cambiar contratos de datos. La auditoría no encontró necesidad de tocar permisos o consultas.

## Navegación de Retorno

Patrones encontrados:

- Listados principales usan `ListingPageHeader` con acciones, sin retorno.
- Workspaces de pedidos y solicitudes tienen headers propios con enlace "Volver a ...".
- Detalle de plantilla tiene header propio con enlace responsive "Volver a plantillas".
- Detalle de cliente tiene enlaces propios "Volver a clientes".
- Fallbacks de clientes, pedidos y plantillas componen un `PageHeader` junto a un `Link` manual.
- Formularios de usuarios usan props `backLabel`/`backHref` dentro de `UserCreateForm` y `UserEditForm`.

Inconsistencias detectadas:

- El retorno en fallbacks no vive en un único patrón: a veces es un `Link` junto a `PageHeader`, a veces lo maneja el formulario y a veces el header propio.
- La ruta solicitada en el brief `/dashboard/configuracion/usuarios/[id]` no existe como `page.tsx`; el flujo actual tiene listado, nuevo y editar.

Decisión propuesta:

- No crear breadcrumbs globales en 12.8.2.
- Mantener headers propios donde hay acciones contextuales reales.
- Para fallbacks simples, normalizar el retorno con una composición pequeña y local usando `Button`/`Link`, o extender `PageHeader` solo si el mismo patrón aparece en varias páginas y evita duplicación concreta.

## Recomendaciones Para 12.8.2

1. Homologar `InternalUsersList` al tono de los demás listados:
   - Búsqueda: "No encontramos usuarios con estos filtros."
   - Vacío: "No hay usuarios registrados todavía."
2. Cambiar permisos bloqueantes internos a `EmptyState variant="permission"` empezando por `/dashboard/pedidos/nuevo`.
3. Mantener `Alert` para errores parciales de dashboard, workspaces, formularios y paneles.
4. No convertir micro-estados de panel en tarjetas grandes si el panel ya tiene estructura propia.
5. Revisar si conviene una experiencia `not-found` interna para dashboard; si se implementa, debe ser una pantalla secundaria acotada, sin tocar rutas públicas.
6. Normalizar retornos de fallbacks solo donde haya duplicación evidente: clientes nuevo/editar, pedidos nuevo, plantillas nueva/editar.
7. No tocar permisos, RLS, Server Actions, consultas, Storage, modelo de datos ni rutas públicas.

## Decisiones Cerradas

- `EmptyState`, `Alert`, `Button`, `PageHeader` y `ListingPageHeader` son suficientes como base para 12.8.2.
- No hace falta una nueva primitiva general de "internal state" antes de implementar.
- `PageHeader` debe seguir siendo simple por ahora.
- La etapa 12.8.2 debe ser una normalización visual acotada, no una reestructuración de información.

## Validación De Alcance

Esta auditoría es documental. No requiere E2E ni Full Visual QA.

Archivos permitidos para esta subtarea:

- `docs/ui-ux/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md`
- `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md`

No se requiere modificar `docs/ui-ux/INTERNAL_FORMS_STAGE_12_PLAN.md` para completar la auditoría.
