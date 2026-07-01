# Capa de Storage

Esta carpeta concentra la lógica reutilizable para trabajar con archivos privados de Godel Diseño.

## Alcance actual

- Constantes del bucket privado `godel-files`.
- Tipos internos para categorías, rutas, validación y URLs firmadas.
- Sanitización de nombres de archivo.
- Construcción de rutas internas para solicitudes y pedidos.
- Validación compartida para subidas públicas e internas.
- Helper server-side para generar URLs firmadas de corta duración desde `archivo.id`.
- Listado de archivos internos de pedido con RLS.
- Subida interna de archivos de pedido desde Server Actions.
- Descarga de archivos de pedido mediante route handler y signed URL.
- Subida pública controlada de archivos de solicitud.
- Listado y descarga interna de archivos de solicitud.

## Bucket privado

El sistema usa el bucket privado `godel-files`. No se usan buckets públicos ni URLs públicas permanentes.

## Rutas internas

Las rutas se construyen desde datos controlados por la aplicación. No se debe aceptar un `file_path` enviado directamente por el usuario.

```text
solicitudes/{solicitud_id}/originales/{timestamp}-{uuid}-{filename}
pedidos/{pedido_id}/internos/{timestamp}-{filename}
pedidos/{pedido_id}/avances/{timestamp}-{filename}
pedidos/{pedido_id}/finales/{timestamp}-{filename}
```

## Validación

La validación base exige archivo existente, nombre seguro, tamaño mayor que cero, tamaño máximo permitido, MIME permitido, extensión permitida y contexto válido según categoría.

No se aceptan ejecutables, scripts, HTML ni SVG. Formatos de diseño como AI, PSD o CDR quedan pendientes porque sus MIME types no son confiables sin validación adicional.

## Relacion TS/SQL

Las reglas de Storage se validan en dos capas. TypeScript mejora UX, mensajes y
control de entrada antes de subir archivos; SQL, RLS y policies de Storage son
la defensa final.

| Regla | TypeScript | SQL / policy relacionada |
|---|---|---|
| Bucket privado | `GODEL_FILES_BUCKET` | Bucket `godel-files` privado y constraint `archivos_bucket_godel_files_check`. |
| Tamano maximo | `MAX_STORAGE_FILE_SIZE_BYTES` | `file_size <= 20971520` y `storage.buckets.file_size_limit`. |
| MIME/extensiones | `ALLOWED_STORAGE_MIME_TYPES`, `ALLOWED_STORAGE_FILE_EXTENSIONS` y mapa MIME por extension | `private.is_allowed_public_request_file_type` y allowed MIME types del bucket. |
| Extensiones bloqueadas | `BLOCKED_STORAGE_FILE_EXTENSIONS` | Defensa previa en TS; SQL solo permite allowlist positiva. |
| Rutas de pedido | `buildPedidoFilePath` | `private.storage_order_id`, `private.storage_order_category` y `private.pedido_file_path_matches`. |
| Rutas de solicitud | `buildSolicitudFilePath` | `private.storage_request_id` y policy anonima de solicitudes publicas. |
| Categoria por estado | `getPedidoFileVisibilityForStatus` | `private.pedido_file_visibility_for_status`. |

Cuando cambie cualquiera de estas reglas, la fase debe revisar TypeScript, SQL,
policies, documentacion y QA juntos para evitar drift. Esta subfase no cambia
limites, MIME, extensiones, carpetas, categorias ni formato de `file_path`.

## URLs firmadas

`createSignedFileUrl(fileId)` consulta `archivos` con RLS mediante el cliente server-side normal de Supabase y genera una signed URL de corta duración. No usa service role key y no recibe rutas directas desde la interfaz.

Los route handlers de descarga validan que el archivo pertenezca al pedido o solicitud de la ruta antes de redirigir a la signed URL.

## DTOs seguros de listado

Los listados de archivos devuelven DTOs por allowlist. No devuelven
`file_path`, bucket, rutas privadas, signed URLs ni metadata cruda.

`PedidoFileListItem` expone solo:

- `id`
- `file_name`
- `file_type`
- `file_size`
- `visibility`
- `created_at`
- `uploaded_by`
- `uploadedBy` con `id`, `full_name` y `role`

`SolicitudFileListItem` expone solo:

- `id`
- `file_name`
- `file_type`
- `file_size`
- `visibility`
- `created_at`

`uploadedBy` se mantiene unicamente en archivos de pedido porque esa pantalla
necesita distinguir archivos del cliente y archivos subidos por usuarios
internos. Los archivos de solicitud conservan un DTO mas minimo.

## Archivos de pedido

`listPedidoFiles(pedidoId)` lista metadatos seguros de `archivos` para un pedido, sin devolver `file_path` ni URLs públicas al componente cliente.

`uploadPedidoFile(input)` recibe únicamente `pedidoId` y el archivo real. Valida usuario interno activo y acceso al pedido, carga su estado mediante RLS, deriva la categoría server-side, valida nombre seguro, MIME, extensión y tamaño, construye la ruta y guarda el objeto en el bucket privado `godel-files` antes de insertar sus metadatos en `archivos`.

Categoría automática por estado:

| Estado del pedido | Categoría | Carpeta |
|---|---|---|
| `creado`, `solicitud_recibida`, `en_revision` | `interno_pedido` | `internos` |
| `en_produccion` | `avance` | `avances` |
| `listo_entrega` | `final_entrega` | `finales` |
| `entregado`, `cancelado` | Subida bloqueada | — |

`admin`, `supervisor` y cualquier trabajador asignado pueden subir la categoría correspondiente mientras el estado lo permita. Un trabajador no asignado no puede cargar el pedido ni subir archivos por las validaciones server-side, RLS y policies de Storage.

El formulario no envía `visibility`, categoría, bucket, ruta, usuario, nombre, MIME ni tamaño como fuente de verdad. La policy de `archivos` y la policy de `storage.objects` vuelven a comprobar que el estado actual coincida con la categoría y la carpeta derivadas.

## Archivos públicos de solicitud

`uploadPublicSolicitudFile(input)` procesa archivos enviados por clientes externos. La función fuerza la categoría `cliente_solicitud`, usa la ruta `solicitudes/{solicitud_id}/originales/{timestamp}-{uuid}-{filename}` y guarda metadatos en `archivos` con `pedido_id = null` y `uploaded_by = null`.

`uploadPublicSolicitudFiles(input)` sube varios archivos uno por uno y limita
la cantidad a 5 archivos opcionales por solicitud. Admite PDF, JPG, JPEG, PNG,
WEBP, DOC, DOCX y ZIP, con un máximo de 20 MB por archivo.

La migración consolidada permite a `anon` insertar objetos y metadatos solo
para rutas válidas de solicitudes públicas. Desde Fase 13.8E, Storage bloquea
el sexto objeto secuencial y metadata aplica un máximo estricto de cinco con
conteo serializado. Ambas capas validan la combinación extensión/MIME. Los
20 MB se aplican en TypeScript, en el bucket y en la policy de metadata; esta
última exige además un objeto existente sin registro previo. No permite
lectura, listado, actualización ni eliminación anónima. La lectura posterior
queda reservada para `admin` y `supervisor` en el módulo interno.

El conteo de Storage no se considera una garantía absoluta frente a subidas
paralelas, porque la autorización puede ocurrir antes de completar cada objeto.
La metadata conserva el límite estricto; monitoreo, rate limiting y
reconciliación cubren el riesgo residual de producción.

El flujo conserva el orden objeto y después metadata. No se abre `DELETE`
anónimo porque la API de Storage también requiere `SELECT`; un fallo
excepcional puede dejar un objeto sin metadata, limitado por el cupo de cinco,
que debe detectarse y limpiarse mediante reconciliación interna. Rate limiting,
monitoreo y antivirus quedan como endurecimiento de producción.

La UI pública usa estas funciones para adjuntar archivos al crear la solicitud. El cliente no recibe URLs públicas ni URLs firmadas.

`listSolicitudFiles(solicitudId)` lista metadatos seguros de `archivos` para el detalle interno de solicitud, sin devolver `file_path`. La descarga interna usa `/dashboard/solicitudes/[id]/archivos/[fileId]/download`, valida pertenencia por RLS y redirige a una signed URL de corta duración.

## Herencia al convertir a pedido

Cuando una solicitud con archivos `cliente_solicitud` se convierte en pedido, no se mueve ni se copia el objeto físico en Storage. El flujo conserva `solicitud_id`, `file_path`, `bucket`, `visibility` y `uploaded_by`, y solo completa `pedido_id` en los metadatos de `archivos`.

Así el archivo sigue visible desde el detalle interno de solicitud para `admin` y `supervisor`, y también aparece en “Archivos del pedido” como “Archivo enviado por cliente”. Un trabajador asignado puede verlo y descargarlo desde el pedido, pero no obtiene acceso al módulo interno de solicitudes.

## Fuera del alcance actual

- No hay eliminación de archivos.
- No hay edición de metadatos.
- No hay subida interna de archivos de solicitud.
- No hay descarga pública de archivos de solicitud.
- No hay URLs públicas permanentes.
