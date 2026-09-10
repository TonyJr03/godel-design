# SH-05.1 — Contrato de portabilidad clean-host y diseño de tooling

**Estado:** CLOSED / APPROVED
**SH:** OPEN
**SH-05:** ACTIVE
**SH-05.0:** CLOSED / APPROVED / PASS_PORTABILITY_DISCOVERY
**SH-05.1:** CLOSED / APPROVED
**SH-05.2:** CLOSED / APPROVED / PASS_MINIMAL_CLEAN_HOST_PORTABILITY_TOOLING
**SH-05.2A:** CLOSED / APPROVED / PASS_CANONICAL_SECURITY_AUDIT_REALIGNMENT
**SH-05.2B:** CLOSED / APPROVED / PASS_PULL_ONLY_IMAGE_AUTHORITY
**SH-05.2C:** CLOSED / APPROVED / PASS_RECONSTRUCTION_MANIFEST_BINDING
**SH-05.2D:** CLOSED / APPROVED / PASS_PROTECTED_EXACT_GENERATION_TRANSPORT
**SH-05.2E:** CLOSED / APPROVED / PASS_CLEAN_HOST_IDENTITY_EMPTY_STATE_GATE
**SH-05.2F:** CLOSED / APPROVED / PASS_IMMUTABLE_PULL_ONLY_IMAGE_ACQUISITION
**SH-05.2G:** CLOSED / APPROVED / PASS_VERIFIED_GODEL_IMAGE_BUILD
**SH-05.2H:** CLOSED / APPROVED / PASS_TRANSPORTED_RECONSTRUCTION_INPUT_ADMISSION
**SH-05.2I:** CLOSED / APPROVED / PASS_CLEAN_HOST_TARGET_BOOTSTRAP_FOUNDATION
**SH-05.2J:** CLOSED / APPROVED / PASS_EXACT_TARGET_GENERATION_ACTIVATION
**SH-05.2K:** CLOSED / APPROVED / PASS_CLEAN_HOST_OFFLINE_RECOVERY_DATA_MATERIALIZATION
**SH-05.2L:** CLOSED / APPROVED / PASS_CLEAN_HOST_RUNTIME_RECONSTRUCTION
**SH-05.3:** READY / NEXT
**Baseline de diseño:** cdbe742ba6c85d741ef37da6ad4bc18ffa3bea38

## Propósito y límites

Este documento es el contrato arquitectónico para SH-05.2 y SH-05.3. Diseña el
mecanismo mínimo, fail-closed y provider-neutral para reconstruir una instancia
aprobada de Godel + Supabase en un host limpio independiente. No implementa
scripts, no ejecuta Docker, no crea ni restaura backups, no exporta/importa
secretos y no accede a VPS, VM o producción.

El contrato de host es **PROVIDER_NEUTRAL_CLEAN_LINUX_DOCKER_HOST**. El primer
proof queda limitado a Linux amd64 y al modelo
**A_SEPARATE_DISPOSABLE**: daemon Docker, filesystem y ciclo de vida
independientes. Hosting DC es el proveedor operativo futuro seleccionado por
PPO, pero no aparece como dependencia de herramientas, rutas ni interfaces SH.

SH-05 prueba una reconstrucción privada con la configuración de rehearsal
seleccionada. PPO-04 conserva cualquier cambio real de dominio, URL pública,
TLS, bind/exposición, IP, configuración no secreta específica de proveedor o
VPS. SH-05 no despliega producción.

## SH-05.2E — gate de identidad y estado vacío

SH-05.2E implementa un preflight fail-closed y estrictamente read-only para el
modelo `A_SEPARATE_DISPOSABLE`: exige checkout Git exacto y limpio, host y daemon
Linux/amd64, Docker Compose con major soportado 2 o 5, Buildx disponible y ausencia de estado objetivo Godel /
Supabase. Reutiliza el lector canónico del reconstruction manifest con su sidecar;
no valida aún backup ni material protegido.

La autoridad de imagen distingue el `manifestDigest` del manifiesto exacto
linux/amd64 (no del índice multi-arquitectura) y el `configDigest` del contenido
local que ese manifiesto referencia. `VERIFIED_REGISTRY_PULL` y
`VERIFIED_OFFLINE_IMAGE_BUNDLE` son modos de adquisición equivalentes: ambos
deben probar plataforma y `configDigest` antes de publicar un `sourceRef` de
ejecución. El pin por digest garantiza identidad, pero no disponibilidad del
registry; VPN, reachability de Docker Hub y cualquier proveedor no son una
dependencia de software del contrato de portabilidad.

El gate bloquea, sin reparar ni borrar, proyectos Compose objetivo, red operadora,
volumen `db-config`, imágenes Godel locales, envs runtime, PGDATA, Storage y el
registro activo de generaciones. La cache de imágenes pull-only de terceros es no
autoritativa y permitida. Sus adaptadores por defecto sólo ejecutan consultas
read-only de Git/Docker; las pruebas usan adaptadores sintéticos y no acceden a
Docker real.

Quedan explícitamente fuera: adquisición de imágenes, bootstrap de estado target,
restore clean-host y una prueba real de portabilidad. Capacidad de disco frente al
backup se difiere al gate de input/bootstrap; la prueba de escritura xattr de
Storage al bootstrap target; y la conectividad de registry a la adquisición de
imágenes.

## SH-05.2F — adquisición inmutable de imágenes pull-only

SH-05.2F implementa la adquisición `PULL_ONLY_IMAGE_ACQUISITION`: exige el
reconstruction manifest, el SHA-256 de los bytes brutos del lock trackeado, su
inventario inmutable exacto y el gate clean-host antes de cualquier mutación de la
cache. Cada identidad física única se adquiere exclusivamente por
`canonicalRepository@manifestDigest` para `linux/amd64`, se inspecciona por OS,
arquitectura y RepoDigest, y sólo entonces recibe el alias local `sourceRef` para
mantener la compatibilidad de Compose/helpers con `--pull=never`.

El alias mutable es sólo ejecución no autoritativa: se puede rebindear sin borrar
bytes de cache previos. App/Nginx de Godel no se construyen ni etiquetan aquí; no
se crean recursos target, ni se importan secretos, ni se restaura información.
El tooling está cerrado y aprobado con adaptadores inyectables. No se ejecutó
aún una adquisición de registry real, bootstrap, restore ni prueba real de
portabilidad.

## SH-05.2G — build verificado de App / Nginx

SH-05.2G implementa `VERIFIED_BUILD_RECIPE` para App y Nginx: exige el
clean-host gate, la disponibilidad read-only de SH-05.2F, el reconstruction
manifest exacto, el bundle protegido ligado a la misma generación y un contexto
temporal de `git archive` del commit declarado. Verifica cada Dockerfile y sus
bases digest-pinned para `linux/amd64` antes de invocar Buildx. La URL pública se
transporta como build arg y la publishable key exclusivamente como secreto
BuildKit; ninguna aparece en evidencia sanitizada.

El tooling de build verificado está cerrado y aprobado, pero no se ejecutó un
build real de imágenes Godel. El bootstrap target no está implementado; la
activación de secretos target y restore no se ejecutaron; la prueba real de
portabilidad no se ejecutó.

## SH-05.2H — admisión de inputs de reconstrucción transportados

SH-05.2H implementa `TRANSPORTED_INPUT_ADMISSION = PRE_MUTATION_SAFE` y
`TARGET_STATE_CREATION = NOT STARTED`: relee el reconstruction manifest con
sidecar, reutiliza el validador canónico contra el backup y artifact protegido
transportados, y comprueba que el bundle exacto de generación coincide con
generación, operation ID, SHA del manifest y binding de configuración App. No
extrae datos ni material protegido, no consulta `current` y no selecciona una
generación independiente.

H no vuelve a interpretar el estado posterior de cache de imágenes como
clean-host: E prueba el host prístino antes de F/G; H sólo admite los inputs
transportados antes de la primera creación de estado target. La admisión de
backup/protected/bundle está cerrada y aprobada; su ejecución real no se realizó.

## SH-05.2I — fundación de bootstrap de estado target clean-host

SH-05.2I implementa `TARGET_STATE_CREATION` mediante tooling con dry-run
explícito y `--apply`: vuelve a exigir H antes de cualquier mutación, usa un gate
post-image/pre-target que permite cache de imágenes pero bloquea estado runtime,
y comprueba helpers inmutables y capacidad de disco antes de crear la fundación
vacía. La fundación crea únicamente protected root vacío, red operadora, roots
vacíos PGDATA/Storage con ownership preparado y prueba xattr, y `db-config`
fresco con sus cinco entradas version-coupled; `deno-cache` queda
`DEFERRED_EPHEMERAL_RUNTIME_CACHE`.

Como correctivo de contrato, `Config.User: ""` de la imagen Storage se admite
como el default Docker root y se normaliza internamente a `0:0`; valores
ausentes o no-string siguen bloqueando antes de toda mutación. El root Storage
queda con ownership derivado de esa identidad y modo `0755` para el acceso
compartido de imgproxy, mientras PGDATA conserva `0700`. El gate mantiene las
labels Compose y también bloquea los nombres target conocidos. La lectura del
manifiesto es única: H recibe el mismo objeto canónico que usa el bootstrap y
su operation ID debe coincidir antes de crear estado target.

El bootstrap real no se ejecutó. SH-05.2I no activa secretos, no materializa
envs, no extrae/restaura datos, no inicia runtime ni realiza proof de
portabilidad.

## SH-05.2J — activación exacta de generación target

SH-05.2J implementa en tooling `EXACT_TARGET_GENERATION_ACTIVATION`: relee el
manifest canónico una sola vez, vuelve a exigir H sobre ese mismo objeto y sólo
admite `externalSecretGenerationId`. Verifica la fundación vacía de I, relee el
bundle transportado, lo copia create-only a staging protegido y delega el
publish, envs, referenced/current/active match al importador canónico SH-05.2D.
Tras `ACTIVE_MATCH`, elimina únicamente su staging; si esa higiene falla,
bloquea sin rollback. También preserva y verifica PGDATA/Storage vacíos,
db-config, red y ausencia de contenedores target.

La activación real de generación no se ejecutó. Restore de PGDATA/Storage,
restore de pgsodium, arranque de runtime y proof de portabilidad no se
ejecutaron. El estado vigente de SH-05.2 es `CLOSED / APPROVED /
PASS_MINIMAL_CLEAN_HOST_PORTABILITY_TOOLING`; SH permanece `OPEN`.

## SH-05.2K — materialización offline de datos de recovery

SH-05.2K implementa tooling de restauración física offline para el target separado
`clean-host-disposable-rehearsal`. Reutiliza las primitivas de recovery de
`current-selfhosted-qa` sin cambiar su comportamiento: en el target limpio no
limpia PGDATA/Storage ni reconstruye `db-config`; sólo restaura archivos físicos,
la clave pgsodium y los xattrs ya admitidos, con locks persistentes ante fallo.

`OFFLINE CLEAN-HOST DATA RESTORE TOOLING = IMPLEMENTED`. No se ejecutó restore
real de datos, replay SQL lógico, creación/inicio de runtime ni rehearsal real de
portabilidad. La creación/inicio de runtime no forma parte de K.

## Autoridades y hechos verificados

## SH-05.2L — reconstrucción runtime clean-host

SH-05.2L cerró `CLOSED / APPROVED / PASS_CLEAN_HOST_RUNTIME_RECONSTRUCTION`.
Implementa tooling de arranque ordenado DB, Supabase y Godel sobre el
estado offline restaurado por K. Exige inputs admitidos, generación activa,
estado K verificado, imágenes pull-only y exposición privada loopback; no
permite pull, build, replay SQL ni rollback de datos. CLEAN_HOST_RUNTIME_RECONSTRUCTION
está implementado, pero no se ejecutó runtime real, rehearsal de portabilidad,
Playwright ni aceptación funcional.

## Cierre de SH-05.2 y handoff de SH-05.3

SH-05.2 cerró `CLOSED / APPROVED /
PASS_MINIMAL_CLEAN_HOST_PORTABILITY_TOOLING`. Provee tooling implementado,
fail-closed, para la cadena:

```text
clean-host identity gate
→ immutable pull-only image acquisition
→ verified Godel builds
→ transported input admission
→ target foundation bootstrap
→ exact generation activation
→ offline physical data recovery
→ private runtime reconstruction
```

Esta capacidad implementada no es una prueba empírica de portabilidad. Permanecen
explícitamente sin ejecutar:

```text
REAL CLEAN-HOST PORTABILITY REHEARSAL = NOT EXECUTED
REAL DATA RESTORE ON REHEARSAL HOST = NOT EXECUTED
REAL RUNTIME RECONSTRUCTION ON REHEARSAL HOST = NOT EXECUTED
FUNCTIONAL / PLAYWRIGHT ACCEPTANCE ON REHEARSAL HOST = NOT EXECUTED
VPS DEPLOYMENT = NOT EXECUTED
```

SH-05.3 queda `READY / NEXT`: **CLEAN-HOST PORTABILITY REHEARSAL EXECUTION**.
Comienza en un host Linux amd64 Docker genuinamente compatible y limpio, y ejecuta
la cadena ya aprobada de SH-05.2 sin rediseñar su tooling.

La decisión se deriva de la revisión de SH-05.0, SH roadmap, runbook SH-04,
diseño/QA de backup y secretos SH-04, autoridad/pin upstream, Compose efectivo,
templates de entorno y tooling de secret generation, backup, restore, runtime,
E2E y auditoría.

| Hecho observado | Consecuencia de diseño |
| --- | --- |
| Git contiene aplicación, Dockerfiles, Nginx, Compose, override Godel, migraciones y vendor upstream fijado. | Git exacto es autoridad para software y configuración trackeada, no para runtime ni secretos. |
| infra/SUPABASE_UPSTREAM.md y su lock fijan el árbol upstream a e846d45ce64207b952a4df44ac8b480ea0abb27e. | El manifest de reconstrucción debe declarar y verificar ambos antes de mutar target. |
| compose.env.local e infra/supabase/.env son externos e ignorados. | Son bytes de recuperación, no plantillas que el target pueda completar o mezclar. |
| secret-generation.mjs snapshottea íntegramente ambos archivos y MATCH compara bytes exactos. | No se puede importar una generación y reescribir campos host-specific conservando MATCH. |
| El manifest schema 3 de backup puede declarar externalSecretGenerationId. | La generación del backup es identidad obligatoria; no existe selección por latest/current/parent. |
| El restore actual exige current-selfhosted-qa, runtime ya levantado, mounts existentes y confirmación QA. | No se generaliza ese target; SH-05.2 añade un target explícito separado y un bootstrap previo. |
| PGDATA y Storage son bind mounts; db-config es volumen nombrado; pgsodium_root.key es material protegido. | El bootstrap debe crear estado vacío reproducible y el restore debe mantener la reconstrucción fresca de db-config. |
| App/Nginx se construyen desde Git y sus bases están digest-pinned; Supabase usa tags versionados; helpers usan --pull=never. | Se necesita un inventario de imágenes con digest resuelto y adquisición previa al restore. |
| El wrapper self-hosted fija localhost, pero Playwright acepta PLAYWRIGHT_BASE_URL. | La aceptación se ejecuta desde un runner externo contra un endpoint privado, preferentemente mediante túnel SSH local. |

Las rutas locales del host fuente, IDs de Docker, nombres efímeros de
contenedor, cache y capas writable no son identidades de reconstrucción.

## Invariantes no negociables

1. La selección es explícita: un Git SHA, un backup ID, una generación externa
   y un conjunto de identidades de imagen, todos validados antes de la frontera
   destructiva.
2. No hay fallback a latest, current del host fuente, parent, generación previa,
   cache Docker de origen ni estado implícito de Compose.
3. Una generación importada se publica de forma atómica, con archivos regulares,
   sin symlinks, permisos restrictivos, checksums y sin sobrescribir una
   generación diferente.
4. El puntero current no se crea ni reemplaza hasta que los dos env live
   materializados coinciden byte-a-byte con la generación seleccionada.
5. La host-cleanliness proof ocurre antes de crear red, volúmenes, bind-data,
   registro de secretos o runtime target.
6. Fallo antes de la frontera de datos deja el target intacto o sólo con
   prerrequisitos vacíos auditables. Fallo después obliga a quiesce, marker,
   lock preservado y recuperación/destrucción explícita.
7. Ninguna evidencia registra secretos, JWT, JWK privada, passwords, bytes de
   env/protected material, URL firmada, IDs de contenedor o rutas privadas.

## Modelo canónico de entradas

No se usa un tarball opaco gigante. El input profesional mínimo es un conjunto
con identidades separadas de bytes, cada elemento verificable y con una
autoridad declarada.

| Entrada | Identidad | Bytes/forma transportada | Autoridad | Requerida |
| --- | --- | --- | --- | --- |
| Fuente Godel | Git SHA de 40 caracteres | Clone/check-out limpio de esa revisión | Git | Sí |
| Upstream Supabase | commit upstream + hash del lock | Árbol vendor de la revisión Git | SUPABASE_UPSTREAM.md y lock | Sí |
| Manifest de reconstrucción no secreto | reconstruction ID + SHA-256 | JSON trackeable/transportable firmado operativamente si se decide | SH-05.2 | Sí |
| Imágenes pull-only | repository@sha256:digest + linux/amd64 | Pull desde registro aprobado o mirror aprobado | Image lock | Sí |
| App/Nginx construidas localmente | Receta verificada: SHA Git, Dockerfile, contexto permitido, bases digest-pinned, plataforma y configuración aprobada | Build limpio desde Git | Git + Dockerfiles + manifest | Sí |
| Entorno runtime par | externalSecretGenerationId | snapshots supabase.env y godel.env exactos | Registro protegido | Sí |
| Backup recovery-grade | backupId + checksums + manifest SHA-256 | directorio de backup schema 3 | Manifest COMPLETE | Sí |
| Material pgsodium | backupId + artifact SHA-256 | pgsodium-root-key.tar fuera del archive de datos | protected recovery root | Sí |
| Prerrequisitos host | reporte semántico de preflight | Linux/Docker/Compose/xattr/disk/red | clean-host gate | Sí |
| Evidencia | operation ID + checksums | JSON/line log sanitizado | Orchestrator | Sí |

El manifest no secreto de reconstrucción debe contener como mínimo schema,
operation ID, Git SHA, pin upstream, backup ID y checksum de manifest,
externalSecretGenerationId, identidad de protected artifact, inventario de
imágenes, plataforma, layout lógico de target y versión de los contratos. No
contiene valores de entorno, secretos, rutas privadas ni Docker IDs.

## Estrategia de entorno y generación externa

La estrategia canónica de SH-05.3 es
**EXACT_GENERATION_SNAPSHOTS**. El clean host materializa inicialmente las
snapshots completas pertenecientes a la generación explícitamente referenciada
por el backup seleccionado. La ejecución queda privada/restringida y conserva
las URL, bind y demás valores existentes en esos bytes.

Esta estrategia es válida porque preserva simultáneamente identidad de
generación, MATCH exacto, alineación backup-generación y
NO_IMPLICIT_ROLLBACK_CHAIN. No fabrica una generación de target ni introduce
una transición de configuración prematura.

Está prohibido que SH-05:

- importe la generación X y modifique valores de compose.env.local o
  infra/supabase/.env para “adaptarlos” al host;
- declare MATCH después de una modificación independiente;
- convierta una plantilla o una mezcla de variables en sustituto de snapshots;
- cambie un source generation in place.

PPO-04 debe iniciar una transición explícita de generación/configuración antes
de cambiar URL pública, dominio, URLs TLS-related, bind/exposure o valores
provider/VPS-specific no secretos. Esa transición no se diseña aquí.

## Alineación backup-generación

El selector de recuperación de SH-05.2 toma exactamente un backup COMPLETE. Si
su manifest contiene externalSecretGenerationId, esa es la única generación
admisible. El orchestrator debe:

1. validar formato, schema, estado COMPLETE, checksums, provenance, pin upstream
   e identidad del protected artifact;
2. extraer externalSecretGenerationId y validar su formato canónico;
3. exigir un bundle de generación con exactamente el mismo ID;
4. validar metadata, hashes de snapshots y relación de cada archivo con el
   nombre canónico;
5. bloquear antes de cualquier mutación del target ante ausencia, ID distinto,
   manifest inválido o conflicto.

No se infiere latest, current del host fuente, parent, generación anterior ni
rollback chain. Si el backup no tiene externalSecretGenerationId, SH-05.3 queda
BLOCKED: no se degrada a una selección implícita. El resultado es
**BACKUP_GENERATION_ALIGNMENT: FAIL_CLOSED**.

El proof transporta sólo la generación exacta seleccionada. El metadata puede
referenciar una sourceGenerationId histórica, pero esa referencia no obliga a
transportar el ancestro para recuperar el backup seleccionado. Generaciones no
relacionadas no se copian. Una futura operación de rotación/recovery que requiera
relación directa debe transportar o reconstruir esa historia bajo su propio
contrato; no la presupone SH-05.

## Interfaz protegida de export/import

Se extiende el límite operativo existente de manage-secret-generations.mjs, no
se crea un registro alterno. La interfaz vigente es:

    manage-secret-generations export --manifest <safe-relative-manifest> --output <protected-relative-bundle>
    manage-secret-generations import --manifest <safe-relative-manifest> --bundle <protected-relative-bundle> [--apply]

`--manifest` es relativo al repositorio. `--output` y `--bundle` son relativos
al `protectedRoot` y deben ser descendientes estrictos de éste, fuera de
`external-secrets`. Rutas absolutas, traversal, valores ambiguos y el propio
protected root se rechazan. La selección de generación es únicamente
`reconstructionManifest.externalSecretGenerationId`; `--generation`
independiente está prohibido. Export lee archivos regulares sin seguir symlinks
y publica un bundle protegido que contiene metadata validada, los dos snapshots
y un manifest de integridad. No imprime contenido, hash de secreto ni valores.
Para el CLI del repositorio, el `protectedRoot` de export/import se restringe a
un descendiente estricto de `protected-recovery-material`; es una frontera de
seguridad que evita bundles secretos en rutas trackeables del checkout. Las
primitivas programáticas reutilizables permanecen provider-neutral y pueden
recibir un protected root propiedad del orchestrator fuera de esta convención.

Import valida primero todo el bundle fuera del registro activo: schema exacto,
binding con operationId y SHA del reconstruction manifest, ID, metadata,
filenames, regular-file/no-symlink, tamaño razonable, checksum y permisos. Sólo
entonces adquiere el generation mutation lock y publica atómicamente el
directorio de generación. Un destino sin registro queda soportado; un directorio
preexistente sólo es aceptable si su metadata y bytes verifican idénticos. Una
generación distinta, un current pointer existente inesperado o cualquier lock
presente bloquean.

El orden elegido es:

1. verificar bundle y adquirir lock;
2. publicar inmutablemente la generación exacta sin mover current;
3. materializar atómicamente los dos env live desde esas snapshots, con 0600;
4. reabrirlos como archivos regulares y exigir igualdad byte-a-byte;
5. verificar de nuevo metadata y snapshots;
6. crear/confirmar el pointer current únicamente como commit final;
7. comprobar MATCH y emitir evidencia sanitizada.

Esto separa datos de generación de activación. Un fallo manejado puede preservar
la generación inmutable ya publicada y uno o ambos env exactos ya
materializados; el pointer current no cambia hasta la activación final. El lock
se libera una vez detenida la lógica de mutación manejada. No hay rollback
implícito ni borrado automático de estado publicado. Un crash puede preservar
el lock para recuperación explícita del operador; este subbloque no implementa
failure markers automáticos.

El canal de transporte queda operator-owned y provider-neutral: SSH/SCP,
rsync-over-SSH o mecanismo equivalente autenticado son aceptables si separan
export, transporte y import. Cifrado en tránsito no sustituye checksum e
integridad de import. No se añade dependencia nueva de cifrado o gestión de
claves sin decisión posterior, ni se aceptan shared folders como prueba de
portabilidad.

## Contrato de imágenes

Hay dos clases de identidad con reglas distintas.

### Imágenes pull-only / adquiridas externamente

Para servicios Supabase y helpers, la identidad canónica es
repository@sha256:digest + linux/amd64. SH-05.2 debe introducir, sin modificar
aún el vendor Compose, el lock trackeado infra/sh-portability-image-lock.json.
Cada entrada pull-only declarará servicio lógico, repository, digest resuelto,
plataforma, método de adquisición, autoridad de origen y revisión del lock. Un
tag existente puede mantenerse sólo como metadata informativa de resolución.

El lock cubre studio, api-gw, auth, rest, realtime, storage, imgproxy, meta,
functions, db, supavisor y helpers de filesystem/xattrs. Un digest o plataforma
distinta bloquea antes de cualquier mutación de datos target.

### Imágenes Godel construidas localmente

Para App y Nginx, la autoridad canónica de reconstrucción es la receta
verificada: Git SHA exacto, Dockerfile exacto, identidad del contexto permitido,
base image digest-pinned, plataforma linux/amd64 y configuración de build
aprobada. Cuando esa configuración procede del entorno seleccionado, la
external secret generation ID vincula el contrato sin exponer sus valores.

El resultado de cada build se inspecciona y su digest local se registra como
evidencia de ejecución sanitizada: identifica la imagen que realmente corrió en
ese rehearsal. No es un oráculo automático de reproducibilidad cross-host y no
debe igualar un digest predeterminado de otro host mientras la reproducción
determinista no se haya demostrado explícitamente.

El image lock puede registrar las autoridades inmutables de bases ya fijadas por
Dockerfiles para validación/cross-checking. No contiene digest final
generation-specific ni build-run-specific de App/Nginx; esos resultados viven
únicamente en manifest/evidencia de la operación.

GODEL_PUBLIC_BUILD_NONCE es un **EPHEMERAL_BUILD_CACHE_BUSTER**. No es identidad
de generación externa, identidad de reconstrucción, identidad de configuración,
criterio de igualdad cross-host ni evidencia permanente. El helper vigente puede
generarlo nuevamente por build y su valor no se persiste en evidencia
sanitizada. Si SH-05.2 demuestra que afecta el digest final, eso confirma que la
igualdad de digest final no puede exigirse para una imagen construida localmente.

La App puede consumir la configuración pública aprobada de la generación exacta
mediante el mecanismo seguro actual, sin registrarla. No se documentan ni
publican la URL pública, publishable key, nonce, sus valores ni hashes que
revelen configuración; el generation ID es el vínculo suficiente.

Secuencia obligatoria:

1. verificar host, red/registro y image lock;
2. pull y verificación por digest de todas las imágenes pull-only;
3. build de App/Nginx desde la receta verificada;
4. inspección de la identidad local resultante;
5. registro sanitizado del digest resultante como evidencia de ejecución;
6. disponibilidad de helpers y sólo entonces mutación de estado target/datos.

Un fallo de pull, digest/plataforma o build bloquea antes de la restauración
destructiva. Una imagen Godel construida localmente no se acepta sólo porque
exista un tag local. Una imagen genérica preinstalada se permite en el host
limpio sólo si se registra como cache no autoritativa y se verifica/re-pull
contra el digest lock; no se permite imagen Godel específica o imagen sin origen
declarable antes del clean gate.

## Clean-host gate y bootstrap

El clean-host gate se ejecuta antes de crear estado Godel/Supabase. No consulta
IDs numéricos. Debe fallar si detecta cualquier contenedor o Compose project
Godel/Supabase, volúmenes de datos o db-config, red godel-supabase-api, bind
paths conocidos de PGDATA/Storage, env runtime, registro de secret generation,
protected material, locks/failure markers, imágenes Godel o directorio target.
El reporte pre-state usa nombres lógicos y resultados booleanos, no paths
privados ni container IDs.

| Paso | Clasificación | Resultado permitido |
| --- | --- | --- |
| Validar Linux amd64, Docker Engine, Docker Compose con major soportado 2 o 5, disco, xattrs user.* y conectividad | PRE_MUTATION_SAFE | Host intacto o BLOCK |
| Clean-host gate e inventario de cache genérica | PRE_MUTATION_SAFE | Evidencia pre-state o BLOCK |
| Verificar Git, manifest, backup, protected material e imágenes | PRE_MUTATION_SAFE | Inputs admitidos o BLOCK |
| Crear directorio operator-owned, runtime env paths y protected root 0700/0600 | TARGET_STATE_CREATION | Layout vacío, auditado |
| Crear red externa godel-supabase-api y volúmenes Compose/db-config vacíos | TARGET_STATE_CREATION | Recursos vacíos con nombre lógico |
| Crear bind roots PGDATA/Storage vacíos, ownership/modos y probar xattrs | TARGET_STATE_CREATION | Targets reproducibles vacíos |
| Inicializar db-config fresco con imagen PostgreSQL compatible | TARGET_STATE_CREATION | Cinco entradas version-coupled verificadas |
| Importar generación/materializar env/activar pointer | TARGET_STATE_CREATION | MATCH exacto o failure marker |
| Extraer PGDATA/Storage, restaurar pgsodium y replay xattrs | DATA_MUTATION | Frontera destructiva documentada |
| Iniciar Compose, health y QA | RUNTIME_START | Runtime privado o failure marker |

El layout exacto se parametriza con raíces operator-owned y seguras, nunca con
rutas fuente. Debe conservar las rutas relativas que exige Compose dentro del
checkout y situar backup/protected material fuera de los bind targets. Antes de
extracción se prueba espacio para archives más margen y xattrs de Storage con
un archivo desechable que se elimina y se registra sólo semánticamente.

db-config no se restaura desde un volumen histórico. Tras disponer del env
exacto, el bootstrap crea el volumen nuevo y ejecuta la inicialización aprobada
del PostgreSQL compatible sobre estado scratch vacío para que el entrypoint
upstream reproduzca las entradas version-coupled. Valida exactamente
conf.d, extension-custom-scripts, read-replica.conf, supautils.conf y wal-g.conf,
sin pgsodium_root.key. Esta inicialización termina antes de extraer PGDATA. Tras
extraer PGDATA y Storage, se restaura únicamente pgsodium_root.key desde el
artifact protegido verificado; el conteo/contenido esperado se valida antes de
arrancar PostgreSQL restaurado.

La realidad actual importa: el helper de restore existente valida que db-config
ya tenga esas entradas; no puede bootstrapear un volumen limpio. SH-05.2 debe
implementar este paso explícitamente y no asumir que un volumen vacío contiene
configuración.

## Arquitectura de restore y orquestación

Se adopta **GENERALIZE_WITH_NEW_EXPLICIT_TARGET** con el target:
**clean-host-disposable-rehearsal**. El target
current-selfhosted-qa y su flag confirm-destructive-qa-restore permanecen
intactos, sin alias genérico ni cambio semántico.

La separación aprobada es:

    primitives portables
        -> orchestrator clean-host rehearsal
            -> restore core con target explícito

El orchestrator es responsable de gate, verificación de inputs, imágenes,
bootstrap, import de generación, backup/protected material, invocación de
restore, health, evidencia y dispatch de cleanup. El restore core conserva
semántica de recuperación de datos: verificar archives, detener/iniciar runtime,
reemplazar PGDATA/Storage, db-config fresco, pgsodium, xattrs y marker
post-mutation. No absorbe provisioning de host, transporte ni QA.

El nuevo target recibirá un descriptor ya validado de compose roots, red,
volúmenes, imágenes y endpoint, en vez de descubrir mounts de un runtime
heredado. Requerirá una confirmación diferente y literal:
confirm-destructive-clean-host-rehearsal. No habilita restore productivo.

## QA funcional externa

Se acepta el modelo de túnel SSH local como solución mínima y privada:

    runner externo localhost:puerto-efímero
        -> SSH local forward
            -> target 127.0.0.1:8080

El runner externo, no el host de despliegue, establece el túnel usando un alias
operator-owned de SSH y credenciales ya gestionadas fuera del repositorio. No
se pasan claves, passwords, IP ni URL firmada en argumentos, documentación o
evidencia. Antes de Playwright se valida proceso de túnel vivo y endpoints live
y ready mediante el puerto local. Después se invoca Playwright con
PLAYWRIGHT_EXTERNAL_SERVER=1 y PLAYWRIGHT_BASE_URL igual al localhost
forwarded; el wrapper SH-05.2 debe dejar de sobrescribir una base URL explícita.

La muerte del proceso SSH, fallo de bind local o endpoint inaccesible antes de
health se clasifica QA_TUNNEL_FAILURE. Un health correcto seguido de fallo de
suite es QA_APPLICATION_FAILURE. Browser/Playwright quedan en el runner y no se
vuelven requisito permanente de la VPS/host target.

## Evidencia y limpieza

La evidencia SH-05.3 se publica como manifiestos y logs sanitizados con
operation ID. Debe cubrir:

- pre-state clean host, plataforma, disco y xattrs;
- Git SHA, upstream pin, image lock, pull/build, verificación y digest local
  resultante de cada imagen Godel como evidencia de ejecución;
- creación de red, volumen, layout y bootstrap db-config;
- backup/protected material checksums y generación import/MATCH;
- fases de restore, health, QA y clasificación de cualquier fallo;
- cleanup solicitado, resultado y post-cleanup.

No registra secretos, hashes de secretos, JWT/JWK, password, credencial DB,
bytes del material protegido, signed URLs, container IDs ni rutas privadas. Se
prefieren nombres de servicio/recurso y conteos.

Modelo A admite dos outcomes de cleanup:

1. limpieza verificada de estado de aplicación en host disposable reutilizable:
   detener runtime, retirar recursos creados y repetir un post-cleanup gate;
2. destrucción/reprovisioning de la VM disposable, acompañada por evidencia
   pre-cleanup y un registro de destrucción/reprovisioning que permita auditar
   la ausencia de reutilización.

“VM deleted” aislado no basta. SH-05.1 no ejecuta cleanup.

## Semántica de fallos

| Fallo | Resultado fail-closed |
| --- | --- |
| Git dirty o SHA distinto | Target intacto; BLOCK. |
| CPU no amd64, Docker/Compose no compatible, xattrs o disco insuficientes | Target intacto; BLOCK. |
| Imagen pull-only ausente, digest/plataforma distinto, o receta/build Godel no verificable | Target intacto; BLOCK. |
| Backup/protected material inválido, checksum distinto o generation mismatch | Target intacto; BLOCK. |
| Lock, registro secreto conflictivo, symlink o import conflict | Target intacto; BLOCK. |
| Estado previo, red, volumen o bind target existente | Target intacto; BLOCK; no merge ni reutilización. |
| Falla al publicar env antes de current | Sólo staging/estado vacío compensable; no pointer; lock/marker si compensación no se demuestra. |
| Falla tras current pointer pero antes de datos | Preservar lock/marker y exigir cleanup/destrucción explícita; no rollback implícito. |
| Falla antes de replace PGDATA | Runtime aún no restaurado; target conserva sólo estado vacío reproducible; cleanup según evidencia. |
| Falla después de replace PGDATA o Storage | Quiesce, failure marker y lock; requiere recovery defensivo explícito o destrucción del Modelo A. |
| Health, túnel, QA o cleanup falla | Runtime no se aprueba; conservar evidencia, clasificar fallo y exigir cleanup/destrucción verificable. |

## Deuda de auditoría de seguridad

SH-05.2A implementó la realineación de la auditoría canónica: retiró las dos
expectativas stale de stdin DB y adapter Compose que R4C dejó sin sujeto
arquitectónico. R4C se preserva: app.settings.jwt_secret,
PGRST_APP_SETTINGS_JWT_SECRET, JWT_SECRET en DB sólo para ese GUC y el adapter
DB de la rotación permanecen ausentes; app.settings.jwt_exp permanece vigente.

La prohibición de referencias a generadores upstream inseguros se conserva.
La cobertura de regresión comprueba que la rotación sigue coordinando env +
generation pointer sin reintroducir el GUC/adaptador retirado. El audit
canónico queda PASS. SH-05.2A queda CLOSED / APPROVED /
PASS_CANONICAL_SECURITY_AUDIT_REALIGNMENT; SH no puede cerrar si el audit
canónico vuelve a fallar.

## Plan mínimo de implementación SH-05.2

### SH-05.2A — Canonical security audit realignment

**Estado:** CLOSED / APPROVED / PASS_CANONICAL_SECURITY_AUDIT_REALIGNMENT

Es el primer subbloque implementado de SH-05.2. Realineó únicamente las
expectativas obsoletas de auditoría, conservó los checks legacy-JWT válidos y
añadió cobertura de regresión para que el GUC/adaptador DB retirado no vuelva a
introducirse. Su aceptación arquitectónica está cerrada y aprobada.

### SH-05.2B — Pull-only image authority lock

**Estado:** CLOSED / APPROVED / PASS_PULL_ONLY_IMAGE_AUTHORITY

Establece el lock trackeado de autoridades `repository@linux/amd64 manifest
digest` para los servicios pull-only canónicos y los helpers de backup/restore.
Las imágenes finales App y Nginx de Godel quedan fuera: su autoridad continúa
siendo la receta de build verificada. Este subbloque no adquiere imágenes ni
demuestra una reconstrucción clean-host; esa ejecución permanece sin implementar.

### SH-05.2C — Reconstruction manifest and input binding

**Estado:** CLOSED / APPROVED / PASS_RECONSTRUCTION_MANIFEST_BINDING

Implementa la identidad y el binding no secreto de una selección de
reconstrucción: Git exacto, upstream, lock de imágenes, recetas App/Nginx,
backup, generación externa, artefacto pgsodium y contrato lógico de target.
No implementa transporte de secretos, adquisición de imágenes, bootstrap,
restore clean-host ni portability proof.

### SH-05.2D — Protected exact generation export / import

**Estado:** CLOSED / APPROVED / PASS_PROTECTED_EXACT_GENERATION_TRANSPORT

Implementa transporte protegido de exactamente la generación seleccionada por
el reconstruction manifest, con bundle comprometido por `bundle.json`, hashes
de snapshots contenidos exclusivamente dentro del bundle protegido y validación
completa antes del lock de import. La importación materializa bytes exactos de
los dos env, exige MATCH antes de activar el pointer y rechaza conflicto,
overwrite, symlink o selección independiente de generación. Las pruebas usan
sólo secretos sintéticos. No se ejecutó transporte real de secretos; clean-host
bootstrap, adquisición de imágenes y restore clean-host siguen sin implementar.
El estado vigente de SH-05.2 es `CLOSED / APPROVED /
PASS_MINIMAL_CLEAN_HOST_PORTABILITY_TOOLING`; SH permanece `OPEN`.

| Archivo propuesto | Cambio | Inputs / outputs | Secretos | Mutación / fallo / tests |
| --- | --- | --- | --- | --- |
| scripts/audit-security.mjs | Realineación implementada de las reglas stale de DB stdin/Compose adapter | Contrato R4C y resultado canónico de auditoría | Ninguno | No muta target. Conserva el rechazo de generadores upstream inseguros. |
| scripts/operations/rotate-legacy-jwt-keys.test.mjs | Regresión R4C implementada | Fixtures sintéticas y Compose/jwt.sql/rotación trackeados | Sólo secretos sintéticos | No muta runtime. Prueba env + pointer sin adapter DB y ausencia de GUC secreto/adaptador retirado. |
| infra/sh-portability-image-lock.json | Lock implementado sólo para imágenes pull-only | Repository, tag de procedencia, digest de manifiesto linux/amd64 y autoridad semántica | Ninguno | No muta target. Excluye App/Nginx finales de Godel. |
| scripts/operations/portability-manifest.mjs | Binding no secreto implementado | Inputs declarados; manifest + sidecar explícitos | Ninguno | No muta salvo output solicitado. Valida schema, Git, pin, imágenes, recetas, backup, generación y pgsodium. |
| scripts/operations/manage-secret-generations.mjs | Extender CLI con export/import explícitos | Generación seleccionada por reconstruction manifest y bundle protegido; resultado sanitizado | Lee/escribe snapshots, nunca stdout | Registro/env/pointer. Tests temp-dir, symlink/traversal, checksum, conflicto, atomicidad, MATCH y compensación. |
| scripts/operations/secret-generation.mjs | Reusar/extender primitivas seguras | Metadata/snapshots/locks | Maneja bytes secretos | Registro/env. Tests de permisos 0700/0600, no overwrite, pointer final y no-leak. |
| scripts/operations/clean-host-gate.mjs | Nuevo gate read-only | Host descriptor/image lock; informe sanitizado | Ninguno | No muta. Tests Docker CLI fake: positivo, state/network/volume/env/lock negativos. |
| scripts/operations/clean-host-bootstrap.mjs | Nuevo bootstrap idempotente | Descriptor validado; layout vacío | Usa env ya materializado, no imprime | Crea recursos vacíos/db-config. Tests fake Docker, xattrs, conflicto, compensación. |
| scripts/operations/image-acquisition.mjs | Validador read-only implementado para el lock pull-only | Lock, Compose canónico, helpers y pin upstream; salida semántica sanitizada | Ninguno | No descarga, construye ni ejecuta imágenes. Detecta deriva de sourceRef, helper y upstream. |
| scripts/operations/restore-selfhosted-core.mjs | Extraer núcleo portable del restore actual | Target descriptor, backup/protected inputs | Lee env sólo para MATCH | Datos/runtime. Tests archive safety, phases, marker, quiesce y target descriptor. |
| scripts/operations/restore-selfhosted.mjs | Conservar QA y añadir target explícito | CLI QA existente + clean-host-disposable-rehearsal | Sin nueva exposición | Restore destructivo protegido. Tests que QA/flag existente siguen intactos y nuevo flag es obligatorio. |
| scripts/operations/run-clean-host-rehearsal.mjs | Nuevo orchestrator | Manifest, artefactos, descriptor; evidencia sanitizada | Coordina import sin imprimir | Todas las fases. Tests de orden, fail-before-mutation, locks y dispatch cleanup. |
| scripts/run-selfhosted-e2e.mjs | Permitir base URL externa explícita | QA env + PLAYWRIGHT_BASE_URL | No transmite secrets runtime prohibidos | No muta target. Tests de precedence y clasificación túnel/app. |
| tests/operations/sh-05-*.test.mjs | Nuevas pruebas unitarias/FS/fake Docker | Fixtures sintéticas | Sólo secretos sintéticos | Cubre round-trip, no-leak, idempotencia, failures y seguridad. |

No se crea tooling provider-bound, incluido deploy-to-hostingdc.*. No se cambia
vendor Compose a digests durante diseño; el lock verifica adquisición sin
reescribir esa autoridad.

## Estrategia de pruebas y gate SH-05.3

SH-05.2 debe completar pruebas puras, filesystem temporal con secretos
sintéticos, Docker CLI fake/spawn-injected, validación de manifest, round-trip
de una generación, rechazo de symlink/traversal, mismatch de digest y
backup-generación, bootstrap idempotente, gate positivo/negativo, compensación
de fallo y aserciones de ausencia de secret leakage. No exige VM real para cada
unidad.

Director Técnico sólo puede proporcionar/crear el host disposable de SH-05.3
después de revisión/aprobación de SH-05.2 y de estos gates:

- clean-host gate, image acquisition/verificación e import de generación
  implementados y revisados;
- verificación de backup/protected material y bootstrap db-config implementados;
- restore target explícito, health y ruta QA externa listos;
- procedimiento de failure/cleanup documentado y probado;
- el audit canónico debe seguir PASS y R4C debe permanecer preservado, sin
  reintroducir el GUC secreto DB ni el adapter retirado.

SH-05.3 es la única fase que podrá demostrar la reconstrucción real clean-host.
SH-05.1 no declara portability proof, production readiness ni aprobación
arquitectónica.
