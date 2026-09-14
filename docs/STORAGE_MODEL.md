# Modelo de Storage — Godel Diseño

## Contrato vigente

Godel usa el bucket privado `godel-files`. Los binarios viven en Supabase
Storage; `public.archivos` conserva los metadatos de negocio, la relación con
Solicitud/Pedido y la trazabilidad. Nunca se exponen rutas, URLs firmadas,
capabilities ni tokens a interfaces públicas fuera de la transferencia que los
requiere.

Las cargas nuevas usan exclusivamente el control plane de reservas:

```text
reserva -> staged -> TUS -> finalize -> committed -> public.archivos
```

La reserva crea una sesión e items con ruta autoritativa bajo:

```text
cargas/v1/{session_id}/{item_id}/{nonce}-{safe_filename}
```

El navegador no decide bucket, ruta, MIME canónico, visibilidad, relación de
negocio ni metadata final. Solo envía descriptores `{ name, size }` al control
plane y bytes al endpoint TUS autorizado.

## Cargas públicas de Solicitudes

Encargo admite cero a diez archivos; Impresión exige al menos uno. Cada archivo
está limitado a 20 MiB y puede ser PDF, JPG/JPEG, PNG, WEBP, DOC/DOCX, ZIP, RAR
o CDR. El navegador conserva los `File`, capability, firma, URL resumible y
fingerprint exclusivamente en memoria. No usa `localStorage`, `sessionStorage`,
cookies, URL ni history para esos datos.

La action pública recibe únicamente valores serializables, descriptores y los
identificadores/capability mínimos de la sesión. Para una carga se llama a la
RPC pública de reserva, una firma se obtiene por item y los bytes se transfieren
directamente a:

```text
/storage/v1/upload/resumable/sign
```

La transferencia pública usa `x-signature`, `apikey` y `x-upsert: false`; no
lleva `Authorization: Bearer`. El retry tras un fallo TUS vuelve a firmar y
reanuda el mismo recurso reservado. Si TUS ya completó y solo falla finalize,
el retry ejecuta únicamente finalize.

`finalizar_carga_publica` verifica el objeto reservado y crea la fila de
`public.archivos`; por eso no existe inserción anónima directa de metadata ni
de Solicitudes.

## Cargas internas de Pedido

Pedido usa la misma reserva, paths `cargas/v1` y finalize autoritativo. El
navegador autenticado transfiere por TUS a
`/storage/v1/upload/resumable` con el JWT normal de su sesión. El control plane
deriva la visibilidad desde el estado del pedido; el cliente no la elige.

La UI limita las transferencias simultáneas a dos. Los listados y descargas
internos consultan metadata mediante RLS y generan URLs firmadas server-side de
corta duración después de validar permisos.

## Permisos y RLS

`storage.objects` conserva los ACL administrados por la plataforma Supabase.
La autorización efectiva de Godel está en bucket privado, RLS, las cuatro
policies Godel y helpers que validan sesiones e items reservados; no se afirma
un ACL estricto propio sobre objetos de Storage.

- Público: una firma TUS presigned permite solo el `INSERT` reservado. No hay
  lectura, listado, update ni delete anónimo.
- Interno: las operaciones pasan por el control plane, RLS y la identidad
  autenticada correspondiente.
- `public.archivos`: la metadata se crea solo por finalize `SECURITY DEFINER`.
  Los consumidores internos reciben DTOs seguros, nunca `file_path` como dato
  editable.

## Contratos retirados

No forman parte del contrato actual:

- paths `solicitudes/{id}/originales/...` ni `pedidos/{id}/...`;
- inserciones anónimas directas en `solicitudes`, `archivos` o Storage;
- máximo histórico de cinco archivos;
- builders TS de paths legacy, uploader público legacy y sus policies/helpers.

Esas rutas pueden aparecer en documentación archivada como contexto histórico,
pero no deben reutilizarse en código ni documentación operativa.

## Operación pendiente

Siguen fuera de alcance la eliminación pública de archivos, CAPTCHA/rate
limiting, antivirus o inspección profunda y la reconciliación interna de
objetos staged sin metadata. Cualquier trabajo en esas áreas requiere un flujo
operativo y permisos definidos antes de abrir APIs adicionales.
