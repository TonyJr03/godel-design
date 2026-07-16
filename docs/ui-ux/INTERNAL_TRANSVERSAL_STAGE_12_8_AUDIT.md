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
| Clientes | `/dashboard/clientes`, `/dashboard/clientes/[id]`, `/dashboard/clientes/nuevo`, `/dashboard/clientes/[id]/editar` | Listado consistente; en 12.8.2 las páginas fallback de crear/editar se retiran y los dialogs quedan como flujo oficial. |
| Pedidos | `/dashboard/pedidos`, `/dashboard/pedidos/[id]`, `/dashboard/pedidos/nuevo` | Listado consistente; workspace usa alertas parciales; en 12.8.2 se retira la página fallback de creación manual. |
| Solicitudes | `/dashboard/solicitudes`, `/dashboard/solicitudes/[id]` | Listado consistente; workspace usa alertas parciales y mensajes específicos por panel. |
| Configuración | `/dashboard/configuracion` | Hub simple con `PageHeader`; no hay estados vacíos relevantes. |
| Usuarios | `/dashboard/configuracion/usuarios`, `/dashboard/configuracion/usuarios/nuevo`, `/dashboard/configuracion/usuarios/[id]/editar` | Listado usa `EmptyState`, pero el copy de búsqueda no sigue exactamente el patrón del resto. En 12.8.2 se retiran las páginas fallback de crear/editar. |
| Plantillas | `/dashboard/configuracion/plantillas`, `/dashboard/configuracion/plantillas/nueva`, `/dashboard/configuracion/plantillas/[templateId]`, `/dashboard/configuracion/plantillas/[templateId]/editar` | Listado y detalle están bien encaminados; en 12.8.2 se retiran las páginas fallback de crear/editar. |
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
- `/dashboard/pedidos/nuevo` renderizaba "No tienes permiso para crear pedidos." con un `section` manual de peligro. En 12.8.2 la página fallback fue retirada.

Decisiones propuestas:

- Usar `EmptyState variant="permission"` para permisos bloqueantes de páginas internas que sigan existiendo.
- Usar `EmptyState variant="error"` para errores bloqueantes sin recuperación contextual clara.
- Mantener `Alert variant="danger"` o `warning` para errores parciales dentro de paneles, formularios o listas.
- Implementar en 12.8.2 una pantalla `not-found` específica bajo el segmento interno/dashboard, con acción primaria de retorno a `/dashboard`.
- No exponer mensajes técnicos ni cambiar contratos de datos. La auditoría no encontró necesidad de tocar permisos o consultas.

## Navegación de Retorno

Patrones encontrados:

- Listados principales usan `ListingPageHeader` con acciones, sin retorno.
- Workspaces de pedidos y solicitudes tienen headers propios con enlace "Volver a ...".
- Detalle de plantilla tiene header propio con enlace responsive "Volver a plantillas".
- Detalle de cliente tiene enlaces propios "Volver a clientes".
- Los fallbacks de clientes, pedidos y plantillas componían un `PageHeader` junto a un `Link` manual antes de 12.8.2.
- Los formularios de usuarios usaban props `backLabel`/`backHref` dentro de `UserCreateForm` y `UserEditForm` cuando existían páginas fallback.

Inconsistencias detectadas:

- El retorno en fallbacks no vivía en un único patrón: a veces era un `Link` junto a `PageHeader`, a veces lo manejaba el formulario y a veces el header propio.
- La ruta solicitada en el brief `/dashboard/configuracion/usuarios/[id]` no existe como `page.tsx`; el flujo actual tiene listado, nuevo y editar.

Decisión propuesta:

- No crear breadcrumbs globales en 12.8.2.
- Mantener headers propios donde hay acciones contextuales reales.
- Retirar los fallbacks simples de crear/editar y conservar los dialogs contextuales como flujo oficial.

## Recomendaciones Para 12.8.2

1. Homologar `InternalUsersList` al tono de los demás listados:
   - Búsqueda: "No encontramos usuarios con estos filtros."
   - Vacío: "No hay usuarios registrados todavía."
2. Retirar las páginas fallback de crear/editar y conservar los componentes de formulario usados por dialogs.
3. Mantener `Alert` para errores parciales de dashboard, workspaces, formularios y paneles.
4. No convertir micro-estados de panel en tarjetas grandes si el panel ya tiene estructura propia.
5. Agregar una experiencia `not-found` interna para dashboard sin tocar rutas públicas.
6. Evitar normalizar retornos de fallbacks porque esas páginas quedan retiradas en 12.8.2.
7. No tocar permisos, RLS, Server Actions, consultas, Storage, modelo de datos ni rutas públicas.

## Decisiones Cerradas

- `EmptyState`, `Alert`, `Button`, `PageHeader` y `ListingPageHeader` son suficientes como base para 12.8.2.
- No hace falta una nueva primitiva general de "internal state" antes de implementar.
- `PageHeader` debe seguir siendo simple por ahora.
- La etapa 12.8.2 debe retirar fallbacks obsoletos, homologar vacíos puntuales y agregar `not-found` interno sin reestructurar información.

## Validación De Alcance

Esta auditoría es documental. No requiere E2E ni Full Visual QA.

Archivos permitidos para esta subtarea:

- `docs/ui-ux/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md`
- `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md`

No se requiere modificar `docs/ui-ux/INTERNAL_FORMS_STAGE_12_PLAN.md` para completar la auditoría.

## Implementación 12.8.2

Decisión aplicada:

Las páginas fallback de crear/editar fueron retiradas porque los dialogs contextuales pasan a ser el flujo oficial durante el desarrollo del sistema.

Rutas retiradas:

- `/dashboard/clientes/nuevo`
- `/dashboard/clientes/[id]/editar`
- `/dashboard/pedidos/nuevo`
- `/dashboard/configuracion/usuarios/nuevo`
- `/dashboard/configuracion/usuarios/[id]/editar`
- `/dashboard/configuracion/plantillas/nueva`
- `/dashboard/configuracion/plantillas/[templateId]/editar`

Correcciones aplicadas:

- Se homologó el copy de `InternalUsersList` para estados vacíos y búsquedas sin resultados.
- Se agregó `src/app/(interno)/dashboard/not-found.tsx` para recursos internos no encontrados.
- Se agregó `src/app/(interno)/dashboard/[...notFound]/page.tsx` como catch-all mínimo para que rutas internas eliminadas caigan en el not-found del dashboard en vez de la 404 pública.
- Las rutas obsoletas ahora caen en el not-found interno o en las páginas dinámicas existentes que ejecutan `notFound()`.
- No se modificaron permisos, consultas, RLS, Storage ni modelo de datos. Las Server Actions de formularios retirados fueron reubicadas en módulos estables y la creación de usuario se adaptó al flujo dialog.

Corrección 12.8.2.1:

Además de retirar las páginas fallback, se eliminaron ramas visuales y props heredadas de página completa en formularios de crear/editar. Las Server Actions se reubicaron en módulos estables del área correspondiente, sin alterar su lógica.

Corrección 12.8.2.2:

La creación de usuarios se alineó con el flujo contextual: la Server Action devuelve estado de éxito, el dialog cierra y refresca el listado, y no se redirige a `/dashboard/configuracion/usuarios/[id]/editar`. También se limpiaron revalidaciones hacia fallbacks retirados y se eliminó el escape de props desconocidas en `TaskTemplateForm`.

Corrección 12.8.2.3:

Se eliminaron los componentes legacy inline `TaskTemplatesList` y `TaskTemplatesSection` porque el flujo oficial de plantillas queda resuelto por `InternalTaskTemplatesList` y dialogs contextuales de crear/editar.
