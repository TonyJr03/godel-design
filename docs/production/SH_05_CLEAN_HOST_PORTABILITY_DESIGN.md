# SH-05.1 — Contrato de portabilidad clean-host y diseño de tooling

**Estado:** CLOSED / APPROVED
**SH-05:** ACTIVE
**SH-05.0:** CLOSED / APPROVED / PASS_PORTABILITY_DISCOVERY
**SH-05.1:** CLOSED / APPROVED
**SH-05.2:** ACTIVE
**SH-05.2A:** CLOSED / APPROVED / PASS_CANONICAL_SECURITY_AUDIT_REALIGNMENT
**SH-05.2B:** CLOSED / APPROVED / PASS_PULL_ONLY_IMAGE_AUTHORITY
**SH-05.2C:** IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
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

## Autoridades y hechos verificados

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
| Validar Linux amd64, Docker Engine, Compose v2, disco, xattrs user.* y conectividad | PRE_MUTATION_SAFE | Host intacto o BLOCK |
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

**Estado:** IMPLEMENTED / PENDING ARCHITECTURAL REVIEW

Implementa transporte protegido de exactamente la generación seleccionada por
el reconstruction manifest, con bundle comprometido por `bundle.json`, hashes
de snapshots contenidos exclusivamente dentro del bundle protegido y validación
completa antes del lock de import. La importación materializa bytes exactos de
los dos env, exige MATCH antes de activar el pointer y rechaza conflicto,
overwrite, symlink o selección independiente de generación. Las pruebas usan
sólo secretos sintéticos. No se ejecutó transporte real de secretos; clean-host
bootstrap, adquisición de imágenes y restore clean-host siguen sin implementar.
SH-05.2 permanece `ACTIVE` y SH permanece `OPEN`.

| Archivo propuesto | Cambio | Inputs / outputs | Secretos | Mutación / fallo / tests |
| --- | --- | --- | --- | --- |
| scripts/audit-security.mjs | Realineación implementada de las reglas stale de DB stdin/Compose adapter | Contrato R4C y resultado canónico de auditoría | Ninguno | No muta target. Conserva el rechazo de generadores upstream inseguros. |
| scripts/operations/rotate-legacy-jwt-keys.test.mjs | Regresión R4C implementada | Fixtures sintéticas y Compose/jwt.sql/rotación trackeados | Sólo secretos sintéticos | No muta runtime. Prueba env + pointer sin adapter DB y ausencia de GUC secreto/adaptador retirado. |
| infra/sh-portability-image-lock.json | Lock implementado sólo para imágenes pull-only | Repository, tag de procedencia, digest de manifiesto linux/amd64 y autoridad semántica | Ninguno | No muta target. Excluye App/Nginx finales de Godel. |
| scripts/operations/portability-manifest.mjs | Binding no secreto implementado | Inputs declarados; manifest + sidecar explícitos | Ninguno | No muta salvo output solicitado. Valida schema, Git, pin, imágenes, recetas, backup, generación y pgsodium. |
| scripts/operations/manage-secret-generations.mjs | Extender CLI con export/import explícitos | Un UUID y bundle protegido; resultado sanitizado | Lee/escribe snapshots, nunca stdout | Registro/env/pointer. Tests temp-dir, symlink/traversal, checksum, conflicto, atomicidad, MATCH y compensación. |
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
