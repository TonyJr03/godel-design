# Flujo de Solicitudes Públicas — Godel Diseño

## Entrada y catálogo

`/solicitud` es la entrada pública sin autenticación. Carga server-side los
servicios de `tipos_servicio` con `is_publicly_available = true`; el cliente
envía `service_id`, nunca el nombre ni `workflow_type` como autoridad.

- Encargo aparece cuando hay servicios públicos de ese workflow y permite cero
  a diez archivos.
- Impresión aparece cuando su servicio público está disponible y exige de uno a
  diez archivos.
- Los valores de contacto, descripción e impresión se validan contra el
  servicio resuelto por servidor. Impresión serializa sus datos en la
  descripción estructurada server-side.

Los campos técnicos (`id`, estado, `workflow_type`, bucket, path, metadata,
URLs, capability, firmas y tokens) no son entradas del formulario.

## Creación y transferencia

Las Server Actions son adaptadores finos y solo reciben valores serializables:
los campos del formulario, `{ name, size }[]` y, tras reservar, el identificador
de sesión/item más capability. Nunca reciben un `File`, `Blob` o `FormData` con
bytes.

```text
Encargo sin archivos
  -> crear_solicitud_publica_sin_archivos

Encargo con 1..10 archivos o Impresión con 1..10 archivos
  -> crear_solicitud_publica_con_reserva_carga
  -> autorizar_firma_carga_publica por item
  -> TUS directo a Storage
  -> finalizar_carga_publica por item
```

La reserva es atómica para Solicitud, sesión e items. El navegador mantiene
temporalmente el `File`, capability, firma, object path y URL/fingerprint TUS
solo en memoria. No se persisten en Web Storage, cookies, URL, history ni logs.

El bytes transfer se envía directo a
`/storage/v1/upload/resumable/sign`, con `x-signature` y sin sesión `Bearer`.
Los POST de Next contienen solo control plane y no transportan archivos. La
cola del navegador procesa como máximo dos items en paralelo.

Cada finalize verifica el objeto reservado y recién entonces crea
`public.archivos`. No hay inserción pública directa en `solicitudes`,
`archivos` ni rutas arbitrarias de Storage.

## Archivos y retry

Cada archivo admite hasta 20 MiB. La allowlist vigente es PDF, JPG/JPEG, PNG,
WEBP, DOC/DOCX, ZIP, RAR y CDR. La validación temprana evita reservar para más
de diez archivos, archivos vacíos/sobredimensionados o extensiones no
permitidas; PostgreSQL vuelve a validar el descriptor como frontera final.

Tras fallo de TUS, el retry obtiene una firma nueva y busca el recurso resumible
del mismo item reservado. No crea otra Solicitud, sesión, item ni reserva. Tras
un fallo de finalize con TUS ya completo, el retry solo llama a finalize y no
vuelve a firmar ni transferir bytes.

## Seguridad y seguimiento

El bucket `godel-files` es privado. Clientes públicos no leen, listan,
actualizan ni eliminan objetos. Las descargas internas se autorizan server-side
mediante RLS y URLs firmadas de corta duración.

Cada Solicitud conserva una referencia `GD-XXXX-XXXX`. `/estado` usa el
contrato de tracking público con allowlist y no expone UUIDs, pedido interno,
datos de contacto, descripción, archivos, paths, personal ni historial.

## QA operativa

Los gates E2E de `/solicitud` cubren Encargo sin archivo, Impresión obligatoria,
catálogo público y la carga directa: PDF de 7 MiB, destino Storage firmado,
resume del mismo recurso, Web Storage vacío, lote de tres con concurrencia dos,
retry solo-finalize y límites tempranos. No sustituyen rate limiting, CAPTCHA,
antivirus ni reconciliación interna, que continúan como trabajo operativo
separado.
