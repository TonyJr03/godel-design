# Capa de Storage

Esta carpeta concentra la lógica reutilizable para trabajar con archivos privados de Godel Diseño.

Este README queda como mapa operativo final del dominio Storage despues de
Beta 2.6. La documentacion historica del modelo sigue en `docs/STORAGE_MODEL.md`,
pero las decisiones vigentes de implementacion estan resumidas aqui y en
`docs/development/BETA_2_6_STORAGE_AUDIT.md`.

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
- Builders server-side de metadata para `public.archivos`.
- Helper compartido para respuestas y redireccion de route handlers internos.

## Mapa de archivos vigente

| Archivo | Responsabilidad |
|---|---|
| `constants.ts` | Bucket privado, expiracion de signed URLs, limites, carpetas, categorias, MIME/extensiones permitidas y extensiones bloqueadas. |
| `types.ts` | Tipos internos, contratos de validacion, resultados de upload, DTOs seguros y allowlist `SafeListedFileMetadata`. |
| `file-name.ts` | Sanitizacion de nombres de archivo y extraccion de extension/base. |
| `file-paths.ts` | Construccion server-side de `file_path` para solicitudes y pedidos. |
| `file-validation.ts` | Validacion compartida de archivo, categoria, contexto y categoria de pedido por estado. |
| `upload-metadata.ts` | Builders server-side de metadata para insertar en `public.archivos`. |
| `upload-public-solicitud-file.ts` | Upload publico controlado desde `/solicitud`. |
| `upload-pedido-file.ts` | Upload interno de archivos propios de pedido con cleanup best-effort. |
| `list-solicitud-files.ts` | Listado interno seguro de archivos de solicitud. |
| `list-pedido-files.ts` | Listado interno seguro de archivos de pedido. |
| `signed-url.ts` | Generacion server-side de signed URLs de corta duracion desde `archivo.id`. |
| `download-route.ts` | Helper compartido para ids, respuestas seguras y redireccion a signed URL desde route handlers internos. |
| `labels.ts` | Labels visibles por categoria. |
| `index.ts` | Barrel publico del dominio Storage para contratos de uso general. |

QA focal del dominio vive en `tests/e2e/storage.spec.ts`.

## Bucket privado

El sistema usa el bucket privado `godel-files`. No se usan buckets públicos,
listados anonimos ni URLs públicas permanentes.

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

Los route handlers internos son la unica superficie de descarga. Los listados y
componentes reciben solo metadata segura y enlaces a
`/dashboard/.../archivos/[fileId]/download`; no reciben signed URLs, bucket ni
`file_path`. La redireccion se crea bajo demanda despues de validar UUIDs,
pertenencia por `pedido_id` o `solicitud_id`, permisos internos cuando aplica y
RLS sobre `archivos`. La URL firmada mantiene la expiracion corta definida por
`SIGNED_FILE_URL_EXPIRES_IN_SECONDS`.

Las signed URLs no se devuelven desde listados, no se guardan en base de datos,
no llegan a componentes y no se exponen en `/estado`. Cualquier cambio que
requiera archivos publicos debe tratarse como una fase nueva de seguridad
publica.

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

La metadata de pedido se construye server-side antes del insert en `archivos`.
El servicio fija `pedido_id`, `solicitud_id = null`, `uploaded_by` con el
perfil interno actual, `bucket = godel-files`, `file_path` generado y
`visibility` derivada del estado. Si el objeto ya se subio a Storage pero falla
el insert de metadata, el servicio intenta borrar ese objeto como cleanup
best-effort. Un fallo en ese cleanup se registra en servidor y no cambia el
mensaje seguro que recibe la UI.

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

La metadata publica tambien se construye server-side. El cliente no controla
`visibility`, bucket, `file_path`, `uploaded_by`, `file_name`, `file_type` ni
`file_size`; esos valores salen del archivo real, la solicitud creada, el
bucket oficial y el path generado por la aplicacion. Esta subfase documenta la
deuda de objetos huerfanos, pero no implementa reconciliacion, borrado anonimo,
rate limiting, captcha, antivirus ni monitoreo.

La UI pública usa estas funciones para adjuntar archivos al crear la solicitud. El cliente no recibe URLs públicas ni URLs firmadas.

`listSolicitudFiles(solicitudId)` lista metadatos seguros de `archivos` para el detalle interno de solicitud, sin devolver `file_path`. La descarga interna usa `/dashboard/solicitudes/[id]/archivos/[fileId]/download`, valida pertenencia por RLS y redirige a una signed URL de corta duración.

## Relacion con `/estado`

`/estado` no lista archivos, no descarga archivos, no revela `file_path`, no
revela bucket y no revela signed URLs. El contrato publico vive en
`src/lib/public-tracking` y se mantiene por allowlist.

Cualquier cambio para mostrar archivos publicamente seria una fase nueva de
seguridad publica. Debe revisar RPC/RLS, policies, checklist de rutas publicas,
documentacion y `npm.cmd run audit:public-tracking`.

## Herencia al convertir a pedido

Cuando una solicitud con archivos `cliente_solicitud` se convierte en pedido, no se mueve ni se copia el objeto físico en Storage. El flujo conserva `solicitud_id`, `file_path`, `bucket`, `visibility` y `uploaded_by`, y solo completa `pedido_id` en los metadatos de `archivos`.

Así el archivo sigue visible desde el detalle interno de solicitud para `admin` y `supervisor`, y también aparece en “Archivos del pedido” como “Archivo enviado por cliente”. Un trabajador asignado puede verlo y descargarlo desde el pedido, pero no obtiene acceso al módulo interno de solicitudes.

## Fuera del alcance actual

- No hay eliminación de archivos.
- No hay edición de metadatos.
- No hay subida interna de archivos de solicitud.
- No hay descarga pública de archivos de solicitud.
- No hay URLs públicas permanentes.

## QA Beta 2.6.6

`tests/e2e/storage.spec.ts` agrega QA focal de Storage con cobertura de:

- secciones seguras de archivos en pedido y solicitud;
- links internos de descarga mediante route handlers;
- upload publico invalido bloqueado;
- descargas invalidas con respuestas seguras;
- trabajador bloqueado o con respuesta segura para descarga de solicitud;
- `/estado` sin superficie de archivos;
- ausencia visible de `file_path`, bucket, signed URLs y otros terminos
  sensibles.

No hubo upload positivo real ni descarga positiva de archivo real en e2e porque
todavia no existe fixture/cleanup estable para objetos de Storage. Esa cobertura
queda pendiente para una fase posterior.

## Pendientes tecnicos conocidos

- No existe reconciliacion interna de objetos huerfanos.
- El upload publico puede dejar objeto sin metadata si falla el insert
  posterior.
- No hay upload positivo e2e por falta de fixture/cleanup estable.
- No hay descarga positiva e2e de archivo real por falta de fixture estable.
- No hay rate limiting, captcha ni honeypot en `/solicitud`.
- No hay antivirus ni escaneo profundo de archivos.
- No hay monitoreo operativo agregado de Storage.
- Puede existir drift futuro entre TypeScript y SQL/policies si se cambian
  MIME, extensiones, rutas, categorias o tamano.
- `npm.cmd run verify` sigue dependiendo de red para descargar Google Fonts
  durante `next build`.

## Reglas de seguridad

- Mantener `godel-files` privado.
- No abrir lectura anonima.
- No abrir listado anonimo.
- No abrir delete anonimo.
- No usar `service_role`.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No exponer `file_path`.
- No exponer bucket.
- No devolver signed URLs desde listados.
- No devolver signed URLs a componentes.
- No permitir descargas desde `/estado`.
- No aceptar `visibility`, bucket, `file_path`, `uploaded_by`, `file_name`,
  `file_type` o `file_size` desde formularios como fuente de verdad.
- No mover generacion de signed URLs a Client Components.
- No cambiar policies/RLS como refactor menor.

## Que no hacer

- No modificar `src/app` ni componentes para cambiar seguridad de Storage sin
  fase explicita.
- No consultar Supabase desde Client Components.
- No filtrar metadata cruda a UI.
- No mover el dominio a `src/services`.
- No ampliar formatos, limites, rutas o categorias sin revisar TypeScript,
  SQL/policies, documentacion y QA juntos.
- No implementar reconciliacion, antivirus, rate limiting o archivos publicos
  como refactor menor.
