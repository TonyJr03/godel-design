# Etapa 14 — Estados transversales y resiliencia UI

## 1. Objetivo

La Etapa 14 inicia la consolidación de estados transversales y resiliencia UI de
Godel Diseño después del cierre de la Etapa 13.

Esta subtarea audita cómo la aplicación maneja cargas, errores, ausencia de
datos, permisos, recursos inexistentes, estados pendientes, confirmaciones,
éxitos y fallos parciales. El objetivo es ordenar el estado real antes de
proponer implementaciones, sin modificar código de aplicación.

Esta auditoría no cambia Server Actions, RLS, Storage, permisos, DTO público,
queries, componentes, estilos ni lógica de dominio.

## 2. Alcance auditado

Documento de decisión derivado de esta auditoría:

```text
docs/ui-ux/TRANSVERSAL_STATES_DECISION_MATRIX.md
```

### Rutas revisadas

- Área pública: `/`, `/solicitud`, `/estado` y 404 pública.
- Login: `/login`.
- Dashboard: `/dashboard`.
- Clientes: `/dashboard/clientes`, `/dashboard/clientes/[id]`.
- Solicitudes: `/dashboard/solicitudes`, `/dashboard/solicitudes/[id]`.
- Pedidos: `/dashboard/pedidos`, `/dashboard/pedidos/[id]`.
- Configuración: `/dashboard/configuracion`.
- Usuarios: `/dashboard/configuracion/usuarios`.
- Plantillas: `/dashboard/configuracion/plantillas`,
  `/dashboard/configuracion/plantillas/[templateId]`.
- Acceso y permisos: `/acceso-denegado`, `/sin-permisos`.
- Recursos internos inexistentes: catch-all interno y `not-found.tsx` de
  dashboard.

### Archivos y patrones inventariados

- `src/app/not-found.tsx`.
- `src/app/(interno)/dashboard/not-found.tsx`.
- Ausencia de `loading.tsx`, `error.tsx` y `global-error.tsx` segmentados.
- Páginas de acceso denegado y sin permisos.
- `EmptyState`, `Alert` y `PlaceholderCard`.
- Estados vacíos en listados, dashboard, workspaces, archivos, comentarios,
  historial y tareas.
- Pending states con `useActionState`, `useTransition`, `aria-busy` y botones
  deshabilitados.
- Confirmaciones con `window.confirm` para cambios sin guardar en dialog/drawer.
- Errores de Server Actions en login, solicitud pública, formularios internos y
  acciones operativas.
- Fallos parciales en dashboard, workspaces de pedidos/solicitudes, plantillas y
  subida de archivos pública.

## 3. Inventario de estados existentes

| Estado | Ubicación principal | Tratamiento actual | Observaciones |
| --- | --- | --- | --- |
| 404 pública | `src/app/not-found.tsx` | Página pública con header/footer, mensaje seguro y acciones a `/`, `/solicitud`, `/estado`. | Bien separada del login interno. No usa `EmptyState`. |
| 404 interna | `src/app/(interno)/dashboard/not-found.tsx` | `EmptyState` variant `error`, acciones a dashboard y pedidos. | Cubre recursos internos inexistentes o enlaces incompletos. |
| Catch-all interno | `src/app/(interno)/dashboard/[...notFound]/page.tsx` | Llama `notFound()`. | Correcto para rutas internas no definidas. |
| Acceso denegado | `src/app/(interno)/acceso-denegado/page.tsx` | Card centrada, `Alert` warning, logout y regreso al inicio. | Diferencia perfil inactivo/sesión sin acceso interno. |
| Sin permisos | `src/app/(interno)/sin-permisos/page.tsx` | Card centrada, `Alert` warning, regreso a dashboard, inicio y logout. | Diferencia permiso insuficiente de acceso denegado. |
| Alert transversal | `src/components/ui/Alert.tsx` | Variantes `info`, `success`, `warning`, `danger`; `danger` usa `role=alert`, `success` usa `role=status`. | Base consistente, pero no incluye acción de retry ni severidad temporal. |
| EmptyState transversal | `src/components/ui/EmptyState.tsx` | Variantes `default`, `search`, `permission`, `error`. | Buena base para listados y not-found interno; uso todavía desigual en dashboard/workspaces. |
| PlaceholderCard | `src/components/ui/PlaceholderCard.tsx` | Wrapper de `EmptyState` con eyebrow "Pendiente". | Existe como placeholder documental/temporal; revisar si queda uso real. |
| Carga inicial | App Router | No se encontraron `loading.tsx` segmentados. | La carga inicial depende del render server y de la navegación sin fallback especializado. |
| Error de render segmentado | App Router | No se encontraron `error.tsx` segmentados. | Errores no capturados por resultados controlados pueden caer en error global/default de Next. |
| Pending de formularios | Formularios con `useActionState` | `aria-busy`, botón deshabilitado y texto como "Guardando...", "Creando...", "Enviando...". | Bastante extendido y consistente, aunque sin patrón único documentado de copy. |
| Pending de búsqueda/filtros | `ListingToolbar`, `ListFiltersBar` | `useTransition`, `aria-busy`; `ListFiltersBar` muestra "Buscando...", `ListingToolbar` no muestra texto visible. | Dos patrones conviven. `ListFiltersBar` parece anterior al toolbar actual. |
| Éxito de acción | Formularios internos y públicos | `Alert success`, reset o cierre/navegación según flujo. | Correcto en general; la persistencia del mensaje cambia por componente. |
| Error de acción | Server Actions y formularios | `Alert danger` y errores por campo cuando existen. | Mensajes seguros, pero muchos genéricos "Intentarlo nuevamente" sin acción de retry contextual. |
| Error de datos en listados | Páginas de Pedidos, Solicitudes, Clientes, Usuarios, Plantillas | `Alert danger` reemplaza listado. | Seguro, pero sin retry local; toda la superficie de resultados queda bloqueada. |
| Filtros inválidos | Listados | `Alert warning`; filtro inválido ignorado. | Buen caso de degradación segura. |
| Sin resultados en listados | `InternalPedidosList`, `InternalSolicitudesList`, `InternalClientesList`, `InternalUsersList`, `InternalTaskTemplatesList` | `EmptyState` con copy diferenciado para filtros vs ausencia real. | Patrón fuerte y reutilizable. |
| Dashboard con error parcial | `DashboardPedidoBoard`, `DashboardOverview`, paneles laterales | `Alert warning/danger` por panel o sección; algunos paneles devuelven `null`. | Resiliencia parcial existe, pero no es uniforme. |
| Dashboard vacío | Board, atención, actividad, solicitudes, pedidos listos | Mensajes inline o `EmptyState`. | Copy correcto, pero mezcla inline simple con `EmptyState`. |
| Pedido detalle no encontrado | `dashboard/pedidos/[id]/page.tsx` | `notFound()` para `invalid_id` y `not_found`; otros errores muestran `Alert danger`. | Correcto. |
| Solicitud detalle no encontrada | `dashboard/solicitudes/[id]/page.tsx` | `notFound()` para `invalid_id` y `not_found`; otros errores muestran `Alert danger`. | Correcto. |
| Cliente detalle no encontrado | `dashboard/clientes/[id]/page.tsx` | `notFound()` para `invalid_id` y `not_found`; otros errores muestran `Alert danger` con header. | Correcto. |
| Plantilla detalle no encontrada | `configuracion/plantillas/[templateId]/page.tsx` | `notFound()` para `invalid_id` y `not_found`; otros errores muestran `Alert danger`. | Correcto, aunque sin header si falla la plantilla. |
| Fallos parciales en Pedido | `InternalPedidoDetail` y workspace de pedido | Tareas, archivos, comentarios e historial aceptan `loadError`; action rail marca `danger`; datos disponibles permanecen. | Buen modelo de degradación segura. |
| Fallos parciales en Solicitud | `InternalSolicitudDetail` y workspace de solicitud | Archivos, comentarios, historial y cliente aceptan `loadError`; action rail marca `danger`. | Buen modelo, con diferencia en tratamiento del cliente asociado. |
| Fallos parciales en Plantillas | `TaskTemplateTasksSection` | Si fallan tareas, muestra `Alert danger` y conserva detalle de plantilla/aside. | Correcto; no marca estado de acción global. |
| Subida pública parcial | `submitPublicSolicitudAction` y `PublicSolicitudForm` | Solicitud queda exitosa con warning de archivos fallidos y código público. | Buen caso de degradación segura pública. |
| Descarga privada fallida | route handlers de archivos | Respuesta 403/500 con mensaje seguro genérico. | Correcto para seguridad; UI de enlace no anticipa fallo ni retry. |
| Confirmación de cierre | `InternalFormDialog`, `InternalFormDrawer` | `window.confirm` si hay cambios sin guardar. | Existe solo para cierre con cambios. Eliminaciones inline no tienen confirmación contextual uniforme. |

## 4. Mapa de rutas afectadas

| Ruta | Estados presentes | Brechas detectadas |
| --- | --- | --- |
| `/` | Estado normal público, CTA a solicitud/estado. | No tiene loading/error segmentado; bajo riesgo por ruta estática. |
| `/solicitud` | Pending de envío, errores por campo, éxito con código, warning por archivos parciales. | Buen tratamiento; falta decidir si el warning parcial debe ser patrón transversal. |
| `/estado` | Estado inicial, invalid reference, not found, error temporal, resultado exitoso. | No hay retry visible más allá de reintentar búsqueda/recargar. |
| `/login` | Pending de acceso, errores seguros por credenciales, perfil inactivo y error temporal. | Buen tratamiento; no hay diferenciación visual de error temporal vs credenciales salvo copy. |
| `/dashboard` | Fallos parciales en resumen, tablero, actividad y paneles; estados vacíos por rol. | Algunos paneles devuelven `null` ante error de summary; mezcla `Alert`, `EmptyState` e inline. |
| `/dashboard/clientes` | Error de listado, sin clientes, sin resultados de búsqueda, pending de filtros. | Sin retry; error bloquea todo el listado. |
| `/dashboard/clientes/[id]` | Not found, error de datos, detalle con estados vacíos internos. | Error no not-found muestra header + alert; correcto. |
| `/dashboard/solicitudes` | Error de listado, filtros inválidos, sin solicitudes, sin resultados. | Sin retry; copy de filtros consistente. |
| `/dashboard/solicitudes/[id]` | Not found, error de datos, fallos parciales en cliente/archivos/comentarios/historial, pending de acciones. | Buen modelo parcial; revisar uniformidad de severity y acción de recuperación. |
| `/dashboard/pedidos` | Error de listado, filtros inválidos, error parcial de clientes en dialog de creación, vacíos. | La carga de clientes para crear pedido degrada dentro del dialog; listado sin retry. |
| `/dashboard/pedidos/[id]` | Not found, error de datos, fallos parciales en tareas/archivos/comentarios/historial/personal/plantillas, pending de acciones. | Buen modelo parcial; la copia de algunos fallos se repite localmente. |
| `/dashboard/configuracion` | Hub normal. | No hay estado vacío/error propio; depende de navegación. |
| `/dashboard/configuracion/usuarios` | Info alert, filtros inválidos, error de listado, vacíos, pending de create/edit. | Info fija compite con errores si aparecen; sin retry. |
| `/dashboard/configuracion/plantillas` | Error de listado, vacíos, pending de create/edit. | Sin retry; copy coherente con otros listados. |
| `/dashboard/configuracion/plantillas/[templateId]` | Not found, error de plantilla, error parcial de tareas, vacío de tareas, pending de tareas. | Degradación parcial correcta; error de plantilla no tiene marco/header. |
| `/acceso-denegado` | Acceso interno denegado con acciones. | Bien diferenciado de sin permisos; no forma parte de shell interno. |
| `/sin-permisos` | Permiso insuficiente con acciones. | Bien diferenciado; revisar si debe usar `EmptyState permission` para alinear lenguaje visual. |

## 5. Clasificación de estados

| Tipo | Estado actual | Rutas/componentes |
| --- | --- | --- |
| Carga inicial | Sin `loading.tsx` segmentado. | Toda la app. |
| Carga parcial | Resultados paralelos con `loadError` y datos seguros por defecto. | Dashboard, Pedido detalle, Solicitud detalle, Plantilla detalle. |
| Formulario pendiente | `useActionState`, `aria-busy`, botón deshabilitado y texto dinámico. | Login, solicitud pública, clientes, usuarios, pedidos, solicitudes, plantillas, archivos, comentarios, pagos, tareas. |
| Error de acción | `Alert danger`, field errors, mensajes seguros. | Formularios públicos e internos. |
| Error de datos | `Alert danger` o `Alert warning` por panel. | Listados, dashboard, detalles, paneles. |
| Sin resultados | `EmptyState` diferenciado por filtros o ausencia real. | Listados principales y administrativos. |
| Sin permisos | Página `/sin-permisos`; errores `unauthorized`/`forbidden` en servicios. | Rutas protegidas y servicios de dominio. |
| Acceso denegado | Página `/acceso-denegado`. | Proxy/perfil interno activo. |
| Recurso inexistente | `notFound()` y `not-found.tsx` público/interno. | Detalles y catch-all interno. |
| Confirmación | `window.confirm` para cerrar dialog/drawer con cambios. | Formularios contextuales. |
| Éxito | `Alert success`, código copiable, cierre/refresco/navegación. | Solicitud pública, formularios internos, acciones operativas. |
| Error temporal | Copy de "Inténtalo nuevamente" y error temporal en login/tracking. | Login, tracking, servicios. |
| Degradación segura | Mantener la página con paneles fallidos o uploads parciales. | Dashboard, workspaces, plantillas, solicitud pública. |

## 6. Problemas detectados

1. No existen `loading.tsx` ni `error.tsx` segmentados. La app usa resultados
   controlados para muchos errores, pero no tiene estrategia visual para cargas
   iniciales ni errores de render no capturados por segmento.
2. No hay patrón transversal de retry. Muchos mensajes dicen "Inténtalo
   nuevamente", pero la UI normalmente no ofrece una acción local de
   reintento, solo recargar página o reenviar formulario.
3. La resiliencia parcial existe, especialmente en workspaces, pero no está
   documentada como contrato reutilizable. Cada dominio decide copy, severity y
   ubicación del `Alert`.
4. Dashboard mezcla estados vacíos inline, `EmptyState`, `Alert warning`,
   `Alert danger` y `null` ante error. Esto puede ocultar fallos parciales en
   paneles secundarios.
5. Listados internos tienen buen empty state, pero los errores de listado
   bloquean toda la zona de resultados y no preservan datos anteriores ni
   ofrecen retry.
6. `ListingToolbar` y `ListFiltersBar` coexisten con pending diferente:
   `ListFiltersBar` muestra "Buscando..." y `ListingToolbar` solo usa
   `aria-busy`.
7. Los estados de permisos están bien separados en páginas, pero visualmente no
   reutilizan `EmptyState permission`; la consistencia entre página completa y
   estado embebido queda pendiente.
8. Confirmaciones existen para cambios sin guardar, pero no hay criterio único
   para acciones destructivas inline como eliminar tareas.
9. Algunos errores parciales usan textos genéricos repetidos en la página y en
   el panel, sin una convención sobre qué debe aparecer en el action rail, en el
   preview y en el panel.
10. No hay decisión documentada sobre skeletons. Actualmente no se detectaron
    skeletons reales; conviene evitar agregarlos por inercia y usarlos solo si
    una carga segmentada los justifica.
11. Los errores temporales de red/autenticación se diferencian por copy, pero no
    por una semántica visual transversal distinta de otros errores.
12. La 404 pública y la 404 interna están bien separadas, pero no hay matriz
    documentada para decidir cuándo usar 404, sin permisos, acceso denegado o
    error de datos.

## 7. Riesgos

- Introducir skeletons globales innecesarios que agreguen ruido sin mejorar la
  percepción de velocidad.
- Crear un componente global demasiado genérico para todos los estados y perder
  contexto de dominio.
- Cambiar Server Actions, permisos, RLS, Storage o DTO público al intentar
  mejorar mensajes.
- Ocultar fallos parciales para que la pantalla "se vea limpia".
- Reemplazar mensajes accionables por copies demasiado genéricos.
- Duplicar lógica de permisos en UI al especializar estados.
- Hacer que retry reenvíe mutaciones no idempotentes sin confirmación.
- Convertir páginas server-first en Client Components para manejar estados que
  pueden resolverse con App Router o composición server-side.

## 8. Decisiones propuestas

1. Mantener la Etapa 14 como trabajo de UI/resiliencia, sin modificar dominio,
   RLS, Storage, permisos ni DTO público.
2. Documentar una matriz de decisión para `loading`, `error`, `not-found`,
   `sin-permisos`, `acceso-denegado`, empty states y fallos parciales antes de
   implementar componentes nuevos.
3. No crear skeletons globales por defecto. Si se agregan, deben corresponder a
   rutas o paneles donde la carga inicial tenga espera visible y estructura
   estable.
4. Priorizar `loading.tsx` y `error.tsx` por segmento solo donde aporten valor:
   dashboard, listados internos, detalles de workspaces y rutas públicas
   dinámicas.
5. Mantener `EmptyState` como base de ausencia de datos y recursos internos,
   pero revisar si necesita acciones y variantes suficientes antes de ampliar.
6. Mantener `Alert` como base para mensajes transitorios, action errors y
   fallos parciales, pero definir una convención de retry/acción secundaria.
7. Para fallos parciales, conservar datos disponibles y marcar el panel
   afectado sin romper toda la página.
8. Diferenciar error temporal, error de permisos, ausencia de datos y recurso
   inexistente por copy, acción y ubicación, no solo por color.
9. Normalizar pending copy y `aria-busy` por familias de acciones: crear,
   guardar, actualizar, enviar, subir, convertir, eliminar.
10. Introducir confirmaciones destructivas solo con criterio explícito y sin
    depender de `window.confirm` si la acción necesita contexto o accesibilidad
    superior.

## 9. Plan de subtareas 14.2-14.x

| Subtarea | Nombre | Objetivo | Estado |
| --- | --- | --- | --- |
| 14.1 | Auditoría de estados transversales | Inventariar estados, rutas, inconsistencias y plan de trabajo. | Completado |
| 14.2 | Matriz de estados y decisiones UI | Definir cuándo usar loading, error, empty, not-found, permisos, acceso denegado, retry y degradación segura. | Completado |
| 14.3 | App Router states por segmento | Agregar o ajustar `loading.tsx`, `error.tsx` y `not-found.tsx` solo en segmentos justificados. | Completado |
| 14.4 | Estados vacíos y sin resultados | Normalizar empty states de listados, dashboard y paneles sin crear abstracción excesiva. | Completado |
| 14.5 | Errores de datos y retry seguro | Definir patrón de retry para lecturas y errores temporales sin reintentar mutaciones peligrosas. | Completado |
| 14.6 | Pending y action feedback | Normalizar pending copy, `aria-busy`, disabled states, éxitos y errores de formularios. | Completado |
| 14.7 | Fallos parciales en dashboard y workspaces | Consolidar degradación segura para paneles secundarios, previews y action rail. | Propuesta |
| 14.8 | Permisos, acceso denegado y recurso inexistente | Alinear `/sin-permisos`, `/acceso-denegado`, 404 pública e interna y estados embebidos de permiso. | Propuesta |
| 14.9 | Confirmaciones y acciones destructivas | Revisar cierre con cambios, eliminaciones inline y feedback posterior sin tocar reglas de dominio. | Propuesta |
| 14.10 | QA y cierre de Etapa 14 | Validar rutas críticas, responsive, accesibilidad, seguridad visual y documentación de cierre. | Propuesta |

### Nota de implementación 14.2

Se creó `docs/ui-ux/TRANSVERSAL_STATES_DECISION_MATRIX.md` como contrato base
para las subtareas 14.3 en adelante. La matriz define cuándo usar `loading.tsx`,
`error.tsx`, `not-found.tsx`, `EmptyState`, `Alert`, estados inline, pending,
retry, navegación de regreso, confirmación y conservación de datos parciales.

La matriz también fija reglas por zona, retry, skeleton/loading, errores,
seguridad y accesibilidad. Las subtareas futuras deben implementar sobre este
contrato sin cambiar Server Actions, RLS, Storage, permisos, DTO público ni
lógica de dominio.

### Nota de implementación 14.3

Se agregaron App Router states segmentados mínimos en:

- `src/app/(interno)/dashboard/loading.tsx`.
- `src/app/(interno)/dashboard/error.tsx`.
- `src/app/(publico)/estado/loading.tsx`.
- `src/app/(publico)/estado/error.tsx`.

Dashboard recibe `loading.tsx` y `error.tsx` porque es la entrada operativa
interna, depende de datos compuestos y ya había fallos parciales controlados por
panel, pero no un fallback de render de segmento. El estado de carga se renderiza
dentro del layout interno existente, sin duplicar sidebar, y el error ofrece
`reset()` con un mensaje seguro.

`/estado` recibe `loading.tsx` y `error.tsx` porque es una ruta pública dinámica
con consulta de seguimiento. El fallback conserva `PublicHeader
currentPage="estado"` y `PublicFooter`, mantiene acciones públicas y evita
enlaces a la puerta interna o mensajes de permisos.

No se agregaron skeletons globales ni componentes genéricos nuevos. Los estados
son ligeros, usan primitivas existentes y no simulan datos reales. Tampoco se
tocaron Server Actions, queries, DTO público, RLS, Storage, permisos, rutas
existentes ni lógica de dominio.

### Corrección 14.3.1

Los `loading.tsx` segmentados de dashboard y `/estado` se compactaron para
evitar una interrupción visual fuerte durante la navegación. Se retiraron las
cards grandes que simulaban contenido y se reemplazaron por loaders discretos
con anillo animado y el mark de marca `godel-diseno-mark.png`.

El loading interno queda centrado dentro del layout existente, sin duplicar
sidebar ni ocupar una pantalla completa. El loading público conserva
`PublicHeader currentPage="estado"` y `PublicFooter`, pero elimina el hero grande
y usa un panel breve con copy seguro. No se tocaron error boundaries, dominio,
DTO público, RLS, Storage, permisos ni Server Actions.

### Nota de implementación 14.4

Se normalizó la diferencia entre ausencia real de datos y búsqueda sin
resultados sin ampliar `EmptyState` ni crear componentes nuevos. Los listados
principales de pedidos, solicitudes, clientes, usuarios y plantillas se
conservaron porque ya usan `EmptyState` `search` únicamente cuando existen
filtros o búsqueda activos, y `default` para ausencia real.

En dashboard se corrigió la semántica de los paneles de solicitudes pendientes y
pedidos listos para entrega: ambos dejan de usar `variant="search"` porque no
representan una búsqueda filtrada. El tablero de pedidos activos también se
consolidó para que, cuando no haya pedidos en ningún grupo, muestre un único
`EmptyState` compacto con copy específico por rol en lugar de renderizar el aviso
general y las tres secciones vacías.

Los estados inline de archivos, comentarios, historial, tareas, personal y
plantillas en workspaces se mantuvieron porque son secciones secundarias con
contexto propio y mensajes compactos. Cuando existe `loadError`, el error sigue
teniendo prioridad mediante `Alert` y no se muestra simultáneamente un empty
state. No se modificaron dominio, permisos, RLS, Storage, DTO público, queries
ni Server Actions.

### Nota de implementación 14.5

Se creó `src/components/ui/ReadErrorAlert.tsx` como primitiva estrecha para
errores controlados de lectura. Es un Client Component que compone `Alert` y
`Button`, usa `useTransition` para el estado pending visible y ejecuta
`router.refresh()` como único mecanismo de retry. No recibe callbacks, no hace
fetch propio, no conoce Supabase/PostgreSQL/Storage y no reintenta mutaciones.

La clasificación queda fijada como contrato de implementación: solo se muestra
retry cuando `result.reason === "error"`. Los casos `unauthorized`, `forbidden`,
`invalid_reference`, `not_found`, filtros inválidos, validaciones, credenciales
y accesos denegados no ofrecen retry porque requieren corregir datos, navegar a
un contexto seguro o resolver permisos fuera de la UI.

El patrón se aplicó a errores de lectura del dashboard, listados internos de
pedidos, solicitudes, clientes, usuarios y plantillas, y al error temporal de
consulta pública en `/estado`. En `DashboardAttentionPanel` se eliminó el
`return null` ante error para no ocultar fallos operativos ni mostrar estados
positivos falsos. Los fallos parciales de workspaces quedan pospuestos para
14.7, donde se revisarán paneles, previews y action rail con contrato común.

No se modificaron dominio, servicios, queries, permisos, RLS, Storage, DTO
público, Server Actions, formularios, loaders ni error boundaries.

### Nota de implementación 14.6

Se normalizó el feedback de mutaciones sin crear componentes nuevos. Los
formularios principales y operativos conservan `useActionState`, `aria-busy`,
botón submit deshabilitado y contratos `FormData`, pero ahora usan pending copy
contextual por familia: crear cliente, crear pedido, crear plantilla, crear
perfil, guardar cambios, actualizar estado, actualizar pago, agregar
comentario, subir archivo, convertir en pedido, asociar cliente, asignar
personal, quitar, completar, reabrir, eliminar, guardar progreso, guardar
título, mover tarea y aplicar plantilla.

Los resultados principales de acciones ahora usan `Alert` con título contextual
de éxito o error. Comentarios, archivos y creación de tareas se alinearon con
las primitivas `Alert` y `Button` cuando ya existía un bloque manual
equivalente. Las acciones inline de tareas permanecen compactas y mantienen
pending independiente por formulario; las acciones icon-only de tareas de
plantilla comunican pending con texto accesible, `title`, botón deshabilitado y
un spinner discreto respetando `motion-reduce`.

`ListingToolbar` mantiene `useTransition`, `router.replace`, URL existente y
campo de búsqueda editable, pero anuncia `Actualizando resultados...` con
`role="status"` y deshabilita selects, limpieza y chips mientras la transición
está pendiente. `ActiveFilterChips` acepta `disabled` para evitar acciones
repetidas durante la actualización.

Se corrigió la duplicación de éxito en la conversión de solicitud: tras crear el
pedido se muestra un único bloque positivo con mensaje de la acción y enlace al
pedido. El aviso persistente de solicitud ya convertida se conserva para cargas
posteriores. No se agregó retry automático, no se añadieron confirmaciones, no
se tocaron dominio, acciones, permisos, RLS, Storage, queries ni DTOs. La
siguiente subtarea oficial pasa a ser `14.7 — Fallos parciales en dashboard y
workspaces`.

## 10. Criterios de cierre de Etapa 14

La Etapa 14 se considera cerrada cuando:

- Exista una matriz documentada para decidir entre carga inicial, carga parcial,
  error de acción, error de datos, sin resultados, sin permisos, acceso
  denegado, recurso inexistente, confirmación, éxito, error temporal y
  degradación segura.
- Las rutas públicas, login, dashboard, clientes, solicitudes, pedidos,
  configuración, usuarios y plantillas tengan estados comprensibles y
  consistentes.
- Los fallos parciales no rompan páginas completas cuando existan datos seguros
  para continuar.
- Los errores no filtren detalles internos de Supabase, PostgreSQL, Storage,
  UUIDs innecesarios ni metadata sensible.
- Los estados de pending tengan feedback visible o accesible y no bloqueen
  acciones sin explicación.
- Los estados vacíos diferencien ausencia real de resultados filtrados.
- Los errores temporales ofrezcan una salida clara o retry seguro cuando
  corresponda.
- Las confirmaciones existan donde previenen pérdida de datos o acciones
  destructivas, sin duplicar reglas de dominio.
- No se hayan modificado Server Actions, RLS, Storage, permisos, DTO público ni
  lógica de dominio fuera del alcance aprobado.
- La documentación y el roadmap queden sincronizados.
- La validación asignada para subtareas documentales y visuales pase según la
  política del roadmap.
