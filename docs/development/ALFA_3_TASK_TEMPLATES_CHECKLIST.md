# Alfa 3 - Checklist de cierre tecnico de plantillas de tareas

## Resumen arquitectonico

- [x] Las plantillas funcionan como moldes de tareas, no como pedidos reales.
- [x] `trabajo_plantillas` guarda la cabecera de la plantilla.
- [x] `trabajo_plantilla_tareas` guarda tareas base ordenadas sin progreso.
- [x] La aplicacion copia transaccionalmente hacia `pedido_tareas`.
- [x] Las tareas copiadas quedan independientes de la plantilla original.
- [x] No existe sincronizacion viva plantilla -> pedido.
- [x] La aplicacion esta limitada a pedidos `workflow_type = encargo`.
- [x] Los pedidos `workflow_type = impresion` mantienen flujo directo y no muestran selector.

## Subfases completadas

- [x] Alfa 3.1 Modelo: `trabajo_plantillas` y `trabajo_plantilla_tareas`.
- [x] Alfa 3.2 Gestion de plantillas en Configuracion.
- [x] Alfa 3.3 Gestion de tareas dentro de plantillas.
- [x] Alfa 3.4 Aplicacion de plantillas a pedidos de Encargo.
- [x] Alfa 3.5 Cierre tecnico, auditoria y documentacion.

## Modulos afectados

- [x] Migraciones Supabase.
- [x] RPC `public.aplicar_plantilla_tareas_pedido`.
- [x] `src/lib/task-templates`.
- [x] Configuracion de plantillas.
- [x] Detalle de plantilla.
- [x] Detalle de pedido.
- [x] Seccion de tareas del pedido.
- [x] Tipos Supabase.
- [x] Documentacion tecnica.

## Checklist funcional

- [x] Admin crea plantilla.
- [x] Admin edita plantilla.
- [x] Admin activa/desactiva plantilla.
- [x] Admin gestiona tareas internas de plantilla.
- [x] Admin crea tarea simple de plantilla.
- [x] Admin crea tarea cuantificada de plantilla.
- [x] Admin edita tarea de plantilla.
- [x] Admin elimina tarea de plantilla.
- [x] Admin reordena tarea de plantilla.
- [x] Pedido Encargo editable muestra selector de plantillas.
- [x] Pedido Impresion no muestra selector de plantillas.
- [x] Pedido cerrado o no editable no muestra selector.
- [x] Aplicar plantilla copia tareas al pedido.
- [x] Las tareas copiadas quedan como tareas normales.
- [x] El progreso del Encargo considera tareas copiadas.
- [x] Aplicar dos veces puede duplicar tareas y la UI lo advierte.

## Checklist de seguridad

- [x] `anon` no tiene acceso a tablas de plantillas.
- [x] `anon` no tiene `execute` sobre la RPC de aplicacion.
- [x] No se usa `service_role`.
- [x] No se agrega `SUPABASE_SERVICE_ROLE_KEY`.
- [x] No se consulta `auth.users` desde codigo de aplicacion.
- [x] No hay Supabase directo en Client Components de plantillas/pedidos.
- [x] RLS esta activo en tablas de plantilla.
- [x] RPC valida usuario autenticado y perfil interno activo.
- [x] RPC valida permiso real de gestion de tareas del pedido.
- [x] RPC bloquea pedidos `impresion`.
- [x] RPC bloquea plantillas inactivas.
- [x] RPC bloquea plantillas vacias.
- [x] RPC bloquea pedidos en estados no editables.

## Auditoria de no sincronizacion viva

- [x] `pedido_tareas` no guarda FK obligatoria a plantilla.
- [x] Editar una plantilla no modifica tareas copiadas.
- [x] Desactivar una plantilla no modifica pedidos existentes.
- [x] Borrar una tarea de plantilla no borra tareas de pedidos.
- [x] La plantilla queda como molde inicial, no como fuente sincronizada.

## Deuda tecnica registrada

- [x] Prevencion opcional de duplicados al aplicar plantillas.
- [x] Confirmacion adicional cuando el pedido ya tiene tareas.
- [x] Categorias o tipo de trabajo para plantillas.
- [x] Busqueda/filtros si crece el catalogo.
- [x] Previsualizacion de tareas antes de aplicar.
- [x] Mejoras de ordenamiento o drag and drop.
- [x] QA visual mas amplia con datos reales.

## Verificaciones finales

- [x] `npm run lint`.
- [x] `npm run build`.
- [x] Verificacion previa autenticada de Configuracion y detalle de plantillas.
- [x] Verificacion previa autenticada de selector en Encargo.
- [x] Verificacion previa autenticada de ausencia de selector en Impresion.
- [x] Prueba de RPC positiva con orden y progreso inicial.
- [x] Pruebas de bloqueos: Impresion, plantilla inactiva, plantilla vacia, estado no editable y trabajador no asignado.
