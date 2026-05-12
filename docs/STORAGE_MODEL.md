# Modelo de Storage Inicial — Godel Design

## Propósito

Este documento define la estrategia inicial para almacenar archivos enviados por clientes y archivos internos asociados a pedidos en Godel Design.

El objetivo es dejar clara la estructura esperada de Supabase Storage antes de crear buckets, policies de `storage.objects` o lógica real de subida y descarga en Next.js.

## Principios

- Archivos privados por defecto.
- No usar URLs públicas permanentes.
- Acceso mediante permisos y URLs firmadas.
- Metadatos de archivos guardados en la tabla `archivos`.
- Separación entre archivos de solicitudes, archivos internos, avances y finales.
- Lógica de archivos centralizada en servicios o módulos especializados.

## Bucket Inicial

El sistema usará inicialmente un único bucket privado:

| Bucket | Visibilidad | Uso |
|---|---|---|
| `godel-files` | Privado | Archivos de solicitudes, pedidos, avances y entregas finales. |

Este bucket no debe marcarse como público. Todo acceso a archivos debe pasar por reglas de permisos, validaciones de aplicación y URLs firmadas de corta duración.

## Categorías De Archivos

Las categorías corresponden al enum `archivo_visibility`.

| Categoría | Quién lo sube normalmente | Entidad asociada | Quién debería verlo |
|---|---|---|---|
| `cliente_solicitud` | Cliente externo mediante flujo público controlado | `solicitudes` | `admin` y `supervisor` |
| `interno_pedido` | `admin` o `supervisor` | `pedidos` | `admin`, `supervisor` y trabajadores asignados al pedido si aplica |
| `avance` | Trabajador asignado, `admin` o `supervisor` | `pedidos` | `admin`, `supervisor` y trabajadores asignados al pedido |
| `final_entrega` | Trabajador asignado, `admin` o `supervisor` | `pedidos` | `admin`, `supervisor` y trabajadores asignados al pedido |

Los archivos asociados solo a solicitudes no deben ser visibles para trabajadores, porque todavía no pertenecen a un pedido asignado.

## Estructura De Rutas

Estructura recomendada dentro del bucket `godel-files`:

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
- El `file_path` completo se guardará en la tabla `archivos`.

## Relación Con La Tabla `archivos`

Supabase Storage guarda el binario. La tabla `archivos` guarda los metadatos de negocio necesarios para permisos, trazabilidad y relación con solicitudes o pedidos.

| Campo | Uso |
|---|---|
| `pedido_id` | Relaciona el archivo con un pedido cuando aplica. |
| `solicitud_id` | Relaciona el archivo con una solicitud cuando aplica. |
| `uploaded_by` | Usuario interno que subió el archivo; será `null` para algunos flujos públicos. |
| `file_name` | Nombre visible del archivo. |
| `file_path` | Ruta completa dentro del bucket. |
| `file_type` | MIME type detectado o declarado. |
| `file_size` | Tamaño del archivo en bytes. |
| `bucket` | Nombre del bucket, inicialmente `godel-files`. |
| `visibility` | Categoría según `archivo_visibility`. |
| `created_at` | Fecha de registro del archivo. |

## Reglas De Acceso Conceptuales

- `admin` puede acceder a todos los archivos.
- `supervisor` puede acceder a todos los archivos operativos.
- `trabajador` puede acceder solo a archivos de pedidos asignados.
- `trabajador` puede subir avances y finales a pedidos asignados.
- Archivos asociados solo a solicitudes son visibles para `admin` y `supervisor`.
- Usuarios anónimos podrán subir archivos de solicitud solo mediante flujo controlado.
- Usuarios anónimos no podrán listar ni leer archivos.

## URLs Firmadas

Las descargas se harán mediante signed URLs de corta duración. Una duración inicial razonable es entre 5 y 10 minutos.

Las signed URLs no deben guardarse en base de datos. Deben generarse bajo demanda después de validar permisos sobre la solicitud, pedido o archivo correspondiente.

## Validaciones Iniciales

Validaciones recomendadas antes de aceptar archivos:

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

Tipos sugeridos:

- Imágenes.
- PDF.
- Documentos comunes.
- Archivos comprimidos.
- Formatos de diseño necesarios para la operación.

Extensiones a bloquear inicialmente:

- `.exe`
- `.bat`
- `.cmd`
- `.msi`
- `.sh`
- `.scr`

## Flujo Conceptual De Subida Pública

1. Cliente completa solicitud.
2. Sistema crea registro en `solicitudes`.
3. Sistema sube archivos al bucket privado.
4. Sistema crea registros en `archivos` con `solicitud_id`.
5. Cliente ve mensaje de éxito.
6. Cliente no recibe enlace permanente a los archivos.

## Flujo Conceptual De Subida Interna

1. Usuario interno entra al pedido.
2. Selecciona tipo de archivo.
3. Sistema valida permisos.
4. Sistema sube archivo al bucket privado.
5. Sistema crea registro en `archivos`.
6. Si corresponde, se registra evento en historial.

## Qué NO Se Hará Todavía

- No crear bucket todavía.
- No crear policies de Storage todavía.
- No implementar subida real en frontend.
- No implementar descargas reales.
- No exponer archivos públicamente.
- No crear automatizaciones de limpieza.

## Pendiente Para Fases Posteriores

- Migración o script para crear bucket.
- Policies de `storage.objects`.
- Servicios de subida y descarga.
- Generación de signed URLs.
- Validadores de archivos.
- Integración con formulario público.
- Integración con detalle de pedidos.
