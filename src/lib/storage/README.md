# Capa de Storage

Esta carpeta contiene los helpers reutilizables para el bucket privado
`godel-files`, el control plane de cargas y el transporte TUS. El contrato
operativo completo está en [docs/STORAGE_MODEL.md](../../../docs/STORAGE_MODEL.md).

## Mapa vigente

| Archivo | Responsabilidad |
|---|---|
| `constants.ts` | Bucket, expiración de URLs, límites, chunk TUS y allowlist canónica PPO-03. |
| `types.ts` | DTOs seguros de metadata/listados y categorías visibles de archivo. |
| `file-name.ts` | Sanitización y extracción de extensión. |
| `file-validation.ts` | Visibilidad de carga interna de Pedido según estado. |
| `labels.ts` | Etiquetas visibles de `archivo_visibility`. |
| `upload-control/` | Reserva, firma, finalize, descriptores y parsers server-only. |
| `tus/` | Adaptador browser-only para TUS; URL/fingerprint viven solo en memoria. |
| `list-pedido-files.ts` / `list-solicitud-files.ts` | Listados internos seguros mediante RLS. |
| `signed-url.ts` | Signed URL server-side desde `archivo.id`. |

## Flujos

Las cargas públicas reservan con la RPC pública, reciben una firma por item y
envían bytes directamente a `/storage/v1/upload/resumable/sign` con
`x-signature`, sin `Authorization: Bearer`. Las cargas de Pedido usan la misma
reserva/finalize y TUS autenticado en `/storage/v1/upload/resumable`.

`upload-control` es la autoridad para sesión, item, path, MIME, tamaño y
metadata. Los consumidores no construyen rutas `file_path`, no insertan
`archivos` directamente y no envían bytes a Server Actions. El retry de TUS
reanuda el mismo item; si ya se transfirió el objeto, el retry de finalize no
repite la transferencia.

La UI limita a dos transferencias concurrentes, uno a diez archivos por sesión
y 20 MiB por archivo. Los formatos permitidos son PDF, JPG/JPEG, PNG, WEBP,
DOC/DOCX, ZIP, RAR y CDR.

## Contratos retirados

No existen uploader público legacy, builders de `solicitudes/{id}/originales`
o `pedidos/{id}/...`, metadata builders ni validación TS basada en esos paths.
No reintroducirlos: todas las rutas nuevas son `cargas/v1` y solo las genera el
control plane PostgreSQL.
