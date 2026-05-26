# Capa de Storage

Esta carpeta concentra la lógica reutilizable para trabajar con archivos privados de Godel Diseño.

## Alcance actual

- Constantes del bucket privado `godel-files`.
- Tipos internos para categorías, rutas, validación y URLs firmadas.
- Sanitización de nombres de archivo.
- Construcción de rutas internas para solicitudes y pedidos.
- Validación base de archivos antes de futuras subidas.
- Helper server-side para generar URLs firmadas de corta duración desde `archivo.id`.
- Listado de archivos internos de pedido con RLS.
- Subida interna de archivos de pedido desde Server Actions.
- Descarga de archivos de pedido mediante route handler y signed URL.
- Base backend para subida pública controlada de archivos de solicitud.

## Bucket privado

El sistema usa el bucket privado `godel-files`. No se usan buckets públicos ni URLs públicas permanentes.

## Rutas internas

Las rutas se construyen desde datos controlados por la aplicación. No se debe aceptar un `file_path` enviado directamente por el usuario.

```text
solicitudes/{solicitud_id}/originales/{timestamp}-{filename}
pedidos/{pedido_id}/internos/{timestamp}-{filename}
pedidos/{pedido_id}/avances/{timestamp}-{filename}
pedidos/{pedido_id}/finales/{timestamp}-{filename}
```

## Validación

La validación base exige archivo existente, nombre seguro, tamaño mayor que cero, tamaño máximo permitido, MIME permitido, extensión permitida y contexto válido según categoría.

No se aceptan ejecutables, scripts, HTML ni SVG. Formatos de diseño como AI, PSD o CDR quedan pendientes porque sus MIME types no son confiables sin validación adicional.

## URLs firmadas

`createSignedFileUrl(fileId)` consulta `archivos` con RLS mediante el cliente server-side normal de Supabase y genera una signed URL de corta duración. No usa service role key y no recibe rutas directas desde la interfaz.

El route handler `/dashboard/pedidos/[id]/archivos/[fileId]/download` valida que el archivo pertenezca al pedido de la ruta antes de redirigir a la signed URL.

## Archivos de pedido

`listPedidoFiles(pedidoId)` lista metadatos seguros de `archivos` para un pedido, sin devolver `file_path` ni URLs públicas al componente cliente.

`uploadPedidoFile(input)` valida usuario interno activo, acceso al pedido, categoría, archivo real recibido por `FormData`, nombre seguro, MIME, extensión y tamaño. Después sube el objeto al bucket privado `godel-files` e inserta metadatos en `archivos`.

Categorías permitidas por rol:

| Rol | Categorías |
|---|---|
| `admin` | `interno_pedido`, `avance`, `final_entrega` |
| `supervisor` | `interno_pedido`, `avance`, `final_entrega` |
| `trabajador` asignado | `avance`, `final_entrega` |

Un trabajador no asignado no puede listar ni subir archivos del pedido por validaciones server-side y RLS.

## Archivos públicos de solicitud

`uploadPublicSolicitudFile(input)` prepara la subida de archivos enviados por clientes externos. La función fuerza la categoría `cliente_solicitud`, usa la ruta `solicitudes/{solicitud_id}/originales/{timestamp}-{filename}` y guarda metadatos en `archivos` con `pedido_id = null` y `uploaded_by = null`.

`uploadPublicSolicitudFiles(input)` sube varios archivos uno por uno y limita la cantidad a 5 archivos por solicitud.

La migración de Fase 10.4A permite a `anon` insertar objetos y metadatos solo para rutas válidas de solicitudes públicas. No permite lectura, listado, actualización ni eliminación anónima. La lectura posterior queda reservada para `admin` y `supervisor` en el módulo interno.

La UI pública todavía no usa estas funciones; se integrará en una subfase posterior.

## Fuera del alcance actual

- No hay eliminación de archivos.
- No hay edición de metadatos.
- No hay input de archivos en el formulario público.
- No hay listado ni descarga de archivos en solicitudes.
- No hay URLs públicas permanentes.
