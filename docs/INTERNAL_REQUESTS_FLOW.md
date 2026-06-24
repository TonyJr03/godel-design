# Flujo Interno de Solicitudes — Godel Diseño

## Propósito

Este documento describe cómo el equipo interno revisa y gestiona las solicitudes
públicas recibidas desde `/solicitud` dentro del dashboard operativo de Godel
Diseño.

## Relación con el flujo público

Las solicitudes se originan desde el formulario público documentado
conceptualmente en `docs/PUBLIC_REQUEST_FLOW.md`. Al enviarse:

- se guardan inicialmente con estado `nueva`;
- quedan disponibles para revisión interna desde el dashboard;
- no se convierten automáticamente en pedidos.

La conversión a pedido se realiza manualmente desde el detalle interno cuando la
solicitud está aprobada y tiene cliente asociado. El formulario adapta sus
requisitos al `workflow_type` de la solicitud y permite definir la prioridad
inicial, el precio total y la fecha estimada del pedido.

La solicitud no tiene precio propio. El usuario interno define `total_amount`
en el momento de convertir y ese monto pertenece al pedido resultante mediante
`pedido_pagos`. Si el precio es `0`, el resumen financiero queda `pagado`; si
es mayor que `0`, queda `sin_pago` porque todavia no se registra pago inicial.

Las solicitudes de `Encargo` e `Impresión` continúan viviendo en la misma tabla
`solicitudes`. La diferencia formal se guarda en `workflow_type` y se conserva
al convertir la solicitud en pedido.

## Ruta interna principal

La ruta principal es `/dashboard/solicitudes`.

Requisitos de acceso:

- autenticación activa;
- perfil interno activo;
- permiso `solicitudes.view`;
- rol `admin` o `supervisor`.

El rol `trabajador` no debe acceder a esta sección. Puede ver datos de una solicitud únicamente cuando estén relacionados con un pedido asignado, desde el detalle del pedido.

## Listado interno

| Pieza | Archivo |
| --- | --- |
| Página | `src/app/dashboard/solicitudes/page.tsx` |
| Servicio | `src/lib/solicitudes/list-internal-solicitudes.ts` |
| Componente | `src/components/solicitudes/InternalSolicitudesList.tsx` |

El listado:

- carga server-side;
- consulta hasta 50 solicitudes;
- ordena por `created_at` descendente;
- muestra referencia corta, cliente, teléfono, email, tipo de solicitud, tipo
  de servicio, estado, fecha de creación y fecha deseada;
- permite buscar mediante `q` por referencia visible, cliente, teléfono, correo,
  tipo de servicio, descripción o notas;
- permite filtrar por estado y por tipo de solicitud;
- combina búsqueda, estado y `workflow_type` conservando los parámetros GET;
- usa la barra común de listados: la búsqueda actualiza `q` tras 200 ms sin
  escritura y el selector de estado actualiza la URL inmediatamente;
- permite limpiar búsqueda, estado y tipo en una sola acción;
- no consulta Supabase desde componentes cliente.

`quantity` fue eliminado de solicitudes. El detalle de cantidades, medidas o requisitos debe revisarse en `description` o `notes`. `service_type` es solo una referencia inicial elegida por el cliente, no el título automático del pedido.

Los listados, detalles, historial y conversión deben renderizar `service_type` mediante `getSolicitudServiceTypeLabel` desde `src/lib/solicitudes/labels.ts`, para mantener tildes y `ñ` correctas sin modificar el valor técnico guardado.

## Filtro por estado

URLs soportadas:

- `/dashboard/solicitudes`
- `/dashboard/solicitudes?status=nueva`
- `/dashboard/solicitudes?status=en_revision`
- `/dashboard/solicitudes?status=contactada`
- `/dashboard/solicitudes?status=aprobada`
- `/dashboard/solicitudes?status=rechazada`
- `/dashboard/solicitudes?status=convertida`

`convertida` aparece como filtro porque es el estado resultante del flujo formal
de conversión a pedido. No puede establecerse manualmente.

La búsqueda se ejecuta server-side, normaliza y limita el texto recibido y respeta permiso y RLS. Para tipos de servicio también considera los labels visibles, por lo que una búsqueda como “diseño” puede encontrar valores históricos sin tilde. La referencia corta se resuelve desde los primeros caracteres del UUID accesible.

La barra de búsqueda es un componente cliente únicamente para sincronizar los
controles con la URL mediante `router.replace`. No consulta Supabase ni filtra
los resultados cargados en memoria. Mientras espera el debounce o la respuesta
del servidor muestra el estado discreto `Buscando...`.

No es un buscador global. Si el volumen crece significativamente, podrán evaluarse índices o búsqueda especializada en una fase posterior sin cambiar el contrato `q`.

## Filtro por tipo de solicitud

URLs soportadas:

- `/dashboard/solicitudes?workflow_type=encargo`
- `/dashboard/solicitudes?workflow_type=impresion`
- `/dashboard/solicitudes?status=nueva&workflow_type=impresion`

El filtro se valida contra el enum formal `workflow_type`. Un valor inválido se
ignora de forma segura y la página muestra una advertencia. El filtro se aplica
en la consulta general y en todas las ramas de búsqueda por texto, referencia
visible y labels de servicio.

## Detalle interno

| Pieza | Archivo |
| --- | --- |
| Ruta | `/dashboard/solicitudes/[id]` |
| Página | `src/app/dashboard/solicitudes/[id]/page.tsx` |
| Servicio | `src/lib/solicitudes/get-internal-solicitud-by-id.ts` |
| Componente | `src/components/solicitudes/InternalSolicitudDetail.tsx` |

El detalle:

- carga server-side;
- valida que el `id` tenga formato UUID;
- usa `notFound()` para id inválido o solicitud inexistente;
- muestra datos completos de la solicitud;
- muestra un badge y metadata con `Encargo` o `Impresión`;
- muestra `public_reference` en un bloque copiable de seguimiento público;
- ajusta el título descriptivo del trabajo según `workflow_type`;
- conserva la descripción estructurada de impresión con saltos de línea, sin
  parsearla todavía en campos separados;
- muestra archivos privados asociados a la solicitud;
- no permite edición completa;
- permite convertir a pedido solo si la solicitud está aprobada y tiene cliente asociado;
- no permite eliminar archivos.

La sección identifica si se creará un pedido de `Encargo` o de `Impresión`.
Para encargos, `title` y `description` son obligatorios. Para impresiones, el
título es opcional y usa `Pedido de impresión` cuando queda vacío; la
descripción se precarga desde la solicitud, puede editarse y, si se envía vacía,
el servicio recupera la descripción original.

La prioridad inicia en `normal` y se valida contra el enum real de prioridades.
El precio total es obligatorio, puede ser `0`, no puede ser negativo ni tener
mas de 2 decimales, y se guarda en `pedido_pagos` al confirmar la conversion.
También permite definir `estimated_delivery_date` de forma opcional; si se
informa, debe ser igual o posterior al día actual y se valida server-side con
`src/lib/validators/date.ts`.

El formulario no acepta `cliente_id`, `status`, `converted_order_id`, `created_by`, `order_number`, campos de archivos ni otros campos técnicos. La conversión no envía número de pedido; la base de datos lo asigna con formato `P-YY-XXXX`. El estado inicial sigue siendo `solicitud_recibida`.

El formulario no envía `workflow_type`. El servicio carga primero la solicitud,
aplica las reglas y valores por defecto correspondientes a su flujo y delega la
escritura completa en la RPC transaccional
`public.convertir_solicitud_a_pedido`. La función bloquea la solicitud, repite
las validaciones de autorización, estado, cliente, doble conversión, precio y
fecha de negocio, copia `solicitudes.workflow_type` a `pedidos.workflow_type`,
crea `pedido_pagos` y confirma en conjunto la creación del pedido, la
actualización de la solicitud y la herencia de archivos. La Server Action solo
lee campos permitidos; la página enlaza `solicitud_id`, y la action delega y
revalida rutas.

## Archivos de solicitud

| Pieza | Archivo |
| --- | --- |
| Servicio | `src/lib/storage/list-solicitud-files.ts` |
| Componente | `src/components/storage/SolicitudFilesSection.tsx` |
| Descarga | `/dashboard/solicitudes/[id]/archivos/[fileId]/download` |

El detalle interno muestra archivos enviados desde el formulario público cuando existen. Los archivos siguen siendo privados en el bucket `godel-files`; la UI no recibe `file_path` ni URLs públicas.

La descarga se realiza con una ruta interna que valida la solicitud, el archivo, la pertenencia entre ambos y el bucket antes de generar una URL firmada de corta duración. `admin` y `supervisor` pueden descargar. `trabajador` no accede al módulo general de solicitudes y usuarios anónimos no pueden usar la ruta de descarga.

Si la solicitud se convierte en pedido, estos archivos conservan `solicitud_id` y también reciben `pedido_id` en `archivos`. Siguen apareciendo en el detalle interno de solicitud para `admin` y `supervisor`, y quedan disponibles desde el pedido generado como “Archivo enviado por cliente”.

Esta herencia modifica únicamente metadata en `public.archivos`. No cambia
`bucket`, `file_path`, `visibility`, `uploaded_by` ni mueve o copia objetos en
Storage. Si la actualización falla, la transacción revierte también el pedido y
la marca de conversión.

## Cambio de estado

| Pieza | Archivo |
| --- | --- |
| Server Action | `src/app/dashboard/solicitudes/[id]/actions.ts` |
| Servicio | `src/lib/solicitudes/update-internal-solicitud-status.ts` |
| Componente | `src/components/solicitudes/SolicitudStatusForm.tsx` |
| Helpers | `src/lib/solicitudes/status.ts` |
| RPC | `public.actualizar_estado_solicitud` |

El cambio de estado:

- requiere permiso `solicitudes.manage`;
- se valida server-side mediante `public.actualizar_estado_solicitud`;
- actualiza `status`;
- actualiza `reviewed_by`;
- registra `estado_cambiado` mediante el trigger de historial existente cuando el estado realmente cambia;
- revalida `/dashboard`, `/dashboard/solicitudes` y `/dashboard/solicitudes/[id]`;
- no usa service role key.

La RPC es la autoridad de transiciones. La UI solo muestra las opciones permitidas para orientar al usuario, pero los saltos inválidos también fallan server-side.

## Comentarios e historial de solicitudes

La Fase 11.2 agrega la base de datos y RLS para comentarios internos e historial operativo de solicitudes:

- `solicitud_comentarios`;
- `solicitud_historial`;
- `solicitud_historial_action`.

Estas tablas son internas y quedan reservadas para `admin` y `supervisor`. El rol `trabajador` no accede a comentarios ni historial de solicitudes, y usuarios anónimos tampoco acceden.

Los comentarios son append-only inicialmente: no hay actualización ni eliminación. El historial también es append-only.

La Fase 11.4 implementa comentarios internos en `/dashboard/solicitudes/[id]`. `admin` y `supervisor` pueden ver y agregar comentarios; el autor se toma del usuario autenticado en servidor mediante `solicitud_comentarios.author_id`. La página enlaza `solicitud_id` a la action y el formulario solo envía `content`; no acepta autor ni fecha, y no hay edición ni eliminación.

## Contrato de actions del detalle

La página server-side carga y valida la solicitud antes de enlazar
`solicitud_id` a las actions de estado, cliente, conversión y comentarios. Los
formularios no repiten el ID principal ni las actions lo reconstruyen desde
`referer`, `next-url` u otra cabecera.

Los IDs secundarios siguen siendo entradas explícitas cuando la operación los
necesita, como `cliente_id` al asociar un cliente existente. Las actions leen
solo campos permitidos, delegan autorización y escritura en servicios o RPCs,
y revalidan dashboard, listado y detalle.

La Fase 11.6 implementa historial visible en `/dashboard/solicitudes/[id]`. `admin` y `supervisor` pueden ver los eventos existentes en `solicitud_historial`; el rol `trabajador` no accede al módulo de solicitudes. La sección muestra tipo de evento, resumen, actor, rol y fecha, sin edición ni eliminación.

Desde Fase 11.7B, la base de datos registra automáticamente eventos de solicitud para creación, archivos adjuntados, cambios de estado, asociación de cliente y conversión a pedido. Desde Fase 13.8C, la RPC transaccional `public.crear_cliente_desde_solicitud` inserta `cliente_creado_desde_solicitud` antes de asociar el cliente; el update posterior activa el trigger de `cliente_asociado`. Los eventos originados en el flujo público pueden tener `actor_id = null`.

La sección de historial no se limita al texto genérico del evento: muestra detalles operativos cuando existen. Los cambios de estado indican origen y destino, los archivos muestran el nombre del archivo, los eventos de cliente muestran el cliente relacionado y la conversión muestra el pedido generado.

No hay comentarios públicos de clientes.

## Estados de solicitud

| Estado | Significado recomendado |
| --- | --- |
| `nueva` | Solicitud recibida y aún no revisada. |
| `en_revision` | El equipo interno está evaluando la solicitud. |
| `contactada` | El cliente fue contactado o se intentó contactar. |
| `aprobada` | Solicitud aceptada para avanzar hacia pedido. |
| `rechazada` | Solicitud no aceptada o descartada. |
| `convertida` | Solicitud ya convertida en pedido interno. |

## Transiciones manuales permitidas

El selector manual no permite cambios libres. Solo se aceptan estas transiciones:

- `nueva` -> `en_revision` o `rechazada`;
- `en_revision` -> `contactada` o `rechazada`;
- `contactada` -> `aprobada` o `rechazada`;
- `aprobada` -> `rechazada`.

`rechazada` y `convertida` son estados cerrados y no admiten cambios manuales. `convertida` no aparece en el selector ni se acepta en la RPC manual; ese estado queda reservado para el flujo formal de conversión a pedido.

## Permisos

| Rol | Acceso |
| --- | --- |
| `admin` | Puede ver y gestionar solicitudes. |
| `supervisor` | Puede ver y gestionar solicitudes. |
| `trabajador` | No puede acceder al módulo general de solicitudes. Puede ver datos de solicitudes relacionadas con pedidos asignados desde el detalle del pedido. |

Permisos usados:

- `solicitudes.view`: lectura de listado y detalle.
- `solicitudes.manage`: cambio manual de estado.
- `clientes.manage`: creación de cliente desde una solicitud.
- `pedidos.manage`: conversión de solicitud aprobada a pedido.

El modelo completo de permisos se documenta conceptualmente en
`docs/PERMISSIONS_MODEL.md`.

## Seguridad

El flujo usa varias capas de protección:

1. Proxy de rutas por rol.
2. Validación server-side de perfil y permisos.
3. RLS en Supabase.
4. Errores controlados sin exponer detalles técnicos.

Aclaraciones:

- no se usa service role key;
- los componentes cliente no consultan Supabase directamente;
- la UI no es la única capa de seguridad;
- no hay lectura pública ni URLs públicas para archivos;
- la RPC de conversión es `security definer`, valida usuario activo y rol
  `admin` o `supervisor`, y solo concede ejecución a `authenticated`;
- la RPC de creación de cliente desde solicitud aplica las mismas restricciones
  de autenticación y rol, y no acepta datos de cliente desde el formulario;
- no se modificaron policies RLS; siguen protegiendo los accesos directos a
  tablas fuera de la RPC.

## RLS

Las policies existentes permiten:

- lectura de solicitudes a `admin` y `supervisor`;
- lectura de solicitudes a `trabajador` solo cuando la solicitud está relacionada con un pedido asignado;
- actualización de solicitudes a `admin` y `supervisor`;
- bloqueo de acceso del `trabajador` al módulo general de solicitudes y bloqueo de actualización;
- bloqueo de lectura pública anónima;
- inserción pública limitada solo para crear solicitudes nuevas desde el
  formulario público.
- lectura e inserción de `solicitud_comentarios` solo a `admin` y `supervisor`;
- lectura e inserción de `solicitud_historial` solo a `admin` y `supervisor`;
- sin policies de actualización ni eliminación para comentarios o historial de solicitudes.

El código de seguimiento mostrado al equipo interno es siempre
`solicitudes.public_reference`. Las referencias cortas derivadas del UUID pueden
usarse como identificadores internos, pero no deben compartirse como código
público. Si la solicitud ya fue convertida, ese mismo código resuelve el pedido
asociado en `/estado`.

## Fuera del alcance actual

- eliminación de archivos adjuntos;
- edición completa de solicitudes;
- notificaciones;
- generación de presupuestos;
- deduplicación avanzada de clientes;
- validaciones avanzadas adicionales para consulta pública, como captcha,
  rate limiting o verificación complementaria por teléfono.

## Consideraciones futuras

Mejoras futuras posibles:

- permitir eliminación controlada de archivos privados;
- notificar al equipo interno;
- generar códigos humanos de referencia;
- ampliar filtros o búsqueda si aumenta el volumen.

El diseño técnico de comentarios internos e historial para la Fase 11 se documenta en `docs/COMMENTS_AND_HISTORY_MODEL.md`.

El diseño del dashboard operativo para la Fase 13 se documenta en `docs/DASHBOARD_OPERATIVE_MODEL.md`. Las métricas futuras de solicitudes deben estar disponibles solo para `admin` y `supervisor`; el trabajador no debe recibir solicitudes generales desde el dashboard.

## Pruebas manuales recomendadas

- Admin ve el listado de solicitudes.
- Supervisor ve el listado de solicitudes.
- Trabajador no puede entrar a `/dashboard/solicitudes`.
- Buscar solicitudes por referencia, cliente, teléfono, correo, servicio y descripción.
- Filtrar por `Encargo` y por `Impresión`.
- Combinar estado y tipo de solicitud.
- Combinar `q`, estado y tipo, y luego limpiar todos los filtros.
- Forzar un `workflow_type` inválido y confirmar que se ignora con advertencia.
- Admin abre el detalle de una solicitud.
- Supervisor abre el detalle de una solicitud.
- Admin descarga un archivo de solicitud.
- Supervisor descarga un archivo de solicitud.
- Verificar que no se muestra `file_path`.
- Verificar que un archivo de otra solicitud no descarga desde este detalle.
- Un id inválido muestra 404.
- Admin cambia el estado de una solicitud.
- Supervisor cambia el estado de una solicitud.
- Solicitud `nueva` permite pasar a `en_revision` o `rechazada`.
- Solicitud `nueva` no permite pasar directo a `aprobada`.
- Solicitud `en_revision` permite pasar a `contactada` o `rechazada`.
- Solicitud `contactada` permite pasar a `aprobada` o `rechazada`.
- Solicitud `aprobada` permite rechazar o convertir a pedido.
- `convertida` no aparece en el selector.
- Solicitud `convertida` no permite cambios manuales.
- Solicitud `rechazada` no permite cambios manuales.
- Un intento manipulado de enviar `convertida` falla server-side.
- En Supabase Studio, `reviewed_by` se actualiza al cambiar estado.
- `converted_order_id` no se modifica durante cambios manuales de estado.
- Convertir un encargo aprobado con cliente asociado exige título, descripción y prioridad.
- Convertir una impresión aprobada muestra `Pedido de impresión` como título inicial.
- Vaciar el título de una impresión y confirmar que el servidor usa `Pedido de impresión`.
- Vaciar la descripción de una impresión y confirmar que el servidor conserva la descripción de la solicitud.
- Confirmar que encargo e impresión conservan su `workflow_type` en el pedido creado.
- Confirmar que la prioridad inicia en `normal`.
- Convertir sin fecha estimada y confirmar que el pedido queda sin fecha.
- Convertir con fecha estimada de hoy o futura y confirmar que se guarda.
- Forzar una fecha estimada pasada y confirmar error server-side.
- La creación manual de pedidos puede quedar sin cliente asociado.
- Intentar convertir sin título muestra error.
- Confirmar que el pedido creado usa el título escrito, no `service_type`.
- Confirmar que la descripción del pedido se guarda correctamente.

## Cierre

El flujo interno vigente cubre revisión, estados controlados, cliente asociado,
distinción entre Encargo e Impresión, comentarios, historial, archivos privados
y conversión transaccional a pedido.
