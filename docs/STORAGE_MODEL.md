# Modelo de Storage — Godel Diseño

## Propósito

Este documento define la estrategia para almacenar archivos enviados por clientes y archivos internos asociados a solicitudes y pedidos en Godel Diseño.

Supabase Storage guarda los binarios. La tabla `archivos` guarda los metadatos de negocio, relaciones, categoría y trazabilidad.

## Principios

- Archivos privados por defecto.
- No usar buckets públicos.
- No usar URLs públicas permanentes.
- Acceso controlado por RLS, policies de Storage y validaciones de aplicación.
- Descargas futuras mediante URLs firmadas de corta duración.
- Metadatos de archivos guardados en la tabla `archivos`.
- Separación entre archivos de solicitudes, archivos internos, avances y entregas finales.

## Bucket configurado

La Fase 10.1 crea o asegura un único bucket privado mediante migración:

| Bucket | Visibilidad | Uso |
|---|---|---|
| `godel-files` | Privado (`public = false`) | Archivos de solicitudes, pedidos, avances y entregas finales. |

Este bucket no debe marcarse como público. Todo acceso debe pasar por reglas de permisos, validaciones de aplicación y, para descargas futuras, URLs firmadas de corta duración.

## Categorías de archivos

Las categorías corresponden al enum `archivo_visibility`.

| Categoría | Quién lo sube normalmente | Entidad asociada | Quién debería verlo |
|---|---|---|---|
| `cliente_solicitud` | Cliente externo mediante flujo público controlado | `solicitudes` | `admin` y `supervisor` |
| `interno_pedido` | `admin` o `supervisor` | `pedidos` | `admin`, `supervisor` y trabajadores asignados al pedido si aplica |
| `avance` | Trabajador asignado, `admin` o `supervisor` | `pedidos` | `admin`, `supervisor` y trabajadores asignados al pedido |
| `final_entrega` | Trabajador asignado, `admin` o `supervisor` | `pedidos` | `admin`, `supervisor` y trabajadores asignados al pedido |

Los archivos asociados solo a solicitudes no deben ser visibles para trabajadores, porque todavía no pertenecen a un pedido asignado.

## Estructura de rutas

Estructura esperada dentro del bucket `godel-files`:

```text
solicitudes/{solicitud_id}/originales/{timestamp}-{filename}
pedidos/{pedido_id}/internos/{timestamp}-{filename}
pedidos/{pedido_id}/avances/{timestamp}-{filename}
pedidos/{pedido_id}/finales/{timestamp}-{filename}
```

Reglas para las rutas:

- `{solicitud_id}` y `{pedido_id}` deben ser UUID reales existentes.
- `{timestamp}` ayuda a evitar colisiones de nombres.
- `{filename}` debe limpiarse antes de guardarse.
- El `file_path` completo se guarda en la tabla `archivos`.
- Las policies de Storage validan las raíces `solicitudes` y `pedidos`, el UUID y la carpeta de categoría esperada.

## Relación con la tabla `archivos`

Supabase Storage guarda el archivo. La tabla `archivos` guarda los metadatos necesarios para permisos de negocio, trazabilidad y relación con solicitudes o pedidos.

| Campo | Uso |
|---|---|
| `pedido_id` | Relaciona el archivo con un pedido cuando aplica. |
| `solicitud_id` | Relaciona el archivo con una solicitud cuando aplica. |
| `uploaded_by` | Usuario interno que subió el archivo; será `null` para algunos flujos públicos futuros. |
| `file_name` | Nombre visible del archivo. |
| `file_path` | Ruta completa dentro del bucket. |
| `file_type` | MIME type detectado o declarado. |
| `file_size` | Tamaño del archivo en bytes. |
| `bucket` | Nombre del bucket, inicialmente `godel-files`. |
| `visibility` | Categoría según `archivo_visibility`. |
| `created_at` | Fecha de registro del archivo. |

La Fase 10.1 no cambia la tabla `archivos`.

## Policies base de Storage

La migración de Fase 10.1 crea policies sobre `storage.objects` solo para el bucket `godel-files`.

| Operación | Alcance habilitado |
|---|---|
| `select` | `admin` y `supervisor` sobre solicitudes y pedidos; trabajador solo sobre pedidos asignados. |
| `insert` | `admin` y `supervisor` sobre solicitudes y pedidos; trabajador solo en `pedidos/{pedido_id}/avances` y `pedidos/{pedido_id}/finales` si está asignado al pedido. |
| `update` | Solo `admin` y `supervisor` sobre rutas válidas de solicitudes o pedidos. |
| `delete` | Solo `admin` y `supervisor` sobre rutas válidas de solicitudes o pedidos. |

Las policies reutilizan helpers existentes como `private.can_access_order`, `private.is_assigned_to_order` y `private.is_admin_or_supervisor`. También agregan helpers mínimos para interpretar rutas de Storage y extraer `pedido_id` o `solicitud_id`.

## Reglas de acceso

- `admin` puede acceder a archivos de solicitudes y pedidos.
- `supervisor` puede acceder a archivos de solicitudes y pedidos.
- `trabajador` puede leer archivos de pedidos asignados.
- `trabajador` puede subir archivos operativos solo a `avances` y `finales` de pedidos asignados.
- `trabajador` no puede acceder a archivos de pedidos no asignados.
- `trabajador` no puede acceder a archivos asociados solo a solicitudes.
- Usuarios anónimos no pueden leer, listar, actualizar ni eliminar archivos.
- La subida pública anónima de archivos de solicitud no está habilitada en esta subfase.

## URLs firmadas

Las descargas futuras deben hacerse mediante signed URLs de corta duración. Una duración inicial razonable es entre 5 y 10 minutos.

Las signed URLs no deben guardarse en base de datos. Deben generarse bajo demanda después de validar permisos sobre la solicitud, pedido o archivo correspondiente.

## Qué queda habilitado en Fase 10.1

- Bucket privado `godel-files`.
- Policies base de `storage.objects`.
- Helpers SQL mínimos para validar rutas del bucket privado.
- Constantes base en `src/lib/storage/constants.ts`.
- Documentación alineada con la infraestructura real.

## Servicios base de Fase 10.2

La capa `src/lib/storage` concentra utilidades reutilizables para las próximas subfases:

| Archivo | Propósito |
|---|---|
| `constants.ts` | Nombre del bucket privado, carpetas, categorías, límites y listas de MIME/extensiones permitidas. |
| `types.ts` | Tipos internos derivados del modelo de Supabase cuando aplica. |
| `file-name.ts` | Sanitización de nombres y extracción de extensión/base. |
| `file-paths.ts` | Construcción de rutas internas para solicitudes y pedidos sin aceptar rutas arbitrarias del usuario. |
| `file-validation.ts` | Validaciones base de archivo, categoría y contexto antes de futuras subidas. |
| `signed-url.ts` | Generación server-side de URLs firmadas de corta duración a partir de `archivo.id`. |

La generación de URLs firmadas consulta primero la tabla `archivos` con RLS. El usuario no envía `file_path` directamente; el sistema usa los metadatos guardados en base de datos y el bucket privado `godel-files`.

Storage físico y metadatos de negocio siguen separados: Supabase Storage conserva el binario, mientras `archivos` conserva `bucket`, `file_path`, categoría, relaciones con solicitudes/pedidos y trazabilidad.

## Fase 10.3: archivos internos en pedidos

El detalle interno de pedido incluye una sección “Archivos del pedido” para listar, subir y descargar archivos privados asociados a `pedidos`.

Categorías habilitadas:

| Categoría | Ruta | Roles que pueden subir |
|---|---|---|
| `interno_pedido` | `pedidos/{pedido_id}/internos/{timestamp}-{filename}` | `admin`, `supervisor` |
| `avance` | `pedidos/{pedido_id}/avances/{timestamp}-{filename}` | `admin`, `supervisor`, trabajador asignado |
| `final_entrega` | `pedidos/{pedido_id}/finales/{timestamp}-{filename}` | `admin`, `supervisor`, trabajador asignado |

El listado consulta la tabla `archivos` por `pedido_id` y se apoya en RLS. La UI recibe metadatos seguros como nombre, tamaño, tipo, categoría, fecha y perfil que subió el archivo cuando es visible. No recibe `file_path`.

La subida usa el archivo real recibido por `FormData`, valida nombre, tamaño, MIME, extensión, categoría y contexto, construye la ruta internamente y guarda metadatos en `archivos`. No acepta `file_path`, `bucket`, `uploaded_by`, `file_name`, `file_type` ni `file_size` desde campos del formulario como fuente de verdad.

La descarga usa el route handler interno del pedido, valida que el archivo pertenezca al pedido y redirige a una URL firmada de corta duración. No hay URLs públicas permanentes.

## Fase 10.4A: base para archivos de solicitudes públicas

La base backend permite una futura integración del formulario público con archivos de cliente, sin modificar todavía la UI de `/solicitud`.

Reglas aplicadas:

- El bucket sigue siendo `godel-files` con `public = false`.
- `anon` solo puede insertar objetos en `storage.objects` bajo `solicitudes/{solicitud_id}/originales/{archivo}`.
- `anon` solo puede insertar metadatos válidos en `archivos` con `visibility = cliente_solicitud`.
- `pedido_id` debe ser `null`.
- `uploaded_by` debe ser `null`.
- `bucket` debe ser `godel-files`.
- El UUID de `solicitud_id` debe coincidir con el UUID presente en `file_path`.
- `file_size` debe ser mayor que cero y no superar 20 MB.
- `file_type` debe pertenecer a la lista de MIME permitidos.
- No hay lectura, listado, actualización ni eliminación anónima.

El servicio `uploadPublicSolicitudFile` fuerza la categoría `cliente_solicitud`, valida el archivo real, construye la ruta internamente y guarda metadatos en `archivos`. `uploadPublicSolicitudFiles` limita la carga múltiple a 5 archivos por solicitud.

La lectura posterior de estos archivos queda reservada para `admin` y `supervisor`. Los trabajadores no acceden a archivos asociados solo a solicitudes.

Riesgo controlado: si la subida al bucket privado funciona y luego falla la inserción de metadatos, no se abre eliminación anónima para limpiar el objeto. El error queda registrado en servidor y la limpieza operativa deberá tratarse con un flujo seguro posterior si fuera necesario.

## Fase 10.4B: integración en formulario público

El formulario público `/solicitud` incluye un campo opcional `files` para adjuntar archivos de referencia. La Server Action crea primero la solicitud y luego llama a `uploadPublicSolicitudFiles` para asociar los archivos a la solicitud creada.

La integración mantiene las reglas de Fase 10.4A:

- categoría forzada a `cliente_solicitud`;
- ruta construida internamente;
- metadatos guardados en `archivos`;
- `pedido_id = null`;
- `uploaded_by = null`;
- bucket `godel-files`;
- sin lectura pública;
- sin URLs públicas ni URLs firmadas para el cliente.

Si los datos principales son inválidos, no se crea la solicitud ni se suben archivos. Si los archivos son claramente inválidos antes de crear la solicitud, tampoco se crea la solicitud. Si la solicitud se crea y luego falla algún archivo, la solicitud se conserva y el cliente recibe una advertencia segura.

## Fase 10.5: archivos en detalle interno de solicitud

El detalle interno `/dashboard/solicitudes/{solicitud_id}` muestra la sección “Archivos de la solicitud” para `admin` y `supervisor`.

El listado:

- consulta `archivos` por `solicitud_id`;
- se apoya en RLS;
- no devuelve `file_path`;
- muestra nombre, tipo, tamaño, fecha y categoría visible.

La descarga usa `/dashboard/solicitudes/{solicitud_id}/archivos/{archivo_id}/download`, valida UUIDs, confirma que el archivo pertenece a esa solicitud, confirma que `pedido_id` no contradice el contexto de solicitud, verifica `bucket = godel-files` y genera una URL firmada de corta duración. No hay lectura pública ni URL pública permanente.

El trabajador no accede al módulo de solicitudes y no puede listar ni descargar archivos asociados solo a solicitudes.

## Fase 10.7: herencia de archivos al convertir a pedido

Cuando una solicitud aprobada se convierte en pedido, los archivos enviados por el cliente se heredan por metadatos:

- no se mueve el objeto físico en Supabase Storage;
- no se copia el archivo;
- no cambia `file_path`;
- no cambia `bucket`;
- no cambia `solicitud_id`;
- no cambia `visibility`;
- se establece `pedido_id` con el pedido generado.

Esto conserva la trazabilidad de origen y permite que el archivo siga apareciendo en el detalle interno de solicitud para `admin` y `supervisor`, y también en el detalle del pedido como “Archivo enviado por cliente”.

La lectura del objeto físico bajo `solicitudes/{solicitud_id}/originales/...` sigue bloqueada para anónimos. Un trabajador asignado solo puede descargarlo desde el pedido cuando existe un registro en `archivos` con ese `file_path`, `visibility = cliente_solicitud` y un `pedido_id` accesible por RLS.

## Qué no queda habilitado todavía

- No hay eliminación de archivos.
- No hay edición de metadatos.
- No hay historial, comentarios ni notificaciones asociados a archivos.
- No hay URLs públicas permanentes.

## Validaciones de archivos

Las validaciones base aplicadas desde la aplicación incluyen:

- Tamaño máximo por archivo.
- Cantidad máxima de archivos por solicitud.
- Tipos MIME permitidos.
- Extensiones permitidas.
- Nombres de archivo seguros.
- Bloqueo de archivos ejecutables peligrosos.

Límites actuales:

| Contexto | Límite |
|---|---|
| Solicitudes públicas | Máximo 20 MB por archivo. |
| Área interna | Máximo 20 MB por archivo. |
| Solicitud pública | Máximo 5 archivos por solicitud. |

Extensiones bloqueadas incluyen:

- `.exe`
- `.bat`
- `.cmd`
- `.msi`
- `.sh`
- `.scr`

## Pendiente para fases posteriores

- Eliminación controlada de archivos si se define en una fase posterior.
