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
- Policies nuevas para firma pública, creación TUS pública, creación TUS
  interna, lectura authenticated de committed y borrado administrativo. No se
  habilitaron `storage.tus.upload.part` ni `storage.tus.upload.get`.
- Bucket `godel-files` mantenido privado, limitado a 20 MiB y con MIME
  canónicos para PDF, JPG/JPEG, PNG, WEBP, DOC, DOCX, ZIP, RAR y CDR.
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
   - inserción real de Storage pública con
     `storage.object.sign_upload_url`;
   - inserción real interna con JWT de fixture y
     `storage.tus.upload.create`;
   - rechazo real de una inserción pública bajo
     `storage.tus.upload.part`.
4. `supabase db lint --local`: sin errores de esquema.
5. `npm run lint` y `npm run build`: satisfactorios.

La CLI local utilizó imágenes ya disponibles de Supabase PostgreSQL 17.6.1.143
y Storage API v1.62.5 mientras la referencia vinculada indica versiones más
recientes. Los helpers operation-aware requeridos existen y las pruebas pasaron,
pero debe repetirse el reset con las imágenes vinculadas cuando su descarga local
esté disponible antes de promover la migración fuera de desarrollo.

## Pendiente

- PPO-03C: Server Actions/RPCs finas para reservar, validar token, firmar y
  finalizar de forma idempotente.
- PPO-03D y PPO-03E: migrar los flujos interno y público sin enviar bytes a
  Next.js.
- PPO-03F: expiración, reconciliación y cleanup seguros.
- PPO-03G: QA de transferencia real integral y retiro de los límites
  transitorios de 110 MB.
