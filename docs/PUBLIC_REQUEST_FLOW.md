# Flujo de Solicitudes Públicas — Godel Diseño

## Propósito

Este documento describe cómo un cliente externo envía una solicitud pública de
trabajo desde `/solicitud` dentro del sistema web de gestión operativa de Godel
Diseño.

El objetivo es dejar documentado el flujo actual, los datos que se guardan, las
validaciones aplicadas, las decisiones técnicas tomadas y lo que queda pendiente
para fases posteriores.

## Alcance actual

El flujo actual permite:

- Mostrar un formulario público en `/solicitud`.
- Validar los datos enviados por el cliente.
- Crear una solicitud en Supabase.
- Adjuntar archivos de referencia opcionales en encargos y obligatorios en
  impresiones.
- Guardar la solicitud con estado `nueva`.
- Registrar `public_reference` con formato `GD-XXXX-XXXX` y devolverlo desde la
  Server Action.
- Mostrar un mensaje de éxito con el código público de seguimiento.
- Permitir copiar el código desde la interfaz.

Todavía no incluye:

- Captcha.
- Asociación inteligente con clientes.
- Notificaciones automáticas.
- Descarga pública de archivos.
- Página pública de consulta de estado por referencia.

## Tipo de flujo operativo

`/solicitud` permite elegir mediante pestañas entre `Encargo personalizado` e
`Impresión`. Ambas variantes crean registros en la misma tabla `solicitudes`;
la diferencia formal se guarda en `workflow_type`.

`encargo` representa trabajos personalizados o complejos y conserva el
formulario general. `impresion` representa trabajos directos de impresión,
exige al menos un archivo y solicita cantidad de copias, modo de color, tamaño
de papel, caras y observaciones opcionales.

Los detalles de impresión se validan y se serializan server-side en una
descripción estructurada. No se crean tablas normalizadas específicas de
impresión en esta subfase.

## Ruta pública

- Ruta: `/solicitud`.
- No requiere autenticación.
- Está disponible para clientes externos.
- No pertenece al dashboard interno.

## Campos del formulario

| Campo | Requerido | Descripción |
|---|---|---|
| `workflow_type` | Sí | Variante validada: `encargo` o `impresion` |
| `client_name` | Sí | Nombre del cliente o negocio |
| `client_phone` | Sí | Teléfono de contacto |
| `client_email` | No | Correo opcional |
| `service_type` | En encargo | Tipo de trabajo solicitado |
| `description` | En encargo | Descripción del encargo, incluyendo cantidades, medidas o requisitos cuando apliquen |
| `desired_date` | No | Fecha deseada del encargo; si se informa debe ser igual o posterior al día actual |
| `print_copies` | En impresión | Cantidad entera entre 1 y 10000 |
| `print_color_mode` | En impresión | Blanco y negro o color |
| `print_paper_size` | En impresión | Carta, A4, Oficio u Otro |
| `print_sides` | En impresión | Una cara o doble cara |
| `notes` | No | Observaciones adicionales |
| `files` | En impresión | Opcional en encargos y obligatorio en impresiones |

`quantity` sigue eliminado de la tabla `solicitudes`. Los encargos indican sus
cantidades dentro de `description` o `notes`; la variante de impresión usa
`print_copies` solo como input y lo integra en la descripción estructurada, sin
crear una columna nueva.

## Campos que no acepta la UI

El formulario público no envía:

- `id`
- `public_reference`
- `status`
- `cliente_id`
- `reviewed_by`
- `converted_order_id`

Estos campos son controlados por el servidor, por la base de datos o por flujos
internos posteriores. La UI pública no debe aceptar valores para ellos.

## Validación Server-Side

La validación definitiva está en:

- `src/lib/solicitudes/public-request-validation.ts`

Reglas generales:

- `client_name` es requerido.
- `client_phone` es requerido.
- `client_email` es opcional, pero si existe debe tener formato básico válido.
- `workflow_type` es requerido y solo admite `encargo` o `impresion`.
- En encargos, `service_type` y `description` son requeridos.
- En impresiones, cantidad, color, papel, caras y al menos un archivo son
  requeridos.
- La descripción de impresión se construye en servidor y no se acepta como
  fuente de verdad desde un campo oculto del cliente.
- `desired_date` es opcional, pero debe ser válida e igual o posterior al día
  actual si existe.
- `notes` es opcional.
- Los campos opcionales vacíos se convierten a `null`.
- Los espacios sobrantes se recortan antes de insertar.

La validación de `desired_date` usa los helpers de fecha de
`src/lib/validators/date.ts`, apoyados en `src/lib/utils/date.ts` para calcular
el día actual local. Trabaja con valores `YYYY-MM-DD` de inputs HTML y evita
convertir a UTC con `toISOString()`.

`service_type` funciona como referencia inicial del cliente; el detalle real del trabajo vive en `description` y, si hace falta, en `notes`.

No se usan dependencias externas para esta validación.

## Server Action

El formulario usa:

- `src/app/solicitud/actions.ts`

La Server Action:

- Recibe `FormData`.
- Convierte los campos del formulario en input controlado.
- Valida `workflow_type` como input no confiable.
- Exige al menos un archivo antes de crear una solicitud de impresión.
- No lee ni devuelve `quantity`.
- Llama al servicio de creación.
- Devuelve errores controlados para la UI.
- No expone errores técnicos de Supabase al cliente.
- No usa service role key.
- Procesa los archivos después de crear la solicitud; son opcionales en
  encargos y obligatorios en impresiones.
- No genera URLs públicas ni URLs firmadas para el cliente.

## Servicio de Creación

El servicio está en:

- `src/lib/solicitudes/create-public-solicitud.ts`

Responsabilidades:

- Validar el input recibido.
- Crear la solicitud en Supabase.
- Guardar `workflow_type` según la variante validada.
- Construir server-side la descripción estructurada para impresiones.
- Insertar el detalle del trabajo sin agregar columnas específicas de
  impresión.
- Establecer siempre `status = "nueva"`.
- Establecer `cliente_id = null`.
- Establecer `reviewed_by = null`.
- Establecer `converted_order_id = null`.
- Generar server-side un `public_reference` no secuencial con formato
  `GD-XXXX-XXXX` para devolverlo sin hacer lectura publica anonima.
- La base de datos tambien tiene default para `public_reference` y valida el
  formato como respaldo para otros inserts.
- No usar el UUID interno ni sus primeros caracteres como codigo publico.
  La lectura publica de solicitudes sigue cerrada por RLS.
- Evitar un `.select()` público innecesario después del insert.

Desde Fase 11.7B, la inserción de la solicitud registra automáticamente el evento `solicitud_creada` en `solicitud_historial`. Como el flujo es público, normalmente queda con `actor_id = null` y metadata mínima no sensible.

La conversión interna conserva el `workflow_type` de la solicitud. En encargos,
el equipo define el título operativo; en impresiones se usa el título
predeterminado `Pedido de impresión` y se conserva la descripción estructurada.
`service_type` queda como referencia descriptiva del servicio y no decide el
flujo ni el título del pedido.

## Decisión sobre clientes

El flujo público no crea ni asocia automáticamente un registro en `clientes`.
La decisión vigente es:

- Guardar los datos del cliente desnormalizados en la tabla `solicitudes`.
- Dejar `cliente_id = null`.
- Permitir que el equipo asocie un cliente existente o cree uno desde el detalle
  interno de la solicitud.
- Evitar abrir inserción pública en `clientes` para este flujo.

La creación de cliente desde solicitud y la conversión posterior a pedido son
operaciones internas transaccionales. La deduplicación inteligente sigue fuera
del alcance actual.

## Referencia pública

Toda solicitud guarda `public_reference`, un código público no secuencial con
formato `GD-XXXX-XXXX`.

Esta referencia:

- no es el UUID interno;
- no se deriva del `id`;
- no es `order_number`;
- no usa numeración secuencial;
- se guarda en mayúsculas;
- se muestra en el mensaje de éxito del formulario público;
- se puede copiar desde la interfaz mediante un botón accesible.

La página pública de consulta de estado todavía no existe en esta subfase. El
código se muestra para conservarlo y usarlo cuando la consulta pública de estado
se implemente en subfases posteriores.

## Seguridad y RLS

El flujo depende de Row Level Security en Supabase.

Estado esperado:

- Usuarios anónimos pueden insertar solicitudes públicas.
- Usuarios anónimos no pueden leer solicitudes.
- Usuarios anónimos no pueden actualizar solicitudes.
- Usuarios anónimos no pueden eliminar solicitudes.
- No hay lectura pública de clientes.
- No se usa service role key.
- RLS protege la base de datos.
- Los errores técnicos no se exponen al cliente.

La UI pública no debe considerarse una frontera de seguridad. La validación
server-side y RLS son la fuente de verdad.

## Relación con archivos

El cliente puede adjuntar archivos de referencia al enviar la solicitud. Son
opcionales para encargos y se exige al menos uno para impresiones.

Límites actuales:

- máximo 5 archivos por solicitud;
- máximo 20 MB por archivo;
- formatos permitidos: PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX y ZIP.

Los archivos:

- se guardan en el bucket privado `godel-files`;
- usan rutas `solicitudes/{solicitud_id}/originales/{timestamp}-{uuid}-{filename}`;
- quedan asociados a la solicitud creada mediante `archivos.solicitud_id`;
- se registran con `visibility = cliente_solicitud`;
- no generan URLs públicas ni URLs firmadas para el cliente.

El límite de cinco no depende solo de la UI o TypeScript. Storage rechaza el
sexto objeto en el flujo secuencial y la policy de `archivos` serializa el
conteo para impedir más de cinco metadatos, incluso mediante llamadas directas
con la anon key. También validan ruta y combinación de extensión/MIME. Los
20 MB se aplican en TypeScript, en el bucket y en la policy de metadata. La
metadata requiere que el objeto exacto exista y no esté registrado.

Supabase Storage puede autorizar subidas paralelas antes de completar los
objetos, por lo que su conteo no se considera una garantía concurrente absoluta.
Metadata sí mantiene el máximo estricto de cinco. Rate limiting, monitoreo y
reconciliación completan esta defensa antes de producción.

La aplicación sube primero el objeto y después inserta metadata. No se habilita
borrado anónimo para compensar un fallo excepcional, porque la API de Storage
requeriría abrir también lectura sobre esos objetos. El cupo de cinco limita el
impacto y la limpieza queda a cargo de una reconciliación interna segura.

Desde Fase 11.7B, cada archivo público registrado en `archivos` con `visibility = cliente_solicitud` genera un evento `archivos_adjuntados` en `solicitud_historial`. El evento no incluye `file_path` ni datos personales completos.

La gestión interna permite que `admin` y `supervisor` vean y descarguen estos archivos desde el detalle interno de solicitud mediante URLs firmadas de corta duración. Esa descarga no está disponible para clientes públicos.

Si la solicitud se convierte en pedido, los archivos se heredan por metadatos: se conserva la ruta física original y se completa `archivos.pedido_id` con el pedido generado. No se mueve ni se copia el objeto en Storage.

## Flujo Funcional Actual

1. Cliente entra a `/solicitud`.
2. Elige `Encargo personalizado` o `Impresión`.
3. Completa los campos de la variante seleccionada.
4. El componente cliente llama a la Server Action.
5. La action convierte `FormData` en input y valida los archivos.
6. El servicio valida los datos y construye la descripción de impresión cuando aplica.
7. El servicio inserta la solicitud con estado `nueva`.
8. La base de datos registra `solicitud_creada` en el historial interno.
9. Si hay archivos, la action los valida, sube al bucket privado y registra metadatos.
10. La base de datos registra `archivos_adjuntados` por cada archivo aceptado.
11. La UI muestra éxito, el `public_reference` con opción de copiar y la
    cantidad de archivos recibidos.
12. El equipo interno revisa la solicitud desde el dashboard.

## Relación con el flujo interno

El listado, detalle, archivos, comentarios, historial y conversión a pedido se gestionan desde el dashboard interno. Los valores visibles de `service_type` deben mostrarse mediante los labels centralizados de `src/lib/solicitudes/labels.ts`, sin cambiar el valor técnico guardado en la solicitud.

## Pruebas Manuales Recomendadas

- Enviar solicitud válida.
- Enviar formulario vacío.
- Enviar email inválido.
- Enviar sin email.
- Enviar una solicitud con cantidades escritas en la descripción.
- Enviar solicitud sin archivos.
- Enviar solicitud con 1 archivo válido.
- Intentar enviar más de 5 archivos.
- Intentar enviar archivo no permitido.
- Intentar enviar archivo mayor de 20 MB.
- Verificar en Supabase Studio que la solicitud quedó con `status = nueva`.
- Verificar que `cliente_id`, `reviewed_by` y `converted_order_id` quedan en
  `null`.
- Verificar que los archivos quedan bajo `solicitudes/{id}/originales/`.
- Verificar que `pedido_id` y `uploaded_by` quedan en `null` en `archivos`.
- Verificar que no hay lectura pública ni URL pública del archivo.
- Verificar que un usuario anónimo no puede leer solicitudes desde API/UI.
- Intentar un sexto objeto y un sexto registro de metadata mediante anon key.
- Intentar registrar metadata para un objeto inexistente o ya registrado.
- Confirmar que `anon` no puede listar, descargar ni eliminar objetos.

## Problemas Conocidos o Limitaciones

- No hay captcha todavía.
- No hay control avanzado anti-spam.
- No hay rate limiting por IP o reverse proxy.
- No hay antivirus ni inspección profunda del contenido.
- La limpieza periódica de objetos sin metadata debe prepararse antes de producción.
- No hay lectura ni descarga pública de archivos.
- No hay notificaciones.
- No hay asociación automática con clientes.
- No hay seguimiento público por referencia.
- No hay página `/estado` ni consulta pública de estado.

## Cierre

El flujo público queda conectado con la gestión interna de solicitudes, archivos privados, historial y conversión formal a pedido.
