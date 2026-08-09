# PPO-03A.2 — Informe de spike TUS y signed upload token

## Metadatos

- Estado: Ejecutado — bloqueado para cierre.
- Fase: PPO-03A.2.
- Fecha: 2026-08-09.
- Rama inicial: `preprod/ppo-03-file-flow-redesign`.
- HEAD inicial de la continuación: `dcaa6b0ad6ba6fefa6fa3d49cf3a904830609558`.

## Propósito y límites

El spike es reversible: valida cliente Supabase normal →
`createSignedUploadUrl()` → signed upload token → Chromium → TUS → Storage,
sin que bytes atraviesen Next.js. No implementa el flujo de PPO-03, no crea
migraciones, tablas, RPCs, rutas, Server Actions ni componentes productivos, y
no modifica Solicitudes, Pedidos, paths históricos ni los límites transitorios
de 110 MB.

El harness reproducible es `scripts/spikes/ppo-03a2/run.mjs`. Usa Chromium
headless desde un origen HTTP efímero que no pertenece a Next.js. El navegador
recibe endpoint, path, metadata TUS, signed token y la publishable key pública
como `apikey`; nunca recibe `Authorization`, una sesión Auth, secret key ni
service role. No imprime tokens, claves, contraseñas, UUID ni host administrado.

Se añadió `tus-js-client` 4.3.1 como dependencia de desarrollo del spike.
`GODEL_TEST_ADMIN_*` se usa exclusivamente para local y
`GODEL_MANAGED_TEST_ADMIN_*` exclusivamente para administrado; no hay valores
en archivos versionados.

## Historial de ejecución

### Ejecución inicial

La primera ejecución documentó transporte firmado local controlado y los MIME
de Chromium, pero quedó incompleta: no había un Pedido QA local accesible, las
credenciales locales no autenticaban contra administrado, el token público fue
rechazado con HTTP 400 y la prueba de reanudación abortaba antes de confirmar una
sesión TUS persistida. Esa evidencia se conserva como antecedente; no se usa
para aprobar reanudación ni backend administrado.

MIME observados entonces y retenidos (archivos temporales, sin inspección de
contenido): RAR `application/x-compressed`, CDR vacío, ZIP
`application/x-zip-compressed` y PDF `application/pdf`.

### Ejecución corregida

El harness ahora crea un `File` único por transferencia, configura
`uploadDataDuringCreation: false`, espera `onUploadUrlAvailable`, espera
`onChunkComplete` después del primer PATCH, ejecuta `abort(false)`, busca la
subida previa con el mismo fingerprint, exige encontrarla, reanuda con otra
instancia y exige que el primer progreso de la reanudación no sea cero.

La instrumentación sanitizada de XHR registra solamente método, estado y
presencia booleana de cabeceras. Para toda transferencia válida exige
`x-signature` y `apikey` en POST, HEAD y PATCH, y rechaza cualquier
`Authorization`.

| Comprobación | Local | Administrado por HTTPS |
| --- | --- | --- |
| QA normal del entorno | Correcto | Correcto con `GODEL_MANAGED_TEST_ADMIN_*` |
| Origen de bytes | Storage directo, no Next.js | Storage directo, no Next.js |
| `Authorization` en navegador | Ausente | Ausente |
| `x-signature` + `apikey` | Presentes en POST/HEAD/PATCH | Presentes en POST/HEAD/PATCH |
| Conteo sanitizado POST / HEAD / PATCH | 3 / 2 / 6 | 1 / 1 / 2 |
| Control firmado normal, multichunk | Correcto | Correcto con 7 MiB (> chunk de 6 MiB) |
| Reanudación real sin reiniciar a cero | Correcta | Correcta en el control firmado |
| `upsert = false` | Colisión rechazada en autorización | Colisión rechazada en autorización |
| Cleanup del control | Correcto | Correcto |

El control firmado crea una solicitud fixture descartable con el usuario QA
normal y no inserta metadata en `public.archivos`.

## Caso público local temporal

La policy histórica pública exige metadata de `storage.objects`, pero la
emisión anónima de `createSignedUploadUrl()` ocurre antes de que exista el
objeto y devolvía HTTP 400. Para aislar esa hipótesis sin tocar migraciones se
aplicó solo durante `spike:ppo-03a2:local` la policy temporal
`godel_files_insert_ppo03a2_public_sign`.

Su alcance es estricto: solo `anon INSERT` sobre `godel-files`, solo la ruta
histórica `solicitudes/{id}/originales/ppo-03a2-...`, solo si existe la solicitud
y sin depender de metadata del objeto. No abre SELECT, listado, UPDATE ni DELETE
anónimos. El helper SQL temporal existe únicamente para comprobar la solicitud
con privilegio acotado y se elimina con la policy.

Resultado local: el token anónimo fue emitido, TUS multichunk completó,
`findPreviousUploads()` encontró la carga interrumpida, la reanudación no
empezó en cero y una colisión con `upsert=false` fue rechazada. El objeto y la
solicitud fixture se eliminaron con cliente normal.

La ejecución hace cleanup defensivo al inicio, instala la policy, ejecuta el
spike y la elimina en `finally`. Si el proceso se interrumpe abruptamente, el
comando seguro e idempotente es:

```text
npm.cmd run spike:ppo-03a2:local:cleanup
```

La ejecución final confirmó `cleanup_completed=true`; no queda la policy ni el
helper temporal local.

## Casos que siguen bloqueados

### Pedido interno local

Un Pedido QA accesible por RLS estuvo disponible y pudo emitir su signed upload
token con cliente normal. Chromium llegó directo al endpoint con `x-signature`
y `apikey`, sin `Authorization`, pero Storage rechazó el POST con HTTP 403. La
policy temporal no cubre ni debe cubrir `pedidos/...`; ese resultado demuestra
que el contrato de policy actual para rutas internas no es suficiente para el
data plane firmado sin sesión Auth en navegador. No hubo objeto ni metadata
operativa persistida.

### Flujo público administrado

Contra Supabase administrado no se aplicó policy temporal ni SQL remoto. La
autenticación QA normal y el control firmado completaron, pero la emisión
anónima del signed upload token para la ruta pública fue rechazada con HTTP 400.
Por tanto no se inició transporte público remoto. El caso interno administrado
no tuvo Pedido accesible por RLS y no se fabricó uno persistente.

Estas dos diferencias son de autorización/policy, no evidencia de que TUS o el
signed token sean inviables: el control firmado administrado sí completó la
transferencia, reanudación y colisión sin bytes por Next.js.

## Limpieza y seguridad

Cada caso elimina su objeto y solicitud fixture. Además, antes y después de
correr busca exclusivamente fixtures con el nombre dedicado del spike y elimina
sus objetos `ppo-03a2-...` antes de borrar la solicitud; esto recupera de forma
defensiva un intento interrumpido. No se elimina el Pedido QA creado manualmente
para la prueba interna. No hay binarios, tokens, credenciales, UUID, resultados
sensibles ni cambios de base de datos versionados.

No se usaron service role, secret key, cliente admin de Storage, PostgreSQL
remoto ni políticas remotas. RAR, CDR y ZIP siguen siendo opacos; el spike no
demuestra magic bytes, antivirus, análisis profundo, TTL, staging real ni
finalize.

## Refinamiento pendiente para PPO-03B

La futura ruta sigue siendo conceptual y no está implementada:

```text
cargas/v1/{session_id}/{item_id}/{storage_nonce}-{safe_filename}
```

`storage_nonce` será opaco, generado server-side y no sustituye los IDs de
sesión/item ni constituye un secreto de autorización. El path completo no se
expondrá a UI, DTOs ni logs. El token público de control plane seguirá
persistiéndose solo como hash; no se almacenará ningún signed upload token.

Antes de iniciar PPO-03B, Arquitectura/Dirección Técnica debe decidir y aprobar
la representación de autorización que permita tanto la emisión pública como el
POST TUS interno firmado sin abrir permisos anónimos generales ni reenviar Auth
al navegador. La policy temporal de este spike no es diseño ni precedente de
producción.

## Conclusión y decisión

Veredicto:

```text
Bloqueado
```

TUS firmado, `apikey`, reanudación real, multichunk, `upsert=false`, ausencia de
`Authorization` y limpieza están demostrados en controles local y administrado.
PPO-03A.2 no cumple aún su criterio de cierre porque el flujo público
administrado continúa sin emitir token y la ruta interna de Pedido no admite el
POST firmado sin Auth. PPO-03B no inicia y las cargas productivas actuales siguen
intactas.
