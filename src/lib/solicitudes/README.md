# Solicitudes públicas

Esta carpeta contiene la lógica server-side del flujo público e interno de solicitudes.

## Listado interno

`listInternalSolicitudes` acepta `q` y `status`. La búsqueda server-side cubre la referencia corta visible, nombre, teléfono y correo del cliente, tipo de servicio, descripción y notas. Los labels visibles de servicio se traducen a los valores almacenados para búsquedas como “diseño”.

La búsqueda se combina con el filtro de estado, conserva ambos parámetros GET en la UI, limita y normaliza el texto recibido y respeta el permiso `solicitudes.view` y RLS. La barra común actualiza `q` tras 200 ms sin escritura, aplica el estado inmediatamente, muestra `Buscando...` durante la espera y permite limpiar ambos filtros; la consulta continúa server-side. No forma parte de un buscador global.

## Flujo público

El cliente externo puede enviar datos básicos de contacto y del trabajo solicitado sin tener cuenta de usuario. La solicitud se valida en el servidor y se inserta en Supabase con `status = "nueva"`.

`PublicSolicitudForm` consume la Server Action `submitPublicSolicitudAction` desde `/solicitud`. El componente cliente captura campos públicos, archivos opcionales y muestra estado de envío, errores y confirmación. No consulta Supabase directamente.

Por seguridad, el flujo público no usa service role key. La inserción se hace con el cliente normal de Supabase y depende de RLS.

## Campos validados

- `client_name`
- `client_phone`
- `client_email`
- `service_type`
- `description`
- `desired_date`
- `notes`
- `files`

Los campos se recortan, los opcionales vacíos se convierten a `null`, y se validan longitudes razonables, formato básico de correo y fecha válida. `desired_date` es opcional, pero si se informa debe ser igual o posterior al día actual. La validación definitiva ocurre en servidor.

La fecha deseada se valida con los helpers centralizados de `src/lib/validators/date.ts`, apoyados en `src/lib/utils/date.ts` para calcular el día actual local. El `min` del formulario público es solo una ayuda de UI; la regla real sigue estando en la validación server-side.

`quantity` fue eliminado de solicitudes. Las cantidades, medidas y requisitos deben explicarse dentro de `description` o `notes`; `service_type` queda como referencia inicial del tipo de trabajo.

El formulario no acepta campos sensibles como `id`, `status`, `cliente_id`, `reviewed_by` ni `converted_order_id`.

## Archivos opcionales

El formulario público puede recibir hasta 5 archivos opcionales de referencia. Los archivos se procesan server-side después de crear la solicitud y se asocian a esa solicitud mediante `archivos.solicitud_id`.

Reglas principales:

- la solicitud puede enviarse sin archivos;
- la categoría se fuerza a `cliente_solicitud`;
- los archivos se guardan en el bucket privado `godel-files`;
- la ruta se construye como `solicitudes/{solicitud_id}/originales/{timestamp}-{uuid}-{filename}`;
- `pedido_id` queda en `null`;
- `uploaded_by` queda en `null`;
- no hay lectura pública, listado público ni URLs públicas;
- `admin` y `supervisor` pueden consultarlos y descargarlos desde el detalle interno de solicitud mediante rutas internas seguras.

La solicitud se crea antes de asociar archivos. Si la solicitud se registra correctamente pero algún archivo falla durante la subida, la solicitud se conserva y la UI muestra una advertencia segura.

El límite de cinco también se aplica en las policies anónimas: Storage bloquea
el sexto objeto secuencial y `archivos` mantiene un máximo estricto de cinco
metadatos con conteo serializado. Las policies validan ruta, 20 MB y
combinación de extensión/MIME; la metadata solo se acepta si el objeto exacto
existe y aún no está registrado. Las subidas paralelas conservan un riesgo
residual en el conteo físico de Storage y requieren monitoreo/reconciliación en
producción.

No hay lectura, listado ni borrado anónimo. Por ello un fallo excepcional entre
la subida y la metadata no se compensa abriendo permisos públicos: el objeto
queda sujeto al cupo y debe resolverse mediante reconciliación interna.

## Labels visibles

Los valores técnicos o históricos de `service_type` se renderizan mediante `labels.ts`. La UI debe usar `getSolicitudServiceTypeLabel` para mostrar tildes y `ñ` correctamente sin cambiar el valor guardado en la solicitud.

## Consultas internas

`listInternalSolicitudes` carga el listado server-side para `/dashboard/solicitudes`. Requiere un usuario interno activo con permiso `solicitudes.view`, valida el rol con los helpers de permisos existentes y usa el cliente normal de Supabase, sin service role key.

`getInternalSolicitudById` carga server-side el detalle para `/dashboard/solicitudes/[id]`. Valida que el identificador tenga formato UUID, requiere permiso `solicitudes.view` y consulta Supabase con el cliente normal, sin service role key.

## Cambio de estado

`updateInternalSolicitudStatus` cambia server-side el estado operativo de una solicitud desde la action de `/dashboard/solicitudes/[id]`. Requiere usuario interno activo con permiso `solicitudes.manage`, valida el UUID, rechaza `convertida` como estado manual y delega la transición en la RPC segura `public.actualizar_estado_solicitud`.

Transiciones manuales permitidas:

- `nueva` -> `en_revision` o `rechazada`;
- `en_revision` -> `contactada` o `rechazada`;
- `contactada` -> `aprobada` o `rechazada`;
- `aprobada` -> `rechazada`.

`rechazada` y `convertida` son estados cerrados. `convertida` no aparece en el formulario ni se acepta en servidor; queda reservada para el flujo formal de conversión a pedido. Si el estado enviado es igual al actual, la RPC retorna sin duplicar historial.

## Conversión a pedido

Una solicitud aprobada con cliente asociado puede convertirse en pedido desde el detalle interno de la solicitud.

El estado `convertida` no se establece manualmente desde el selector de estado. Se establece mediante la RPC transaccional `public.convertir_solicitud_a_pedido`, que crea un pedido, relaciona `pedidos.solicitud_id`, actualiza `solicitudes.converted_order_id` y deja la solicitud en estado `convertida`.

La conversión exige que el usuario interno defina `title`, `description` y `priority` para el pedido. `priority` inicia visualmente en `normal` y se valida contra las prioridades reales de pedido. `estimated_delivery_date` es opcional, pero si se informa debe ser igual o posterior al día actual; se valida con `src/lib/validators/date.ts` y nuevamente en la RPC con la fecha de negocio de `America/Havana`.

`service_type` queda como referencia inicial del cliente y no se usa como título automático. La descripción del pedido se puede ajustar desde la descripción original de la solicitud antes de crear el pedido. La conversión no envía `order_number`; la base de datos lo asigna con formato `P-YY-XXXX`. El estado inicial sigue siendo `solicitud_recibida`.

La RPC bloquea la solicitud durante la decisión, valida nuevamente usuario
activo, rol, estado, cliente, doble conversión y fecha estimada, y completa
también `archivos.pedido_id` para los archivos `cliente_solicitud`. No cambia
rutas ni objetos de Storage. Ante cualquier error, todas las escrituras se
revierten.

## Asociación solicitud-cliente

`associateSolicitudWithCliente` asocia una solicitud con un cliente existente. Requiere `solicitudes.manage` y `clientes.view`, valida UUID de solicitud y cliente, verifica que ambos registros existan y actualiza únicamente `solicitudes.cliente_id`.

`createClienteFromSolicitudAndAssociate` crea un cliente básico desde los datos ya guardados en la solicitud (`client_name`, `client_phone`, `client_email`) y lo asocia automáticamente. Requiere `solicitudes.manage` y `clientes.manage`, conserva la validación de UX y delega la escritura en la RPC transaccional `public.crear_cliente_desde_solicitud`.

La action solo envía `solicitud_id`; no acepta nombre, teléfono, correo, notas,
actor ni otros campos técnicos. La RPC bloquea la solicitud con `FOR UPDATE`,
valida de nuevo usuario activo, rol, asociación previa y datos mínimos, y
confirma o revierte en conjunto el cliente, el historial y la asociación.

Las actions del detalle de solicitud son:

- `associateSolicitudClienteAction`
- `createClienteFromSolicitudAction`

No se usa service role key y no se implementa deduplicación avanzada. La
asociación de un cliente existente conserva su servicio separado y su capacidad
de reemplazar explícitamente la relación.

## Comentarios internos

`listSolicitudComments` carga server-side los comentarios internos mediante la RPC segura `public.listar_solicitud_comentarios`. Requiere usuario interno activo con permiso `solicitudes.view`, valida UUID, confirma acceso a la solicitud y recibe solo datos mínimos del autor: nombre y rol.

`createSolicitudComment` agrega comentarios internos append-only. Requiere `solicitudes.manage`, valida UUID, confirma acceso a la solicitud, valida content no vacío con máximo de 2000 caracteres e inserta en `solicitud_comentarios` usando `author_id = profile.id`.

La action `createSolicitudCommentAction` lee únicamente `solicitud_id` y `content`. No acepta autor ni fechas desde el formulario. No hay edición, eliminación, menciones, notificaciones, adjuntos ni registro automático de historial en esta subfase.

## Historial visible

`listSolicitudHistory` carga server-side el historial interno mediante la RPC segura `public.listar_solicitud_historial`. Requiere usuario interno activo con permiso `solicitudes.view`, valida UUID, confirma acceso a la solicitud y recibe solo datos mínimos del actor cuando existe `actor_id`: nombre y rol.

`SolicitudHistorySection` muestra los eventos existentes en `solicitud_historial` dentro del detalle interno de solicitud. La sección muestra tipo de evento, resumen, actor, rol y fecha. Si `actor_id` es `null`, el evento se muestra como “Evento automático”.

El historial se muestra con el evento más reciente primero. La tabla `solicitud_historial` usa `created_at default clock_timestamp()` para que eventos insertados muy cerca entre sí conserven un timestamp real de ejecución. La RPC ordena por `created_at desc` y usa `id desc` solo como desempate secundario; no hay reordenamiento visual manual en TypeScript.

Para mantener el mismo nivel de detalle que el historial de pedidos, la sección usa `summary`, `old_value`, `new_value`, `metadata` y relaciones mínimas cuando están disponibles: estados anterior/nuevo, nombre del archivo, cliente relacionado y pedido generado.

El historial es append-only. No hay edición, eliminación ni notificaciones.

Desde Fase 11.7B, la base de datos registra automáticamente:

- `solicitud_creada` al insertar una solicitud;
- `archivos_adjuntados` al registrar archivos públicos de solicitud;
- `estado_cambiado` al cambiar el estado interno;
- `cliente_asociado` al asociar un cliente;
- `convertida_a_pedido` al convertir una solicitud a pedido.

El evento `cliente_creado_desde_solicitud` se registra dentro de
`public.crear_cliente_desde_solicitud` después de crear el cliente y antes de
asociarlo. Luego la actualización de `solicitudes.cliente_id` dispara una sola
vez `cliente_asociado`. Como el historial visible se muestra con el evento más
reciente primero, el usuario ve primero “Cliente asociado” y después “Cliente
creado desde la solicitud”. Si cualquier registro de historial o asociación
falla, la transacción revierte también la creación del cliente.

## Alcance excluido

- No hay lectura ni descarga pública de archivos.
- No se convierte automáticamente la solicitud en pedido fuera del flujo formal.
- No se implementa deduplicación inteligente de clientes.
