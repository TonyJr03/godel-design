# PPO-03A.2 — Informe de spike TUS y signed upload token

## Metadatos

- Estado: Ejecutado — Aprobado con condiciones.
- Fase: PPO-03A.2.
- Fecha: 2026-08-09.
- Rama inicial de la continuación final: `preprod/ppo-03-file-flow-redesign`.
- HEAD inicial: `96d891aeddb854a47a28a1e5daa1c995bee945ba`.

## Propósito y alcance

El spike es reversible y no implementa el flujo productivo de PPO-03. Verifica
que los bytes viajen de Chromium a Supabase Storage mediante TUS, sin pasar por
Next.js, Server Actions, Route Handlers ni Nginx. No crea migraciones, tablas,
RPCs, rutas, componentes ni cambios en Solicitudes, Pedidos, paths históricos o
límites transitorios de 110 MB.

El harness reproducible es `scripts/spikes/ppo-03a2/run.mjs`; usa un origen HTTP
efímero independiente de la aplicación, Chromium headless y `tus-js-client`
4.3.1 como dependencia de desarrollo. No persiste ni imprime JWT, signed upload
token, publishable key, contraseña, UUID ni host administrado.

## Historial y corrección arquitectónica

El primer intento local demostró TUS presigned en una ruta pública controlada,
pero no disponía de Pedido QA ni de credenciales administradas. El segundo intento
añadió credenciales separadas, reanudación correcta y policy temporal local; al
probar una ruta de Pedido con signed token sin `Authorization`, Storage respondió
403.

Ese 403 fue útil: el token firmado no conserva la identidad necesaria para que
las policies internas evalúen `auth.uid()`. La arquitectura final del spike no
fuerza un único mecanismo de autorización:

- `authenticated`: TUS con `apikey`, `Authorization: Bearer <access_token>` y
  `x-upsert: false`; no envía `x-signature`. Corresponde a usuarios internos y
  conserva RLS del usuario real.
- `presigned`: TUS con `apikey`, `x-signature` y `x-upsert: false`; no envía
  `Authorization`. Corresponde al visitante público sin sesión Auth.

En ambos casos el JWT, cuando aplica, viaja directamente de la sesión propia del
navegador a Storage; Next.js no recibe el archivo ni el token como payload.
No se habilitó Anonymous Sign-In, service role, secret key ni cliente
administrativo de Storage.

## Resultados finales

| Caso | Resultado |
| --- | --- |
| Pedido QA local, `authenticated` | Correcto: ruta legacy válida por RLS, transferencia multichunk, reanudación, objeto verificable, colisión `upsert=false` rechazada y cleanup. |
| Control administrado, `authenticated` | Correcto con usuario QA administrado y solicitud fixture descartable: TUS directo, multichunk, reanudación, colisión rechazada, objeto/fixture eliminados. |
| Público local, `presigned` | Correcto con policy temporal: emisión anónima de token, TUS multichunk, reanudación, colisión rechazada y cleanup. |
| Público administrado, `presigned` | `expected_baseline_rejection`: la emisión anónima fue rechazada con HTTP 400; no se inició transferencia pública ni se aplicó SQL remoto. |

El caso interno local no llamó `createSignedUploadUrl()`. Obtuvo únicamente el
access token de la sesión QA normal, lo reenvió al endpoint TUS junto a la
publishable key y demostró que Storage conserva la identidad que evalúa RLS.
No insertó `public.archivos` ni modificó el Pedido QA.

El control administrado no creó Pedido remoto: utilizó una solicitud fixture
descartable porque el usuario interno ya tiene autorización sobre la ruta legacy
según el baseline. Las credenciales locales y administradas permanecen separadas
en `GODEL_TEST_ADMIN_*` y `GODEL_MANAGED_TEST_ADMIN_*`.

## Instrumentación sanitizada

La instrumentación XHR registra solo método, estado y presencia booleana de
cabeceras. Exige `apikey` en cada solicitud TUS e impide que una misma petición
porte a la vez `Authorization` y `x-signature`.

| Entorno | Modo | POST / HEAD / PATCH | Cabeceras verificadas |
| --- | --- | --- | --- |
| Local | `authenticated` | 10 / 2 / 6 | `apikey` y `Authorization`; sin `x-signature`. |
| Local | `presigned` | 1 / 1 / 3 | `apikey` y `x-signature`; sin `Authorization`. |
| Administrado | `authenticated` | 5 / 1 / 2 | `apikey` y `Authorization`; sin `x-signature`. |
| Administrado | `presigned` | 0 / 0 / 0 | No hubo transporte: la firma fue rechazada como baseline esperado. |

Para cada transferencia satisfactoria el harness crea un único `File`, configura
`uploadDataDuringCreation: false`, espera `onUploadUrlAvailable`, interrumpe con
`abort(false)` solo tras `onChunkComplete`, recupera el fingerprint con
`findPreviousUploads()` y exige que la reanudación no comience en cero. Hubo
progreso sobre más de un chunk en los tres controles correctos.

## Público local temporal y cleanup

El baseline histórico exige metadata de `storage.objects` al firmar una carga
pública, condición incompatible con la fase previa a la creación del objeto.
Solo durante `spike:ppo-03a2:local` se instala la policy temporal
`godel_files_insert_ppo03a2_public_sign`: permite únicamente `anon INSERT` en
`godel-files`, para `solicitudes/{id}/originales/ppo-03a2-...`, si existe la
solicitud y sin depender de metadata. No abre SELECT, listado, UPDATE ni DELETE
anónimos y no representa diseño de producción.

El harness limpia defensivamente antes y después de cada ejecución sus fixtures
dedicados y objetos `ppo-03a2-...`. La policy y su helper temporal se eliminan en
`finally`; para una interrupción abrupta existe el comando idempotente:

```text
npm.cmd run spike:ppo-03a2:local:cleanup
```

Se confirmó la eliminación de policy, helper, objetos y solicitudes fixture. No
se eliminó el Pedido QA local ni el usuario QA administrado. No quedaron
binarios, credenciales, JWT ni signed tokens versionados o persistidos.

## Público administrado y dirección PPO-03B/C

El rechazo HTTP 400 del público administrado se clasifica
`expected_baseline_rejection`, no fallo de PPO-03A.2. El backend administrado
mantiene la policy histórica, que no es compatible con pre-signing; la policy
pública reservation-aware exige las futuras entidades sesión/item de PPO-03B.
No se aplicó la policy temporal local ni SQL remoto. La validación pública
presigned en administrado será criterio obligatorio de PPO-03B/PPO-03C.

La documentación oficial actual de Supabase confirma que
`storage.allow_only_operation()` compara una operación exacta y que
`storage.allow_any_operation()` acepta una lista explícita. Las operaciones
actuales incluyen `storage.object.sign_upload_url`,
`storage.tus.upload.create`, `storage.tus.upload.part` y
`storage.tus.upload.get`. PPO-03B podrá separar la policy de firma de la policy
de creación/partes TUS, validando reserva, estado y expiración antes de exigir
metadata de item. No se implementó esa policy en este spike. Referencias:
[helpers de Storage](https://supabase.com/docs/guides/storage/schema/helper-functions)
y [operaciones actuales de Storage](https://github.com/supabase/storage/blob/master/src/http/routes/operations.ts).

La ruta futura sigue conceptual:

```text
cargas/v1/{session_id}/{item_id}/{storage_nonce}-{safe_filename}
```

`storage_nonce` será de alta entropía, no adivinable y transitoriamente sensible;
es una defensa frente a enumeración y adivinación. No se expondrá en DTOs,
listados ni logs, pero no sustituye el token de control plane, RLS ni la
autenticación general de la aplicación.

## MIME observados en Chromium sobre Windows

Los archivos temporales usados para esta medición no se inspeccionaron como
contenido. `File.type` observado: RAR `application/x-compressed`, CDR vacío,
ZIP `application/x-zip-compressed` y PDF `application/pdf`. RAR, CDR y ZIP
continúan siendo opacos; el spike no amplía allowlists, no valida magic bytes y
no implementa antivirus ni análisis profundo.

## Validaciones

- `npm.cmd run spike:ppo-03a2:local`: correcto.
- `npm.cmd run spike:ppo-03a2:managed`: correcto.
- `node --check scripts/spikes/ppo-03a2/run.mjs`: correcto.
- `npm.cmd run lint`: correcto.
- `npm.cmd run diff:check`: correcto.
- `npm.cmd run audit:security`: correcto, sin violaciones bloqueantes.

No se ejecutó E2E completo porque no hubo cambios UI ni flujo productivo. No se
modificaron migraciones, por lo que no corresponde reset ni regeneración de
tipos; se hicieron comprobaciones locales focales de policy, RLS y cleanup.

## Veredicto y condiciones

```text
Aprobado con condiciones
```

PPO-03A.2 queda cerrada como spike técnico. PPO-03B puede comenzar para diseñar
e implementar el modelo de sesiones/items y la policy pública reservation-aware.
Condiciones trasladadas:

1. Validar el upload público presigned en administrado después de PPO-03B/PPO-03C.
2. Definir TTL definitivos, expiración y reconciliación.
3. Mantener antivirus y escaneo profundo como pendientes.
4. Mantener antiabuso público en PPO-05.

Esto no declara implementado el nuevo flujo de cargas ni autoriza retirar los
límites de 110 MB.
