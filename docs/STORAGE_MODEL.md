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

## Qué no queda habilitado todavía

- No hay subida real de archivos desde formularios.
- No hay descarga real desde la interfaz.
- No hay generación de signed URLs.
- No hay subida pública anónima desde `/solicitud`.
- No hay componentes visuales nuevos para archivos.
- No hay historial, comentarios ni notificaciones asociados a archivos.
- No hay URLs públicas permanentes.

## Validaciones pendientes para subfases posteriores

Antes de aceptar archivos desde la aplicación se deben implementar validaciones específicas:

- Tamaño máximo por archivo.
- Cantidad máxima de archivos por solicitud.
- Tipos MIME permitidos.
- Extensiones permitidas.
- Nombres de archivo seguros.
- Bloqueo de archivos ejecutables peligrosos.

Propuesta inicial:

| Contexto | Límite |
|---|---|
| Solicitudes públicas | Máximo 20 MB por archivo. |
| Área interna | Máximo 50 MB por archivo. |
| Solicitud pública | Máximo 5 archivos por solicitud. |

Extensiones a bloquear inicialmente:

- `.exe`
- `.bat`
- `.cmd`
- `.msi`
- `.sh`
- `.scr`

## Pendiente para fases posteriores

- Servicios de subida y descarga.
- Generación de signed URLs.
- Validadores de archivos.
- Integración con formulario público.
- Integración con detalle de pedidos.
- Integración con detalle de solicitudes si se define en una fase posterior.
