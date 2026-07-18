# Etapa 14.2 - Matriz de estados y decisiones UI

## 1. Objetivo

Esta matriz define el contrato documental para decidir qué patrón de UI usar
ante cargas, errores, ausencia de datos, permisos, recursos inexistentes,
pending, éxitos, confirmaciones, fallos parciales y degradación segura.

El objetivo es evitar decisiones aisladas por pantalla antes de implementar las
subtareas 14.3 en adelante. Este documento no introduce componentes nuevos, no
modifica código y no cambia Server Actions, RLS, Storage, permisos, DTO público
ni lógica de dominio.

## 2. Principios de decisión

- El estado debe explicar qué ocurrió, qué puede hacer la persona y qué parte de
  la pantalla sigue siendo confiable.
- Los datos disponibles y seguros se conservan cuando falla una carga
  secundaria.
- Los errores de lectura pueden ofrecer retry cuando repetir la lectura no muta
  datos.
- Las mutaciones no se reintentan automáticamente.
- Los estados de permiso, acceso denegado y recurso inexistente no son
  intercambiables.
- Los estados vacíos deben diferenciar ausencia real de datos y resultados
  filtrados.
- Los mensajes visibles no deben filtrar errores internos de Supabase,
  PostgreSQL, Storage, rutas privadas, `file_path`, UUIDs innecesarios ni
  metadata sensible.
- En el área pública solo se muestran datos ya permitidos por el DTO público
  vigente.

## 3. Tabla principal

| Estado | Cuándo ocurre | Patrón recomendado | Acción disponible | Accesibilidad | Seguridad | Ejemplos de rutas | No hacer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Carga inicial | La ruta completa espera datos necesarios para poder pintar la primera pantalla. | `loading.tsx` por segmento solo si la espera es perceptible y la estructura visual es estable. | Ninguna, salvo navegación normal del navegador. | Usar texto o estado comprensible si el loading dura; evitar movimiento innecesario. | No cargar datos privados en cliente para simular progreso. | `/dashboard`, listados internos, detalles de pedido o solicitud si se justifica en 14.3. | No agregar skeletons globales por costumbre; no crear loaders para rutas estáticas simples. |
| Carga parcial | Una sección secundaria carga o falla mientras la pantalla principal ya tiene datos. | Estado inline, `Alert` en el panel afectado y conservación de datos parciales. | Retry de lectura si es seguro; navegación al contexto principal si no. | `aria-busy` en la región afectada cuando aplique; mensajes con `role="status"` si cambia sin navegación. | Mantener solo DTOs seguros; no mostrar detalles internos del fallo. | Paneles de archivos, comentarios, historial, tareas, dashboard. | No romper toda la página por una carga secundaria fallida. |
| Error de render | Un error no controlado rompe el render del segmento. | `error.tsx` segmentado donde exista valor de recuperación. | Retry/reset del boundary o navegación a una ruta segura. | `role="alert"` para el mensaje principal; foco inicial en el título o acción principal. | Mostrar mensaje genérico seguro; registrar detalle solo server/log. | Futuro `error.tsx` en dashboard, workspaces o rutas públicas dinámicas. | No exponer stack traces, mensajes SQL, Storage paths ni payloads técnicos. |
| Error de datos | Una lectura server-side falla y no hay datos suficientes para la sección. | `Alert` danger/warning según impacto; `EmptyState` solo si representa ausencia, no error. | Retry de lectura o recargar página si el retry local no existe. | `role="alert"` si bloquea el contenido; texto claro sobre el alcance del fallo. | No filtrar errores de Supabase/PostgreSQL/Storage. | Listados, detalle de cliente, dashboard summary, plantilla. | No presentar un error como "sin resultados". |
| Error de acción | Una Server Action o mutación devuelve fallo controlado. | `Alert` junto al formulario y errores por campo cuando existan. | Corregir datos y reenviar manualmente. | `role="alert"` para error; asociar campos con `aria-describedby`; foco al error si el flujo lo requiere. | No mostrar errores crudos; no confiar en UI como autoridad de permisos. | Login, solicitud pública, crear cliente, actualizar pedido, comentarios. | No reintentar automáticamente una mutación. |
| Error temporal | Red, servicio externo o disponibilidad transitoria impide completar una lectura o acción. | `Alert` warning si hay posibilidad razonable de recuperación; copy temporal explícito. | Retry manual en lecturas; reenviar manualmente en acciones. | `role="alert"` si bloquea; `role="status"` si es aviso no bloqueante. | No prometer que la acción no ocurrió si el servidor no confirmó estado. | Login temporal, `/estado`, paneles del dashboard. | No ocultar el fallo ni mezclarlo con credenciales inválidas o permisos. |
| Sin resultados | Una búsqueda o filtro válido devuelve cero registros. | `EmptyState` variant `search` o estado de listado equivalente. | Limpiar filtros, cambiar búsqueda o volver al listado completo. | Mensaje visible, acción accesible y target táctil suficiente. | No mostrar datos internos para "ayudar" a depurar filtros. | Pedidos, solicitudes, clientes, usuarios, plantillas. | No usar `not-found.tsx`; no decir que el recurso no existe. |
| Ausencia real de datos | No hay registros iniciales para una sección sin filtros activos. | `EmptyState` default con explicación y acción primaria si aplica. | Crear primer registro cuando el rol pueda hacerlo; si no, explicar ausencia. | Copy comprensible; acción con foco visible. | Respetar permisos visibles y server-side; no mostrar acciones no permitidas. | Listados vacíos, comentarios, archivos, historial, tareas. | No tratarlo como error; no mostrar CTA si el rol no puede ejecutar la acción. |
| Sin permisos | La sesión está activa, pero el perfil no puede acceder a una sección o acción. | Página `/sin-permisos` para ruta completa; estado permission/`Alert` para acción embebida. | Volver al dashboard, navegar a zona permitida o cerrar sesión. | Mensaje claro, foco visible, acciones alcanzables por teclado. | No revelar datos de la sección restringida; no cambiar permisos desde UI. | `/sin-permisos`, configuración para roles no admin, acciones no permitidas. | No usar 404 para ocultar una regla que el usuario debe entender dentro del área interna. |
| Acceso denegado | La cuenta no tiene acceso interno activo o no cumple condición base de entrada. | Página `/acceso-denegado`. | Logout, volver al inicio o contactar administración mediante copy. | `h1` claro, acciones grandes, foco visible. | No exponer información de perfiles, roles o políticas internas. | Redirección desde proxy/perfil inactivo. | No mezclar con permisos de sección ni con credenciales inválidas. |
| Recurso inexistente | El identificador no es válido, el registro no existe o ya no está disponible. | `notFound()` y `not-found.tsx` del segmento correspondiente. | Volver al dashboard, listado del dominio o inicio público según zona. | Título claro; acción principal accesible. | No confirmar si un recurso privado existió antes; no exponer UUIDs innecesarios. | `/dashboard/pedidos/[id]`, `/dashboard/solicitudes/[id]`, 404 pública. | No mostrar "sin resultados"; no renderizar datos parciales de un recurso no autorizado. |
| Pending | Una acción o transición está en curso. | Botón con texto pending, `aria-busy` en formulario o región, controles deshabilitados si evita doble envío. | Esperar; cancelar solo si el flujo lo soporta explícitamente. | `aria-busy`; no depender solo del color; conservar foco visible. | No permitir doble submit de mutaciones; no mover lógica de dominio al cliente. | Formularios, toolbars, subida de archivos, comentarios, pagos. | No bloquear acciones sin feedback visible o accesible. |
| Éxito | Una acción terminó correctamente y la persona necesita confirmación. | `Alert` success o estado inline cercano al formulario; navegación si el flujo lo requiere. | Continuar, cerrar dialog, ver detalle o copiar código según contexto. | `role="status"` o `aria-live="polite"`; foco posterior si cambia el contexto. | En público, mostrar solo referencia pública y datos permitidos. | Solicitud pública, crear pedido, crear cliente, actualizar estado. | No mostrar datos internos en mensajes de éxito públicos. |
| Confirmación | La acción puede perder cambios, borrar datos o ejecutar una operación difícil de revertir. | Confirmación contextual; `window.confirm` solo para cierre simple con cambios sin guardar hasta que se defina alternativa. | Confirmar, cancelar o volver al contexto. | Foco inicial y retorno de foco; copy específico; botones con targets táctiles. | No cambiar reglas de autorización; confirmar no sustituye validación server-side. | Cerrar dialog/drawer con cambios, eliminar tareas, desactivar entidades si aplica. | No pedir confirmación para acciones triviales; no confirmar después de ejecutar. |
| Fallo parcial | Una parte de la operación falla, pero otra queda completada o datos principales siguen disponibles. | `Alert` warning/danger localizado, conservar resultado exitoso y explicar qué quedó pendiente. | Retry seguro de la parte fallida si es lectura; seguimiento manual si es mutación parcial. | `role="alert"` para advertencia relevante; no ocultar la parte fallida. | No afirmar éxito total; no exponer detalles internos de la parte fallida. | Solicitud pública con archivos fallidos, workspaces con paneles fallidos. | No borrar el éxito ni ocultar los archivos/paneles fallidos. |
| Degradación segura | La pantalla puede seguir funcionando con capacidades reducidas. | Mantener layout principal, marcar secciones afectadas, deshabilitar solo acciones dependientes. | Continuar trabajando en lo disponible; retry de lecturas cuando sea seguro. | Mensajes por región; `aria-busy` o `role="alert"` según impacto. | No mostrar datos no autorizados para completar huecos; no relajar permisos. | Dashboard, Pedido workspace, Solicitud workspace, Plantillas. | No caer a una página de error total si el contenido principal es confiable. |

## 4. Decisión por primitiva o patrón

### `loading.tsx`

Usar cuando una ruta o segmento puede tardar de forma perceptible y no hay UI
útil hasta que llegue la primera carga de datos. Debe ser específico del
segmento, liviano y estable.

No usar para formularios que ya están pintados, filtros client-side, botones en
pending, rutas públicas estáticas o pantallas donde el render server suele ser
suficiente.

### `error.tsx`

Usar para errores de render no controlados por `ServiceResult` o `Alert`.
Debe ofrecer recuperación segura, como retry/reset del boundary o navegación a
una ruta estable.

No usar para validaciones de formulario, errores de action controlados, filtros
sin resultados o recursos inexistentes.

### `not-found.tsx`

Usar cuando el recurso o ruta no existe, el identificador es inválido o el
segmento debe responder como recurso inexistente. Debe respetar la zona:
pública, interna o dashboard.

No usar para resultados vacíos, filtros sin coincidencias, errores temporales,
perfil sin acceso interno o permisos insuficientes que deban explicarse.

### `EmptyState`

Usar para ausencia real de datos, resultados filtrados sin coincidencias,
estados de permiso embebidos o recursos internos no encontrados cuando el
segmento ya decidió que corresponde una superficie de empty state.

No usar para errores de lectura reales, fallos de Server Actions o errores de
render.

### `Alert`

Usar para mensajes transitorios, errores controlados, warnings, éxitos y fallos
parciales localizados. `danger` debe reservarse para bloqueos o errores
relevantes; `warning` para degradación, temporalidad o estado incompleto;
`success` para confirmaciones positivas.

No usar como sustituto de un empty state cuando el problema es ausencia de
datos.

### Estado inline

Usar para mensajes de bajo impacto dentro de una lista, card, panel o fila, por
ejemplo "Sin tareas registradas" o "No hay archivos asociados".

No usar cuando el estado bloquea una acción crítica o requiere una decisión del
usuario.

### Bloqueo de formulario y botón con pending

Usar para prevenir doble envío y comunicar que una mutación está en curso. El
botón debe cambiar de texto y el formulario o región debe marcar `aria-busy`.

No bloquear campos sin mensaje, no ocultar errores anteriores sin reemplazo y no
permitir doble submit de acciones sensibles.

### Retry

Usar para lecturas, paneles secundarios y errores temporales donde repetir la
operación no muta datos ni duplica efectos. Debe quedar claro qué se reintenta.

No usar retry automático para mutaciones, pagos, conversiones, subidas o
eliminaciones.

### Navegación de regreso

Usar en 404, sin permisos, acceso denegado y errores totales donde continuar en
la pantalla no aporta. El destino debe ser seguro y coherente con la zona.

No enviar a `/login` desde el área pública salvo redirecciones de protección; no
exponer acceso interno desde la navegación pública.

### Confirmación

Usar cuando cerrar, borrar o desactivar puede perder trabajo o producir un
cambio relevante. La confirmación debe decir qué se afectará.

No agregar confirmaciones genéricas a todas las acciones; no reemplazar
validaciones server-side.

### Conservación de datos parciales

Usar cuando el recurso principal cargó correctamente y solo falla una sección.
La UI debe mantener los datos principales y marcar el fallo localmente.

No ocultar que una parte falló ni fabricar datos placeholder como si fueran
reales.

## 5. Reglas por zona

### Área pública

- Priorizar mensajes seguros, comprensibles y sin jerga interna.
- Mantener `/solicitud` y `/estado` dentro del DTO público vigente.
- Usar `Alert` para errores de envío, consulta inválida, no encontrada o
  temporal.
- Usar éxito con código público solo cuando la creación se confirmó.
- No exponer UUIDs internos, `order_number`, archivos privados, pagos,
  historial, comentarios, usuarios ni metadata interna.

### Login

- Diferenciar credenciales inválidas, perfil inactivo y error temporal por copy.
- Usar pending en el botón de entrada y `aria-busy` en el formulario.
- No revelar si un email existe, qué rol tiene o detalles de Supabase Auth.
- No mezclar el login con navegación pública de cliente.

### Dashboard

- Priorizar degradación segura: si falla un panel, mantener los demás.
- Un error de summary no debe ocultarse con `null` si afecta decisiones
  operativas.
- Los paneles secundarios pueden usar `Alert` y empty states locales.
- El tablero principal puede ofrecer retry de lectura si 14.5 lo define.

### Listados

- Usar `EmptyState` para cero resultados o ausencia real.
- Usar `Alert` para error de datos.
- Filtros inválidos se tratan como degradación segura y deben explicarse.
- Pending de filtros debe ser consistente y accesible.
- No usar `not-found.tsx` para búsquedas sin coincidencias.

### Workspaces

- El recurso principal define si la pantalla existe: `notFound()` para
  `invalid_id` o `not_found`.
- Tareas, archivos, comentarios, historial, cliente, personal, pagos y
  plantillas pueden fallar parcialmente sin romper todo el workspace.
- El action rail puede señalar paneles en `danger` o `warning`, pero el panel
  debe explicar el problema.
- Acciones bloqueadas por estado, pago o tareas deben mostrar razón visible.

### Configuración

- Separar error de listado, ausencia de plantillas/usuarios y permisos admin.
- Mantener info alerts técnicas cuando eviten errores reales, sin competir con
  errores bloqueantes.
- No crear flujos de permisos desde la UI.

### Rutas de permisos

- `/acceso-denegado` queda para acceso interno no habilitado.
- `/sin-permisos` queda para sesión activa sin permiso de sección.
- `not-found.tsx` queda para recurso inexistente o ruta no definida.
- No intercambiar estos estados para esconder problemas de configuración.

### Archivos, comentarios e historial

- Tratar fallos como parciales cuando el recurso principal exista.
- Archivos privados nunca exponen `file_path`, rutas internas ni URLs
  permanentes.
- Comentarios e historial vacíos son ausencia real, no error.
- Descargas fallidas muestran mensaje seguro y no revelan Storage internals.

### Acciones destructivas

- Eliminar, desactivar o cerrar con cambios requiere confirmación si hay riesgo
  real de pérdida o cambio difícil de revertir.
- No reintentar automáticamente.
- El resultado debe mostrarse como éxito o error de acción, no como error de
  datos.

## 6. Reglas de retry

### Cuándo mostrar retry

- Lecturas de listados, dashboard o paneles secundarios que pueden repetirse sin
  efectos colaterales.
- Errores temporales de red o disponibilidad.
- Errores parciales de archivos, comentarios, historial, tareas o plantillas si
  el retry solo vuelve a leer.

### Cuándo no mostrar retry

- Validaciones de formulario: la acción correcta es corregir datos.
- Credenciales inválidas: la acción correcta es revisar credenciales.
- Recurso inexistente: la acción correcta es volver a una ruta segura.
- Permisos o acceso denegado: la acción correcta es volver, cerrar sesión o
  contactar administración.
- Mutaciones con efectos: crear, convertir, pagar, subir, eliminar, asignar o
  cambiar estado.

### Acciones seguras de reintentar

- Lecturas server-side.
- Refrescar un panel.
- Repetir una búsqueda o filtro.
- Recargar una ruta de detalle cuando el recurso principal ya existe y el error
  fue temporal.

### Acciones que no deben reintentarse automáticamente

- Creación de solicitud, pedido, cliente, usuario o plantilla.
- Conversión de solicitud a pedido.
- Actualización de pago o estado.
- Subida de archivos.
- Eliminación o reapertura de tareas.
- Asignación o remoción de personal.

### Retry de lectura vs retry de mutación

El retry de lectura puede ser una acción visible de "Reintentar" porque no
duplica cambios. El retry de mutación debe ser manual y explícito: el usuario
corrige o decide reenviar el formulario después de entender el resultado. Si el
estado final de una mutación es incierto, el copy debe evitar afirmar que no se
ejecutó.

## 7. Reglas de skeleton y loading

### Cuándo sí usar `loading.tsx`

- En segmentos con carga inicial perceptible y layout estable.
- En dashboard o workspaces si la navegación entre rutas deja una espera clara.
- En listados si se confirma que la navegación con filtros o entrada inicial
  necesita feedback segmentado.

### Cuándo no usar skeleton

- Cuando la ruta es estática o renderiza rápido.
- Cuando solo está pendiente una acción de formulario.
- Cuando el skeleton no se parece a la estructura real.
- Cuando el skeleton oculta un problema de datos o permisos.
- Cuando agrega ruido visual en pantallas operativas densas.

### Cuándo basta con pending en botón

- En Server Actions de formularios.
- En comentarios, pagos, estado, asignaciones, tareas y subida de archivos.
- En login y solicitud pública.
- En acciones de dialog/drawer donde la pantalla ya está cargada.

### Cuándo evitar loaders

- Cuando el render server ya ofrece respuesta suficiente.
- Cuando existe una transición corta sin impacto operativo.
- Cuando el feedback se puede resolver con `aria-busy` en la región afectada.

## 8. Reglas de errores

### Error de datos vs error de acción

Error de datos ocurre al leer información para mostrar una ruta, lista o panel.
Error de acción ocurre al intentar mutar o enviar información desde un
formulario. El primero puede ofrecer retry de lectura; el segundo requiere
corrección, decisión manual o reenvío explícito.

### Error temporal vs error permanente

El error temporal sugiere que reintentar puede funcionar. El error permanente
indica que el usuario debe cambiar algo o volver a un contexto seguro:
credenciales inválidas, recurso inexistente, permisos insuficientes o datos no
válidos.

### Error de permisos vs acceso denegado

Sin permisos significa que la sesión existe, pero la sección o acción no está
permitida para el rol. Acceso denegado significa que no existe acceso interno
activo suficiente para entrar al workspace.

### Not found vs sin resultados

Not found corresponde a ruta o recurso inexistente. Sin resultados corresponde
a una consulta válida que no encontró registros dentro de una lista.

### Error parcial vs error total

El error parcial afecta una sección secundaria y permite seguir usando datos
principales. El error total impide confiar en la pantalla principal y debe
mostrar una salida segura, retry o navegación.

## 9. Reglas de seguridad

- No filtrar errores de Supabase, PostgreSQL, Storage, Auth ni stack traces.
- No exponer UUIDs innecesarios en UI pública o mensajes de error.
- No exponer `file_path`, buckets privados, rutas internas ni URLs permanentes.
- No exponer datos privados en área pública.
- No mostrar pagos, archivos, historial, comentarios ni datos internos en
  `/estado`.
- No cambiar permisos, RLS o Storage desde UI.
- No crear DTOs públicos nuevos para resolver un estado visual.
- No consultar Supabase desde Client Components.
- No convertir reglas visibles de UI en autoridad de seguridad.

## 10. Reglas de accesibilidad

- Usar `role="alert"` para errores que requieren atención inmediata o bloquean
  una tarea.
- Usar `role="status"` o `aria-live="polite"` para éxitos, pending informativo y
  cambios no bloqueantes.
- Usar `aria-busy` en formularios o regiones que están procesando.
- Mantener foco visible en enlaces, botones, filtros, tabs, dialogs y acciones
  de retry.
- Mover foco al error o resumen cuando el contexto cambia de forma relevante.
- Devolver foco al trigger al cerrar dialog/drawer.
- Los targets táctiles deben ser cómodos en mobile, especialmente acciones de
  retry, cierre, confirmación y navegación.
- El copy debe decir qué ocurrió y qué hacer después, sin depender solo del
  color ni de términos técnicos.

## 11. Decisiones para implementar después

### 14.3 - App Router states

1. Revisar segmentos candidatos para `loading.tsx`: dashboard, listados y
   workspaces.
2. Revisar segmentos candidatos para `error.tsx`: dashboard y rutas internas
   donde un error de render necesita recuperación.
3. Mantener 404 pública e interna separadas.
4. No agregar skeletons hasta confirmar estructura y utilidad por segmento.

### 14.4 - Estados vacíos

1. Normalizar diferencia entre sin resultados y ausencia real en listados.
2. Revisar dashboard para reducir mezcla de `EmptyState`, inline y `null`.
3. Revisar archivos, comentarios, historial y tareas para copy consistente.
4. No crear componente nuevo sin justificar brecha real en `EmptyState`.

### 14.5 - Errores/retry

1. Definir retry de lectura para paneles y listados donde sea seguro.
2. Diferenciar errores temporales de errores permanentes en copy y acción.
3. Evitar retry automático en mutaciones.
4. Revisar dashboard para que fallos relevantes no desaparezcan en `null`.

### 14.6 - Pending/action feedback

1. Normalizar textos de pending por acción: crear, guardar, actualizar, enviar,
   subir, convertir, eliminar.
2. Alinear `ListingToolbar` y `ListFiltersBar` o retirar patrón obsoleto si
   corresponde en implementación futura.
3. Revisar `aria-busy`, `role="status"` y foco posterior en formularios.
4. No tocar Server Actions ni contratos de `FormData`.

### 14.7 - Fallos parciales

1. Formalizar patrón de panel fallido con datos principales conservados.
2. Alinear action rail, preview y panel para que el mismo fallo no se oculte ni
   se duplique innecesariamente.
3. Revisar solicitud pública con archivos fallidos como caso público de
   degradación segura.
4. Mantener datos disponibles y seguros.

### 14.8 - Permisos/not-found

1. Documentar y aplicar diferencia entre `/sin-permisos`,
   `/acceso-denegado` y `not-found.tsx`.
2. Revisar si estados embebidos de permiso deben usar `EmptyState permission` o
   `Alert warning`.
3. Mantener separación pública/interna.
4. No cambiar matriz de permisos ni RLS.

### 14.9 - Confirmaciones

1. Revisar cierre con cambios sin guardar en dialog/drawer.
2. Revisar acciones destructivas inline como eliminar tareas.
3. Definir cuándo basta confirmación simple y cuándo se necesita contexto más
   accesible.
4. No reintentar ni confirmar automáticamente mutaciones.
