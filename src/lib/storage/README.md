# Capa de Storage

Esta carpeta concentra la lógica reutilizable para trabajar con archivos privados de Godel Diseño.

## Alcance actual

- Constantes del bucket privado `godel-files`.
- Tipos internos para categorías, rutas, validación y URLs firmadas.
- Sanitización de nombres de archivo.
- Construcción de rutas internas para solicitudes y pedidos.
- Validación base de archivos antes de futuras subidas.
- Helper server-side para generar URLs firmadas de corta duración desde `archivo.id`.

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

## Fuera de esta subfase

- No hay subida real de archivos.
- No hay Server Actions de subida.
- No hay UI de archivos.
- No hay eliminación de archivos.
- No hay edición de metadatos.
