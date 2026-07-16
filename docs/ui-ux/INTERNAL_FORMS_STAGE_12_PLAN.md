# Etapa 12.1 - Auditoría y especificación de formularios internos

## 1. Objetivo

La Etapa 12 consolida formularios internos y páginas secundarias después del cierre de workspaces, listados administrativos y dashboard operativo.

El objetivo principal es mover progresivamente las acciones internas de crear, editar y operar hacia dialog o drawer contextual cuando sea técnicamente razonable, sin eliminar de golpe las rutas existentes ni alterar reglas de dominio.

Esta subtarea es solo documental. No implementa cambios visuales ni modifica código de aplicación.

## 2. Alcance revisado

Incluido en esta etapa:

- formularios internos de Clientes;
- formularios internos de Usuarios;
- formulario de creación manual de Pedidos;
- formularios operativos dentro de workspaces de Pedidos;
- formularios operativos dentro de workspaces de Solicitudes;
- formularios de Configuración y Plantillas;
- pantallas internas secundarias que sirven como fallback durante la migración.

Excluido de esta etapa:

- formulario público de solicitud;
- formulario público de consulta de estado;
- login;
- logout;
- búsquedas y filtros de listados ya cubiertos por Etapas 8, 9 y 10.

Esos formularios públicos y de autenticación pertenecen a la Etapa 13 o a flujos transversales posteriores.

## 3. Inventario y clasificación

| Área | Componente | Ruta o lugar actual | Tipo | Contexto actual | Complejidad | Decisión candidata | Problemas visuales detectados | Textos redundantes o placeholders confusos | Riesgos técnicos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Clientes | `ClienteForm` | `/dashboard/clientes/nuevo` | Crear | Página completa | Simple | Dialog desde listado, drawer en mobile, mantener ruta fallback | Página aislada para una captura corta; botón de regreso ocupa jerarquía de acción primaria | Nota fija de campos obligatorios repetida; sin placeholder problemático | Importa action de la ruta actual; modalización debe desacoplar o pasar action por props sin romper Server Actions |
| Clientes | `ClienteEditForm` | `/dashboard/clientes/[id]/editar` | Editar | Página completa | Simple | Dialog desde detalle/listado, drawer en mobile, mantener ruta fallback | Edición corta en pantalla completa; regreso manual al detalle | Nota fija repetida; sin placeholder problemático | Usa hidden `cliente_id`; en dialog debe preservar contexto, revalidación y retorno de foco |
| Solicitudes | `SolicitudClienteForm` | Panel Cliente en `/dashboard/solicitudes/[id]` | Asociación y creación derivada | Workspace panel | Media | Mantener en drawer/panel contextual; no llevar a página completa | Dos acciones compiten en el mismo panel: asociar existente y crear desde solicitud | Descripción de "Crear desde esta solicitud" aporta, pero puede compactarse | Dos Server Actions en un mismo componente; cuidado con mensajes simultáneos y estado de cliente ya asociado |
| Usuarios | `UserCreateForm` | `/dashboard/configuracion/usuarios/nuevo` | Crear perfil interno | Página completa | Media | Drawer desde listado de usuarios, mantener ruta fallback | Flujo técnico ocupa página completa; alerta informativa grande | Placeholder de UUID parece dato real aunque cumple formato; textos sobre Supabase Auth son necesarios pero densos | Admin-only; depende de usuario Auth existente; no cambiar permisos ni tocar `auth.users` |
| Usuarios | `UserEditForm` | `/dashboard/configuracion/usuarios/[id]/editar` | Editar perfil interno | Página completa | Media | Drawer desde listado; mantener ruta fallback | Edición operativa corta con explicación técnica visible | Muestra UUID completo en descripción; alerta sobre credenciales puede compactarse | Restricción de último admin vive en servidor; no convertir UI en autoridad |
| Pedidos | `PedidoForm` | `/dashboard/pedidos/nuevo` | Crear pedido manual | Página completa | Alta | Drawer ancho o página fallback principal; no usar modal pequeño | Formulario largo con varias secciones; page header + advertencia + form generan mucho scroll | Varias descripciones de sección son útiles pero largas; placeholder "Pedido de impresión" puede parecer valor final | Tiene tabs client-side, reset tras éxito, link al pedido creado y public reference; modalización requiere manejo cuidadoso de éxito, foco y navegación |
| Pedidos | `PedidoStatusForm` | Panel Estado en `/dashboard/pedidos/[id]` | Acción operativa | Workspace panel | Media | Mantener en panel/drawer contextual | Ya está integrado al workspace; mensajes de bloqueo pueden acumularse | Textos de contexto son útiles; algunos avisos podrían priorizarse | Transiciones dependen de estado, tareas y pago; no duplicar reglas fuera del servidor |
| Pedidos | `PedidoPaymentForm` | Dentro de `PedidoPaymentSection`, panel Pagos | Acción operativa | Workspace panel inline | Simple | Mantener inline dentro del panel Pagos | Inputs numéricos correctos, pero la nota de montos acumulados podría tener menor peso visual | Nota necesaria; sin placeholder problemático | Importes acumulados y total no editable; riesgo de error si se interpreta como abono incremental |
| Pedidos | `PedidoWorkerAssignmentForm` | Panel Personal en `/dashboard/pedidos/[id]` | Acción operativa | Workspace panel | Media | Mantener en panel/drawer contextual | Lista y asignación conviven bien, pero en mobile puede crecer por asignaciones | Texto "Selecciona un usuario" correcto; sin placeholders problemáticos | Dos acciones separadas: asignar y quitar; manejo de estados simultáneos y permisos |
| Pedidos | `ApplyTaskTemplateForm` | Panel Tareas de pedido | Acción operativa | Workspace panel/card | Simple | Mantener inline en panel Tareas | Ya es compacto; buena candidata a subacción inline | Explicación completa solo en card, no en panel; correcto | Solo aplica a encargos activos; depende de carga parcial de plantillas |
| Pedidos | `PedidoTasksSection` | Panel Tareas de pedido | Crear tarea y gestión de tareas | Workspace panel | Alta | Mantener en panel; editar tareas inline | Mezcla cargar plantilla, crear tarea, progreso y lista; puede sentirse denso | Ejemplos visuales ayudan pero no deben aparecer en panel compacto si consumen altura | Múltiples actions de task; cuantificación automática; no mover a modal aislado sin perder contexto |
| Pedidos | `PedidoTaskItem` | Lista de tareas dentro de pedido | Editar/progreso/eliminar tarea | Inline por item | Media | Mantener inline; considerar confirmación para eliminar | Varios formularios por item pueden expandir mucho cada tarea | Label "Editar" es ambiguo; placeholder no aplica | Acciones independientes por tarea; confirmación de borrado puede requerir nueva primitiva |
| Pedidos | `PedidoCommentComposer` | Panel Comentarios de pedido | Comentario | Composer fijo en panel | Simple | Mantener inline/fijo en panel | Ya usa textarea compacto con auto-height en panel | Título "Comenta" podría ser más preciso, pero es aceptable | Reset y resize client-side; no debe bloquear lectura del hilo |
| Pedidos | `PedidoFileUploadForm` | Panel Archivos de pedido | Archivo | Inline al pie del panel | Simple | Mantener inline/fijo en panel | File input nativo puede ocupar ancho, pero está bien contenido | Mensaje de visibilidad es útil; no hay placeholder | Storage privado; no exponer `file_path`; respetar estados que bloquean subida |
| Solicitudes | `SolicitudStatusForm` | Panel Estado en `/dashboard/solicitudes/[id]` | Acción operativa | Workspace panel | Simple | Mantener en panel/drawer contextual | Ya es compacto | Texto de estado actual adecuado | Transiciones cerradas no deben habilitarse por UI |
| Solicitudes | `SolicitudConvertPedidoForm` | Panel Conversión en `/dashboard/solicitudes/[id]` | Conversión | Workspace panel | Alta | Drawer ancho o full-screen mobile dentro del workspace; no modal pequeño | Formulario largo dentro de panel; mucha ayuda debajo de cada campo | Help text repetido en campos de conversión; algunos textos pueden compactarse | Crea pedido desde solicitud; depende de estado aprobado y cliente asociado; no cambiar Server Action ni permisos |
| Solicitudes | `SolicitudCommentComposer` | Panel Comentarios de solicitud | Comentario | Composer fijo en panel | Simple | Mantener inline/fijo en panel | Ya es compacto | Título "Comenta" podría ser más específico | Reset y resize client-side; no debe interferir con scroll del panel |
| Configuración | `TaskTemplateForm` | `/dashboard/configuracion/plantillas/nueva`, `/dashboard/configuracion/plantillas/[templateId]/editar`, `TaskTemplatesSection`, `TaskTemplatesList` | Crear/editar | Página completa e inline | Media | Dialog/drawer para crear/editar desde listado; mantener rutas fallback | Ya soporta `layout` section/inline; buen punto de partida para modalización | Nota tras crear es útil; descripción puede compactarse | Action común create/update; cuidado con campos hidden y estado activo solo en edición |
| Configuración | `TaskTemplateTaskForm` | Aside "Nueva tarea" en `/dashboard/configuracion/plantillas/[templateId]` | Crear/editar tarea | Panel lateral/compacto | Simple | Mantener inline; drawer solo si se agregan campos futuros | Variante compacta funciona bien; no necesita página propia | Placeholder "Ej. Imprimir 100 páginas" es ejemplo claro, pero puede confundirse con dato si se abusa | Cuantificación automática por texto; no ocultar ayuda en variante completa |
| Configuración | `TaskTemplateTasksList` forms internos | Lista de tareas de plantilla | Mover/editar/eliminar | Inline por item | Media | Mantener inline con icon buttons; considerar confirmación para eliminar | Buen uso de iconos; errores inline pueden ocupar filas | Sin placeholder problemático | Múltiples forms por fila; preservar orden, foco y errores por tarea |

## 4. Formularios detectados fuera de alcance

| Componente | Motivo de exclusión |
| --- | --- |
| `PublicSolicitudForm` | Formulario público; pertenece a Etapa 13. |
| `PublicTrackingSearchForm` | Consulta pública de estado; pertenece a Etapa 13. |
| `LoginForm` | Autenticación; pertenece a Etapa 13/transversal. |
| `LogoutButton` | Acción de sesión, no formulario interno de gestión. |
| `ListingToolbar` | Búsqueda/filtros de listados ya consolidados en Etapas 8-10. |
| Formularios de toggle rápido en listados | Acciones secundarias ya cubiertas por listados/configuración; se revisan solo si bloquean 12.6. |

## 5. Estrategia modal-first

Decisión:

Las acciones internas de crear y editar deben abrirse preferentemente como dialog o drawer contextual desde el lugar donde el usuario está trabajando.

Aplicación práctica:

- Crear/editar clientes: dialog en desktop; drawer o full-screen modal en mobile; rutas actuales quedan como fallback.
- Crear/editar usuarios: drawer en desktop y full-screen mobile por contenido técnico; rutas actuales quedan como fallback.
- Crear pedido manual: drawer ancho o página fallback principal; no comprimir en dialog pequeño.
- Crear/editar plantillas: dialog o drawer desde listado/configuración; rutas actuales quedan como fallback.
- Acciones operativas en workspaces: mantener panel/drawer contextual existente.
- Comentarios, archivos, pagos simples y tareas pequeñas: mantener inline cuando el contexto permanente aporta más que un modal.

Reglas de migración:

- No borrar rutas existentes de golpe.
- Mantener rutas fallback mientras se migra cada dominio.
- No romper Server Actions ni su ubicación server-side.
- No cambiar permisos, RLS, RPCs ni modelo de datos.
- No convertir formularios largos en modales pequeños.
- En mobile, preferir drawer full-screen o ruta fallback cuando el formulario requiera mucho scroll.
- Preservar retorno de foco al cerrar dialog/drawer.
- No crear un formulario universal excesivamente configurable.

## 6. Reglas de diseño para formularios internos

- Formularios más compactos, con menos espacio vertical entre secciones cuando el contexto ya está claro.
- Help text solo cuando evita errores reales o explica una regla de dominio.
- No repetir textos descriptivos que ya aparecen en el título del panel, cabecera o botón.
- Placeholders deben ser ejemplos evidentes, no valores que parezcan datos reales.
- Labels siempre visibles y claros.
- Errores cerca del campo afectado, con mensaje seguro y sin errores crudos de PostgreSQL, Supabase o Storage.
- Mensajes de éxito y error deben usar `aria-live` cuando corresponda.
- Acciones consistentes: primaria al final; cancelar/cerrar claramente disponible.
- Foco visible en inputs, selects, botones, icon buttons y triggers de dialog/drawer.
- Retorno de foco al trigger después de cerrar superficies contextuales.
- Confirmación si hay cambios sin guardar cuando sea técnicamente razonable.
- Confirmación para acciones destructivas como eliminar tareas, si se introduce en la etapa.
- No depender solo del color para estado, error o prioridad.
- No introducir gráficos, ilustraciones ni animaciones innecesarias.
- En mobile, evitar footer de acciones que tape campos o mensajes.
- Mantener Server Components para carga de datos; Client Components solo para interacción local real.

## 7. Candidatos por patrón

### Dialog

- `ClienteForm`
- `ClienteEditForm`
- `TaskTemplateForm` en modo create/edit cuando se lance desde listados.

Usar dialog cuando el formulario sea corto, reversible y no requiera comparación extensa con datos de la página.

### Drawer

- `UserCreateForm`
- `UserEditForm`
- `PedidoForm` si se invoca desde el listado como creación rápida, con fallback fuerte a página completa.
- `SolicitudConvertPedidoForm`
- `SolicitudClienteForm`

Usar drawer cuando el formulario necesita más contexto, tiene mensajes técnicos, o puede crecer en altura.

### Mantener inline

- `PedidoPaymentForm`
- `PedidoWorkerAssignmentForm`
- `ApplyTaskTemplateForm`
- `PedidoTasksSection`
- `PedidoTaskItem`
- `PedidoCommentComposer`
- `PedidoFileUploadForm`
- `SolicitudStatusForm`
- `PedidoStatusForm`
- `SolicitudCommentComposer`
- `TaskTemplateTaskForm`
- forms internos de `TaskTemplateTasksList`

Mantener inline cuando la acción es parte del flujo continuo de trabajo y perdería claridad al separarse del panel.

### Mantener página fallback

- `/dashboard/clientes/nuevo`
- `/dashboard/clientes/[id]/editar`
- `/dashboard/configuracion/usuarios/nuevo`
- `/dashboard/configuracion/usuarios/[id]/editar`
- `/dashboard/pedidos/nuevo`
- `/dashboard/configuracion/plantillas/nueva`
- `/dashboard/configuracion/plantillas/[templateId]/editar`

Las rutas fallback deben seguir disponibles durante la migración y servir para deep links, errores de carga, mobile complejo o recuperación.

## 8. Riesgos detectados

- Acoplamiento de algunos formularios a actions ubicadas en rutas concretas.
- Múltiples `useActionState` dentro del mismo panel pueden producir mensajes simultáneos si no se ordenan visualmente.
- Formularios largos como `PedidoForm` y `SolicitudConvertPedidoForm` pueden degradarse si se colocan en modales estrechos.
- Usuario/Auth es un flujo técnico: no debe inducir a crear credenciales desde la app.
- El placeholder de UUID en `UserCreateForm` puede parecer dato real; conviene reemplazarlo por help text o ejemplo más neutral.
- La conversión de solicitud a pedido no debe cambiar reglas de aprobación, cliente asociado, prioridad, pagos ni descripción.
- Archivos deben mantener Storage privado y no exponer `file_path`.
- Las acciones destructivas de tareas siguen sin confirmación contextual documentada.
- No convertir páginas server-side completas en Client Components para abrir modales.

## 9. Subtareas propuestas para Etapa 12

| Subtarea | Nombre | Objetivo | Estado |
| --- | --- | --- | --- |
| 12.1 | Auditoría y especificación de formularios internos | Inventariar formularios, clasificar patrones y fijar estrategia modal-first con fallback | Completado |
| 12.2 | Primitivas comunes de formularios internos | Definir dialog/drawer, footer de acciones, confirmación de cambios y reglas de foco | Completado |
| 12.3 | Clientes: crear/editar en dialog/drawer | Abrir crear/editar cliente desde listado/detalle manteniendo rutas fallback | Completado |
| 12.4 | Usuarios: crear/editar en dialog/drawer | Abrir crear/editar usuario desde configuración con tratamiento técnico y admin-only | Pendiente |
| 12.5 | Pedido manual: formulario compacto contextual | Compactar `PedidoForm` y decidir drawer ancho vs página fallback principal | Pendiente |
| 12.6 | Configuración/plantillas: formularios compactos | Consolidar crear/editar plantilla y tareas sin romper gestión inline | Pendiente |
| 12.7 | Formularios operativos en workspaces/paneles | Pulir Estado, Cliente, Conversión, Tareas, Archivos, Comentarios, Personal y Pagos | Pendiente |
| 12.8 | Pantallas internas transversales | Revisar páginas fallback, acceso denegado, sin permisos, vacíos, regresos y cabeceras | Pendiente |
| 12.9 | QA y cierre | Validar responsive, accesibilidad, foco, permisos visibles, errores y rutas fallback | Pendiente |

## 10. Subtarea 12.2 - Primitivas comunes

Primitivas comunes creadas:

- `InternalFormDialog`;
- `InternalFormDrawer`;
- `InternalFormShell`;
- variantes compactas opcionales de `FormField`, `FormSection` y `FormActions`.

Decisión:

Estas primitivas no sustituyen las rutas fallback ni modifican Server Actions. Se usarán progresivamente desde 12.3, empezando por formularios cortos de crear/editar y manteniendo inline las acciones operativas que dependen del contexto permanente del workspace.

## 11. Subtarea 12.3 - Clientes

Decisiones implementadas:

- `ClienteForm` soporta modo compacto para uso contextual.
- `ClienteEditForm` soporta modo compacto para uso contextual.
- La creación de cliente desde `/dashboard/clientes` abre un dialog contextual mediante `ClienteCreateDialogButton`.
- La edición desde el detalle de cliente abre un dialog contextual mediante `ClienteEditDialogButton`.
- Las rutas fallback `/dashboard/clientes/nuevo` y `/dashboard/clientes/[id]/editar` se mantienen sin cambios de ruta.
- No se modificaron Server Actions, validadores, permisos, consultas, RLS ni modelo de datos.

## 12. Criterios de cierre de la Etapa 12

- Las rutas fallback siguen disponibles o quedan redirigidas con decisión explícita.
- Crear/editar corto se resuelve contextual cuando aporte valor.
- Formularios largos usan drawer ancho, full-screen mobile o página fallback.
- Workspaces conservan paneles operativos sin perder contexto.
- No se modifican permisos, RLS, RPCs, Storage ni modelo de datos.
- No se exponen datos sensibles ni errores crudos.
- Los formularios son utilizables con teclado.
- Hay foco visible, retorno de foco y cierre claro.
- No hay overflow horizontal en mobile.
- La documentación y el roadmap quedan sincronizados.
