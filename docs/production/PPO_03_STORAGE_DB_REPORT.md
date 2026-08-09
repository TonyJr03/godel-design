# PPO-03B.1 — Modelo DB, RLS y Storage policies

## Resultado

**Estado: validada localmente con advertencia de versión.**

La migración incremental `20260809000100_07_ppo03b_upload_sessions_storage.sql`
crea el control plane privado de PPO-03 para sesiones e items de carga y añade
policies de Storage conscientes de la operación. No se aplicó SQL remoto, no se
desplegó infraestructura y no se modificaron las rutas de upload existentes ni
los flujos de aplicación.

## Alcance ejecutado

- Enums `archivo_carga_sesion_estado` y `archivo_carga_item_estado`.
- Tablas `archivo_carga_sesiones` y `archivo_carga_items`, con contexto
  exclusivo solicitud/pedido, límite persistido de 10 items, expiración,
  constraints de path, descriptor de archivo y estado committed.
- Índices por contexto, estado/expiración y unicidad parcial de
  `public_token_hash` y `archivo_id` cuando no son nulos.
- RLS activa y revocación de CRUD directo para `anon` y `authenticated`.
- Helpers privados para autorizar reserva pública, creación interna, lectura de
  objetos committed y borrado administrativo/supervisor.
- Policies nuevas para firma pública, creación TUS interna con `create` y
  `part`, lectura authenticated de committed y borrado administrativo. No hay
  policy TUS regular para `anon`, ni `storage.tus.upload.get` o delete TUS.
- Bucket `godel-files` mantenido privado, limitado a 20 MiB y con MIME
  canónicos para PDF, JPG/JPEG, PNG, WEBP, DOC, DOCX, ZIP, RAR y CDR, además
  de `application/x-zip-compressed` para compatibilidad legacy.
- Tipos regenerados en `src/types/database.types.ts`.

## Decisiones de seguridad

La sesión pública persiste únicamente `public_token_hash`; no existe columna
para token en claro. El token de capacidad sigue siendo responsabilidad del
control plane futuro. La policy de Storage valida una ruta reservada y no
expirada; su capacidad no concede lectura, listado, update ni delete anónimo.

Las rutas nuevas siguen la forma
`cargas/v1/{session_id}/{item_id}/{storage_nonce}-{safe_filename}`. El nonce y
los UUIDs actúan como locator no adivinable, pero no sustituyen RLS, la sesión ni
el token del control plane.

`public.archivos` continúa representando únicamente archivos committed. Los
items reservados no tienen metadata operativa ni son legibles mediante la policy
nueva hasta que PPO-03C implemente finalize idempotente.

## Validación local

1. `supabase db reset`: reconstrucción satisfactoria desde cero con las seis
   migraciones baseline y la séptima migración PPO-03B.1.
2. `supabase gen types typescript --local`: tipos regenerados desde el esquema
   resultante.
3. `scripts/spikes/ppo-03b1/validate.sql`: prueba reversible (`BEGIN` /
   `ROLLBACK`) satisfactoria de:
   - tablas, enums, RLS, grants y helpers operation-aware;
   - sesión e item público válidos;
   - hash público inválido, MIME/extensión no permitidos y path con item UUID
     incorrecto rechazados por constraints;
   - sesión expirada no elegible para firma;
   - firma pública bajo `storage.object.sign_upload_url`;
   - inserción interna reservation-aware con `create` y prueba unitaria de
     `part`; el transporte real se cubre en el smoke focal;
   - ausencia de TUS regular público.
4. `supabase db lint --local`: sin errores de esquema.
5. `npm run lint` y `npm run build`: satisfactorios.

## Corrección y revalidación

La revisión arquitectónica corrigió la misma migración 07, aún no promovida:

- TUS interno autoriza solamente `storage.tus.upload.create` y
  `storage.tus.upload.part` con el helper reservation-aware existente.
- Se eliminó la policy de TUS regular para `anon`. El flujo público obtiene la
  firma bajo `storage.object.sign_upload_url` y transfiere solo mediante
  `/storage/v1/upload/resumable/sign` con `x-signature`.
- Se restauró `application/x-zip-compressed` en el bucket para no romper rutas
  legacy; el descriptor nuevo mantiene ZIP normalizado como `application/zip`.
- `original_name` preserva el nombre visible y valida extensión compatible de
  forma case-insensitive; el segmento seguro sigue siendo exclusivo del path.
- Un item no committed no puede tener `archivo_id`; un committed puede retener
  histórico aunque esa FK quede nula por `ON DELETE SET NULL`.
- Lectura verifica metadata exacta. Para archivos de solicitud heredados permite
  al trabajador asignado del pedido leer el mismo objeto sin moverlo.
- La preselección de Storage para `storage.object.delete` y
  `storage.object.delete_many` usa la misma autorización administrativa que la
  policy DELETE, para que cleanup pueda borrar staged sin abrir lectura normal.

El smoke real `npm run spike:ppo-03b1:local` usó payload de 7 MiB y confirmó
POST, PATCH, interrupción, HEAD, reanudación, finalización, existencia del
objeto y cleanup tanto para JWT interno como para TUS público firmado. También
confirmó que el endpoint TUS regular anónimo rechaza el mismo path reservado.

La CLI local es 2.109.1. PostgreSQL local se actualizó a 17.6.1.155; Storage API
permanece en v1.62.5 mientras la referencia vinculada indica v1.68.1. Los
helpers operation-aware requeridos existen y las pruebas pasaron, pero debe
repetirse la validación con la imagen Storage vinculada antes de promover la
migración fuera de desarrollo.

## Pendiente

- PPO-03C: Server Actions/RPCs finas para reservar, validar token, firmar y
  finalizar de forma idempotente.
- PPO-03D y PPO-03E: migrar los flujos interno y público sin enviar bytes a
  Next.js.
- PPO-03F: expiración, reconciliación y cleanup seguros.
- PPO-03G: QA de transferencia real integral y retiro de los límites
  transitorios de 110 MB.
