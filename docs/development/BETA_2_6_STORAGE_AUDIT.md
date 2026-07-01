# Beta 2.6.1 - Auditoria focal de Storage y archivos

## 1. Objetivo

Auditar el estado actual del dominio Storage y archivos sin modificar codigo
funcional. El alcance cubre subidas publicas desde `/solicitud`, subidas
internas desde pedidos, listados internos, descargas mediante route handlers,
metadata en `public.archivos`, bucket privado `godel-files`, signed URLs,
policies de Storage, RLS y relacion con Solicitudes, Pedidos y Tracking
Publico.

Esta auditoria busca decidir como consolidar Beta 2.6 sin romper seguridad,
permisos ni flujos existentes.

## 2. Resumen ejecutivo

El dominio Storage esta en buen estado general. La arquitectura vigente mantiene
el bucket `godel-files` privado, construye rutas server-side, valida archivos en
TypeScript y en base de datos, guarda metadata en `public.archivos`, no expone
`file_path` a componentes y usa route handlers internos para generar signed
URLs de corta duracion.

Puntos fuertes:

- bucket unico `godel-files` con `public = false`;
- `src/lib/storage` concentra constantes, tipos, validacion, builders, listados,
  uploads y signed URLs;
- los DTOs de listado no devuelven `file_path` ni bucket;
- `/estado` no lista archivos ni devuelve rutas privadas;
- la herencia Solicitud -> Pedido modifica metadata, no mueve objetos fisicos;
- RLS de `archivos` y policies de `storage.objects` actuan como defensa final;
- `anon` no tiene lectura, listado, update ni delete sobre archivos.

Riesgos principales:

- Storage y `public.archivos` no son transaccionales entre si, por lo que la
  subida publica puede dejar objetos sin metadata si falla el insert posterior;
- los route handlers de descarga de pedido y solicitud duplican patron y deben
  consolidarse con cuidado;
- `file_path` vive en metadata y en `createSignedFileUrl`, por lo que cualquier
  helper nuevo debe mantenerse estrictamente server-side;
- no hay reconciliacion, monitoreo, rate limiting, captcha ni antivirus dentro
  de esta beta.

Recomendacion general: consolidar primero validacion, path builders y contratos
seguros de DTO/listado; despues revisar uploads, metadata y route handlers. No
abrir bucket publico, no exponer `file_path` y no tocar policies/RLS sin fase
explicita.

## 3. Mapa del dominio Storage

Archivos de `src/lib/storage`:

| Archivo | Responsabilidad |
|---|---|
| `constants.ts` | Bucket, expiracion de signed URLs, limites, carpetas, categorias, MIME/extensiones permitidas y extensiones bloqueadas. |
| `types.ts` | Tipos de bucket, metadata, categorias, inputs de paths, validacion, signed URLs, listados y uploads. |
| `file-name.ts` | Extrae extension/base y sanitiza nombres de archivo. |
| `file-paths.ts` | Construye rutas internas para pedidos y solicitudes; valida UUID y categoria. |
| `file-validation.ts` | Valida presencia, nombre, tamano, MIME, extension, categoria y contexto. Tambien deriva categoria de pedido por estado. |
| `labels.ts` | Labels visibles por categoria de archivo. |
| `signed-url.ts` | Genera signed URL de corta duracion desde `archivo.id`, leyendo `bucket` y `file_path` server-side con RLS. |
| `list-pedido-files.ts` | Lista metadata segura de archivos de pedido. |
| `list-solicitud-files.ts` | Lista metadata segura de archivos de solicitud. |
| `upload-pedido-file.ts` | Sube archivo interno de pedido y guarda metadata. |
| `upload-public-solicitud-file.ts` | Sube uno o varios archivos publicos de solicitud y guarda metadata. |
| `index.ts` | Barrel publico del dominio Storage. |
| `README.md` | Mapa operativo vigente del dominio. |

Rutas principales:

```text
solicitudes/{solicitud_id}/originales/{timestamp}-{uuid}-{filename}
pedidos/{pedido_id}/internos/{timestamp}-{filename}
pedidos/{pedido_id}/avances/{timestamp}-{filename}
pedidos/{pedido_id}/finales/{timestamp}-{filename}
```

`file_path` se construye en `buildSolicitudFilePath` y
`buildPedidoFilePath`. No debe aceptarse desde formularios, componentes o rutas
publicas.

## 4. Flujos de subida

### 4.1 Subida publica desde solicitud

Origen:

- `src/components/solicitudes/PublicSolicitudForm.tsx`
- `src/app/solicitud/actions.ts`
- `src/lib/storage/upload-public-solicitud-file.ts`

Flujo:

1. El cliente usa `/solicitud`.
2. La Server Action lee campos permitidos y archivos desde `FormData`.
3. Antes de crear solicitud valida cantidad maxima y archivo basico con
   `validateStorageFile(file)`.
4. Para `impresion`, exige al menos un archivo.
5. Crea la solicitud con `createPublicSolicitud`.
6. Si hay archivos, llama `uploadPublicSolicitudFiles`.
7. Cada archivo se valida con contexto `cliente_solicitud`, `solicitudId` y
   `pedidoId = null`.
8. Se construye ruta `solicitudes/{solicitud_id}/originales/...`.
9. Se sube a `godel-files`.
10. Se inserta metadata en `archivos` con `pedido_id = null`,
    `uploaded_by = null`, `bucket = godel-files` y
    `visibility = cliente_solicitud`.

Validacion:

- maximo 5 archivos;
- maximo 20 MB por archivo;
- extension permitida;
- MIME permitido;
- combinacion extension/MIME;
- bloqueo de extensiones peligrosas;
- UUID de solicitud valido;
- ruta coherente con `solicitud_id`;
- metadata anonima solo si el objeto existe y no tiene registro previo.

Permisos:

- `anon` puede insertar objetos y metadata solo para solicitudes publicas
  validas;
- `anon` no puede leer, listar, actualizar ni eliminar archivos.

Si falla upload, no se inserta metadata. Si falla metadata despues de subir el
objeto, la solicitud queda creada y la UI recibe una advertencia segura. Puede
quedar un objeto sin metadata; no se abre borrado anonimo.

### 4.2 Subida interna desde pedido

Origen:

- `src/components/storage/PedidoFilesSection.tsx`
- `src/app/dashboard/pedidos/[id]/actions/file-actions.ts`
- `src/lib/storage/upload-pedido-file.ts`

Flujo:

1. La pagina de detalle de pedido enlaza `pedidoId` a la action.
2. El formulario envia solo el archivo real.
3. `uploadPedidoFileAction` llama `uploadPedidoFile`.
4. El servicio valida UUID, perfil activo y `pedidos.view`.
5. Carga el pedido mediante RLS.
6. Deriva categoria por estado:
   - `creado`, `solicitud_recibida`, `en_revision` -> `interno_pedido`;
   - `en_produccion` -> `avance`;
   - `listo_entrega` -> `final_entrega`;
   - `entregado` y `cancelado` bloquean subida.
7. Valida archivo y contexto.
8. Construye ruta `pedidos/{pedido_id}/{carpeta}/...`.
9. Sube objeto a `godel-files`.
10. Inserta metadata en `archivos`.
11. Si falla metadata, intenta borrar el objeto como cleanup best-effort.

Permisos:

- admin y supervisor pueden subir a pedidos accesibles;
- trabajador asignado puede subir al pedido asignado mientras el estado lo
  permita;
- trabajador no asignado no puede cargar el pedido ni pasar RLS/policies.

Errores al usuario son seguros y no filtran SQL, `file_path` ni detalles de
Storage.

## 5. Flujos de listado

### 5.1 Listado de archivos de pedido

Servicio: `listPedidoFiles(pedidoId)`.

Validaciones:

- UUID valido;
- perfil interno activo;
- existencia/acceso al pedido mediante RLS.

DTO devuelto:

- `id`;
- `file_name`;
- `file_type`;
- `file_size`;
- `visibility`;
- `created_at`;
- `uploaded_by`;
- `uploadedBy` con `id`, `full_name`, `role` cuando aplica.

Campos prohibidos en UI:

- `file_path`;
- bucket;
- rutas privadas;
- signed URLs persistentes;
- metadata cruda.

Los archivos heredados de solicitud aparecen porque el listado filtra por
`pedido_id` e incluye `visibility = cliente_solicitud`.

### 5.2 Listado de archivos de solicitud

Servicio: `listSolicitudFiles(solicitudId)`.

Validaciones:

- UUID valido;
- perfil activo;
- permiso `solicitudes.view`;
- RLS sobre `archivos`.

DTO devuelto:

- `id`;
- `file_name`;
- `file_type`;
- `file_size`;
- `visibility`;
- `created_at`.

El listado pertenece al detalle interno de solicitud. No hay listado publico ni
descarga publica de archivos de solicitud.

## 6. Flujos de descarga

Route handlers existentes:

- `src/app/dashboard/pedidos/[id]/archivos/[fileId]/download/route.ts`
- `src/app/dashboard/solicitudes/[id]/archivos/[fileId]/download/route.ts`

Flujo de pedido:

1. Valida UUIDs de pedido y archivo.
2. Consulta `archivos` por `id` y `pedido_id`.
3. RLS decide si el usuario puede ver ese registro.
4. Llama `createSignedFileUrl(archivo.id)`.
5. Redirige a signed URL.

Flujo de solicitud:

1. Valida UUIDs de solicitud y archivo.
2. Valida perfil activo y `solicitudes.view`.
3. Consulta `archivos` por `id` y `solicitud_id`.
4. Verifica `bucket = godel-files`.
5. Llama `createSignedFileUrl(archivo.id)`.
6. Redirige a signed URL.

`createSignedFileUrl` lee `id`, `bucket` y `file_path` server-side, valida que
el bucket sea `godel-files` y usa `createSignedUrl` con expiracion de 120
segundos. `file_path` y bucket no llegan a Client Components; solo se devuelve
la redireccion desde el route handler.

## 7. Relacion con Solicitudes y Pedidos

`public.archivos` relaciona archivos con:

- `solicitud_id`;
- `pedido_id`;
- `visibility`;
- `bucket`;
- `file_path`;
- `uploaded_by`.

Solicitud publica:

- usa `solicitud_id`;
- deja `pedido_id = null`;
- usa `visibility = cliente_solicitud`;
- deja `uploaded_by = null`.

Pedido interno:

- usa `pedido_id`;
- deja `solicitud_id = null` para archivos propios;
- usa `interno_pedido`, `avance` o `final_entrega`;
- guarda `uploaded_by` con el perfil actual.

Herencia al convertir:

- la RPC `public.convertir_solicitud_a_pedido` actualiza
  `public.archivos.pedido_id` para archivos de la solicitud;
- conserva `solicitud_id`, `bucket`, `file_path`, `visibility` y
  `uploaded_by`;
- no mueve ni copia objetos fisicos en Storage;
- no genera `archivo_subido` de pedido para archivos heredados.

Esto permite que admin/supervisor sigan viendo el archivo desde solicitud y que
el trabajador asignado pueda accederlo desde el pedido generado si RLS lo
permite.

## 8. Relacion con rutas publicas

`/solicitud` puede subir archivos despues de crear una solicitud valida. El
cliente externo no recibe signed URLs, bucket ni rutas internas.

`/estado` no debe listar, descargar ni revelar archivos. El contrato de
`src/lib/public-tracking` esta basado en allowlist y no incluye archivos,
`file_path`, bucket, rutas privadas, signed URLs, `order_number`, pagos ni
datos internos.

Cualquier cambio que agregue archivos a rutas publicas debe considerarse cambio
de seguridad publica y pasar por checklist de ruta publica, RLS/policies,
documentacion y `audit:public-tracking`.

## 9. Evaluacion de archivos principales

| Archivo | Responsabilidad | Riesgo | Recomendacion |
|---|---|---|---|
| `src/lib/storage/constants.ts` | Constantes de bucket, limites, MIME, extensiones y carpetas. | Medio si diverge de SQL. | Mantener sincronizado con migrations/policies. |
| `src/lib/storage/types.ts` | Contratos de Storage y DTOs seguros. | Bajo-medio. | Mantener listados sin `file_path` ni bucket. |
| `src/lib/storage/file-name.ts` | Sanitizar nombres. | Medio por entrada externa. | Mantener simple y probado con casos raros. |
| `src/lib/storage/file-paths.ts` | Construir rutas internas. | Alto por `file_path`. | Conservar server-side; no aceptar rutas desde UI. |
| `src/lib/storage/file-validation.ts` | Validar archivo, categoria y contexto. | Alto por seguridad de uploads. | Consolidar primero en Beta 2.6.2. |
| `src/lib/storage/upload-public-solicitud-file.ts` | Subida anonima controlada y metadata. | Medio por no atomicidad objeto/metadata. | Mantener deuda de reconciliacion; no abrir delete anonimo. |
| `src/lib/storage/upload-pedido-file.ts` | Subida interna de pedido y cleanup best-effort. | Medio. | Revisar errores y cleanup en fase de uploads. |
| `src/lib/storage/list-pedido-files.ts` | Listado seguro de archivos de pedido. | Bajo-medio. | Mantener DTO minimo; revisar uploader si cambia perfiles. |
| `src/lib/storage/list-solicitud-files.ts` | Listado seguro de archivos de solicitud. | Bajo. | Mantener interno y sin `file_path`. |
| `src/lib/storage/signed-url.ts` | Signed URL server-side desde metadata. | Alto por acceso a `file_path`. | Mantener solo servidor y expiracion corta. |
| `src/app/solicitud/actions.ts` | Crea solicitud y coordina uploads publicos. | Medio. | Mantener action fina; extraer helper solo si reduce claridad. |
| `src/app/dashboard/pedidos/[id]/actions/file-actions.ts` | Action de subida interna. | Bajo-medio. | Mantener como adaptador fino. |
| `src/app/dashboard/pedidos/[id]/archivos/[fileId]/download/route.ts` | Descarga interna de pedido. | Medio. | Candidato a helper compartido con solicitud. |
| `src/app/dashboard/solicitudes/[id]/archivos/[fileId]/download/route.ts` | Descarga interna de solicitud. | Medio. | Candidato a helper compartido con pedido. |
| `src/components/storage/PedidoFilesSection.tsx` | UI de listado/subida/descarga de pedido. | Bajo-medio. | No pasar `file_path`; mantener formulario con solo archivo. |
| `src/components/storage/SolicitudFilesSection.tsx` | UI de listado/descarga de solicitud. | Bajo. | No pasar `file_path`; mantener links a route handler. |
| `src/components/solicitudes/PublicSolicitudForm.tsx` | UI publica con input multiple de archivos. | Medio por flujo publico. | Mantener validacion server-side como autoridad. |
| `src/lib/pedidos/create-pedido-from-solicitud.ts` | Valida conversion y delega RPC. | Alto por flujo multi-tabla. | No mover herencia de archivos a TypeScript. |
| `src/lib/pedidos/rpc.ts` | Wrapper de RPCs de pedidos. | Bajo. | Mantener conversion centralizada. |
| `src/lib/solicitudes/README.md` | Documenta relacion con Storage. | Bajo. | Actualizar al cerrar Beta 2.6 si cambia criterio. |
| `src/lib/public-tracking/get-public-tracking-status.ts` | DTO publico de `/estado`. | Alto por seguridad publica. | No agregar archivos ni rutas privadas. |
| `supabase/migrations/20260625000400_04_storage.sql` | Bucket, helpers y policies de Storage. | Alto. | No tocar sin fase SQL/RLS explicita. |
| `supabase/migrations/20260625000500_05_final_hardening.sql` | Hardening de grants, bucket privado y policies. | Alto. | Mantener como verificacion de seguridad. |

## 10. Patrones repetidos o deuda tecnica

- Validacion de archivos vive bien centralizada, pero debe mantenerse alineada
  con SQL, bucket native limits y policies.
- Path builders de TS y helpers SQL duplican estructura de rutas; es una
  duplicacion defensiva que debe documentarse y probarse.
- Metadata de `archivos` se inserta despues del objeto; no hay transaccion
  atomica entre Storage y Postgres.
- Upload publico no limpia objeto si falla metadata; upload interno intenta
  cleanup best-effort.
- Route handlers de descarga repiten validacion de UUID, consulta de archivo y
  redireccion a signed URL.
- Los DTOs de pedido y solicitud son seguros, pero cualquier nuevo listado debe
  evitar `file_path`, bucket y metadata cruda.
- Revalidacion de pedido tras upload ya usa helper; solicitudes publicas no
  revalidan dashboard porque son flujo externo.
- No hay reconciliacion de objetos sin metadata.
- No hay logs operativos agregados ni monitoreo de Storage.
- No hay QA e2e focal solo de Storage; hoy Storage queda cubierto sobre todo
  por full visual QA y specs publicas.
- Policies de Supabase Storage son parte critica de la seguridad y no deben
  cambiarse como refactor de TypeScript.

## 11. Hallazgos clasificados

| Severidad | Area | Hallazgo | Riesgo | Recomendacion |
| --------- | ---- | -------- | ------ | ------------- |
| Alto | Signed URLs | `createSignedFileUrl` lee `file_path` server-side y genera URL de descarga. No hay fuga actual, pero es punto sensible. | Exposicion de rutas privadas si se reutiliza mal en componentes o APIs publicas. | Mantenerlo server-side y detras de route handlers internos. |
| Alto | Policies Storage/RLS | La seguridad depende de RLS en `archivos` y policies de `storage.objects`. | Drift si se cambia TS sin SQL/RLS o viceversa. | Cualquier cambio de permisos/paths debe tener fase SQL/RLS, docs y QA. |
| Medio | Upload publico | Storage y metadata no son atomicos. | Objetos huerfanos si falla metadata despues del upload. | Disenar reconciliacion interna; no abrir borrado anonimo. |
| Medio | Upload publico | No hay rate limiting, captcha, honeypot, antivirus ni monitoreo operativo. | Abuso de `/solicitud` o consumo de Storage en produccion publica. | Tratar como hardening operativo posterior, no como refactor. |
| Medio | Route handlers | Descargas de pedido y solicitud comparten patron pero estan duplicadas. | Cambios futuros pueden divergir. | Consolidar helper pequeno en Beta 2.6.5 si reduce duplicacion. |
| Medio | Validacion TS/SQL | Listas de MIME/extensiones y reglas de ruta existen en TS y SQL. | Drift de validacion entre app y DB. | Consolidar documentacion y pruebas focales de validacion. |
| Bajo | Listados | `listPedidoFiles` y `listSolicitudFiles` usan DTOs seguros separados. | Duplicacion menor. | Mantener separados salvo que un mapper compartido reduzca claridad. |
| Bajo | UI | Componentes de archivos formatean tamano y renderizan links internos. | Duplicacion visual menor. | Extraer helper de formato si crece, sin tocar seguridad. |
| Observacion | Seguridad | No se detecta bucket publico, lectura anonima, descarga publica ni exposicion de archivos en `/estado`. | N/A | Mantener reglas actuales. |
| Observacion | Historial | Inserciones de metadata registran eventos seguros sin `file_path`. | N/A | Mantener metadata de historial sin rutas privadas. |

No se detecta hallazgo critico: no hay evidencia de bucket publico, bypass
confirmado de permisos, descarga anonima o exposicion real de `file_path` en UI
publica.

## 12. Plan recomendado para Beta 2.6

1. Beta 2.6.2 - Consolidar validacion y path builders de Storage.
   - Revisar `constants.ts`, `file-validation.ts`, `file-paths.ts` y helpers
     SQL relacionados.
   - Confirmar alineacion TS/SQL para MIME, extensiones, tamano y rutas.
   - No cambiar comportamiento ni ampliar formatos.

2. Beta 2.6.3 - Consolidar DTOs seguros y listados de archivos.
   - Revisar `types.ts`, `list-pedido-files.ts`, `list-solicitud-files.ts` y
     componentes consumidores.
   - Mantener DTOs sin `file_path`, bucket ni signed URLs.

3. Beta 2.6.4 - Revisar uploads y metadata.
   - Revisar `upload-public-solicitud-file.ts`, `upload-pedido-file.ts`,
     actions y mensajes seguros.
   - Documentar estrategia de cleanup/reconciliacion sin abrir permisos
     anonimos.

4. Beta 2.6.5 - Revisar route handlers de descarga y signed URLs.
   - Evaluar helper compartido para descarga interna.
   - Mantener pertenencia, RLS, bucket privado y expiracion corta.

5. Beta 2.6.6 - QA e2e focal de Storage si aplica.
   - Cubrir subida publica valida/invalida.
   - Cubrir listado/descarga interna por rol.
   - Cubrir ausencia de `file_path` en UI y `/estado`.

6. Beta 2.6.7 - Documentar y cerrar dominio Storage.
   - Actualizar README de `src/lib/storage`, `docs/STORAGE_MODEL.md` y deuda
     tecnica si hubo cambios.

## 13. Que NO conviene hacer

- No abrir bucket publico.
- No exponer `file_path`.
- No devolver bucket/rutas privadas a Client Components.
- No agregar signed URLs persistentes.
- No permitir descargas desde `/estado`.
- No usar `service_role`.
- No agregar `SUPABASE_SERVICE_ROLE_KEY`.
- No cambiar policies Storage/RLS sin fase explicita.
- No implementar antivirus/captcha/rate limiting en esta beta como si fuera
  refactor.
- No implementar reconciliacion de objetos huerfanos sin diseno operativo.
- No crear `src/services`.
- No mover herencia de archivos fuera de la RPC de conversion.
- No aceptar `visibility`, `bucket`, `file_path`, `uploaded_by`, `file_name`,
  `file_type` o `file_size` desde formularios como fuente de verdad.

## 14. Checklist de cierre de auditoria

- [x] Reviso `src/lib/storage`.
- [x] Reviso subida publica.
- [x] Reviso subida interna.
- [x] Reviso listados.
- [x] Reviso descargas.
- [x] Reviso signed URLs.
- [x] Reviso relacion con solicitudes.
- [x] Reviso relacion con pedidos.
- [x] Reviso rutas publicas.
- [x] Reviso RLS/policies relevantes.
- [x] Reviso riesgos de exposicion.
- [x] Propuso subfases.
- [x] No modifico codigo funcional.
