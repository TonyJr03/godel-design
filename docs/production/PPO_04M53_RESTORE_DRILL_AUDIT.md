# PPO-04M.5.3 — Restore Drill + Baseline Closure Architecture Audit

**Estado de M.5.3:** `ACTIVE / MIGRATION HISTORY DIALECT REMEDIATION`

**Estado de M.5.3.0:** `CLOSED / RESTORE DRILL ARCHITECTURE APPROVED`

**Estado de M.5.3A:** `CLOSED / SOURCE VERIFICATION TOOLING APPROVED`

**Estado de M.5.3B:** `CLOSED / ISOLATED TARGET + RESTORE TOOLING APPROVED`

**Estado de M.5.3B.2:** `CLOSED / REAL LOCAL TARGET COMPATIBILITY VERIFIED`

**Estado de M.5.3C.0:** `CLOSED / REAL RESTORE EXECUTION CONTRACT APPROVED`

**Estado de M.5.3C.1:** `CLOSED / REAL RESTORE ORCHESTRATOR TOOLING APPROVED`

**Fecha:** 2026-09-26

**Resultado del audit:** `ARCHITECTURE DEFINED / M.5.3B IMPLEMENTED`

## 1. Autoridad y límites de este pase

La autoridad vigente declara:

```text
PPO-04M.5.2 =
CLOSED / FIRST PRODUCTION BACKUP + EXTERNAL CUSTODY VERIFIED

FIRST PRODUCTION BACKUP = COMPLETE
LOCAL CIPHERTEXT = VERIFIED
EXTERNAL CUSTODY = VERIFIED
R2 CIPHERTEXT ROUNDTRIP = VERIFIED
R2 RECEIPT ROUNDTRIP = VERIFIED
WARNINGS = 0
```

Durante M.5.3.0 sólo se auditó y diseñó el restore. No se descargó el backup,
no se usó la identity privada, no se descifró, no se creó un target y no se
ejecutó SQL. Tampoco se contactó Production, Supabase Managed ni R2.

```text
PRODUCTION RESTORE = NOT AUTHORIZED
REAL LOCAL RESTORE TARGET = NOT EXECUTED
REMOTE ACTIVITY DURING AUDIT = 0
```

Los identificadores reales, project refs, endpoints, rutas operativas,
credenciales y datos de negocio quedan fuera de este documento.

## 2. Tooling revisado y reutilización permitida

| Tooling | Capacidad útil | Decisión para M.5.3 |
| --- | --- | --- |
| `manifest.mjs` | Manifest Managed v1 estricto, estados y gates | Reutilizar validadores; añadir contrato de árbol restaurable. |
| `bundle.mjs` | Construcción, checksum, cifrado y cleanup del bundle | Referencia de lifecycle; no implementa restore. |
| `checksums.mjs` | SHA-256 streaming, parser e inventario | Reutilizar y extender con comparación manifest/árbol exacta. |
| `inventory.mjs` | Validación Auth, Storage durable y configuración | Reutilizar antes de SQL y después del restore. |
| `external-receipt.mjs` | Receipt v1 y verificación size/SHA del ciphertext | Reutilizar para la fuente externa. |
| `r2-external-custody.mjs` | Layout exacto, listing y descarga no reemplazable | Extraer un adapter recovery-only; no exponer publicación al restore. |
| `command-runner.mjs` / `pipeline-runner.mjs` | `shell: false`, environment allowlisted y redacción | Reutilizar con operaciones y cwd explícitos. |
| `age-tar-adapter.mjs` | Descifrado/extracción local usada en M.5.1 | Referencia parcial; su extracción tar no es aún admisión segura de restore. |
| `production-age-adapter.mjs` | Cifrado Productivo sin identity privada | No restaura; confirma la separación de custodia. |
| `safety.mjs` | Paths contenidos y cleanup fail-closed | Reutilizar principios; crear helpers específicos de recovery. |
| `local-integration.mjs` | SOURCE/TARGET desechables, psql local, Auth y Storage | Fuente principal para el target; hoy es monolítico, privado y fixture-specific. |
| `restore-selfhosted.mjs` | Preflight, target exacto, locks, fases y fallo visible | Sólo referencia de seguridad. Su formato no es compatible. |
| `recovery-data-primitives.mjs` | Containers aislados para filesystem físico/xattrs | No aplica al restore lógico Managed actual. |

No existe hoy un comando `ops:restore:managed` ni un orquestador Managed de
recovery en `package.json`.

## 3. Incompatibilidad explícita con el restore Self-Hosted

`restore-selfhosted.mjs` exige:

```text
format = godel-selfhosted-backup
schemaVersion = 3
postgres/physical/pgdata.tar
storage/storage.tar
storage/xattrs.json
pgsodium-root-key.tar
```

El bundle Managed usa `internal-manifest.json` schema 1, dumps lógicos, bytes
S3-compatible y cifrado age. No contiene PGDATA, xattrs ni material pgsodium.
Por tanto, no se reutilizarán su parser, su manifest, sus artifacts físicos, sus
volúmenes, sus locks ni su mutation flow.

Sí se trasladarán estos patrones:

- target y confirmación destructiva exactos;
- preflight completo antes de mutar;
- revalidación de autoridad inmediatamente antes de la mutación;
- subprocesses sin shell y stderr sanitizado;
- fases explícitas y boundary de mutación;
- paths contenidos y rechazo de links/reparse points;
- cleanup verificable;
- fallo de cleanup visible y cierre bloqueado.

## 4. Contrato real del bundle Managed

### 4.1 Artifacts internos obligatorios

El backup Productivo actual contiene estos archivos gobernados:

```text
database/roles.sql
database/managed-schema.sql
database/managed-data.sql
database/migration-history-schema.sql
database/migration-history-data.sql

auth/inventory.json
storage/durable-inventory.json
configuration/snapshot.json
inventory/checksums.sha256
internal-manifest.json
operations/writer-freeze.json
```

No existe un `database/inventory.json`: los conteos de tablas viven en
`internal-manifest.json`. El external receipt tampoco está dentro del bundle;
es un artifact de custodia separado que autentica tamaño y SHA-256 del
ciphertext.

Cuando hay objetos, el capture Productivo añade archivos bajo:

```text
storage/<durable-object-path>
```

M.5.1 usó `storage/objects/<path>` para su fixture local. Ese layout no debe
imponerse al backup real: M.5.3 debe gobernarse por el layout Productivo y por
`storage/durable-inventory.json`.

El backup real vigente declara cero objetos Storage capturados. Por ello no se
esperan archivos de bytes bajo `storage/`; el directorio vacío puede no aparecer
como artifact dentro del tar.

### 4.2 Relación entre manifest, checksums y árbol

`inventory/checksums.sha256` enumera y protege todos los artifacts previos a la
creación del manifest, pero no se incluye a sí mismo. El manifest incorpora el
SHA-256 y tamaño del propio archivo de checksums junto con el resto de artifacts;
`internal-manifest.json` no se autoenumera.

Antes de ejecutar SQL, M.5.3A debe demostrar conjuntamente:

1. manifest schema 1 válido y `status = COMPLETE`;
2. todos sus gates en `true`;
3. árbol sin links, devices, sockets, hardlinks inesperados ni rutas extra;
4. conjunto exacto de artifacts esperado para el backup Productivo;
5. digest del archivo de checksums igual al registrado en el manifest;
6. cada entrada del archivo de checksums igual a la entrada del manifest;
7. tamaño y SHA-256 reales de cada artifact coincidentes;
8. ningún artifact del manifest ausente y ningún archivo no declarado;
9. authority del manifest, receipt y snapshot mutuamente consistente;
10. writer-freeze schema 1 y cronología anidada válida.

`readAndVerifyChecksums()` por sí solo no prueba los puntos 3–9 y no es
suficiente como gate de restore.

## 5. Fuente externa preferida

La fuente normal del drill será la custodia externa, no la copia local:

```text
operator selects governed backup identity
→ inspect exact production namespace
→ download VERIFIED external receipt
→ validate receipt schema and expected identity
→ download ciphertext to a new encrypted-download directory
→ verify regular file, exact size and SHA-256 against receipt
→ admit recovery identity
→ decrypt only into the private plaintext workspace
```

El namespace debe contener exactamente ciphertext y receipt. Ninguna operación
de upload, delete, move, purge o sync pertenece al restore.

Se recomienda un adapter `createR2RecoverySourceAdapter()` que sólo exponga:

```text
inspectCandidate
downloadReceipt
downloadCiphertext
```

No debe reutilizarse sin restricción la interfaz de publicación. La copia local
verificada se conserva como fallback manual explícito, nunca como fuente única
implícita. El restore no elimina ni modifica objetos R2.

## 6. Boundary de la identity age

Contrato recomendado:

```text
GODEL_MANAGED_RECOVERY_IDENTITY_FILE = absolute external path only
```

La variable contiene una ruta, nunca material privado. El preflight debe exigir
que la ruta:

- sea absoluta y explícita;
- exista como archivo regular no vacío;
- no sea symlink/reparse point;
- quede fuera del repo, output original, download temporal y workspace;
- no se copie al workspace ni al target;
- no se incluya en evidence, errores o output sanitizado.

El contenido de la identity no entra en environment, argv, logs ni receipts.
La ruta externa se trata también como dato sensible: no se imprime y se añade al
redaction set del runner. M.5.3A debe probar con la versión gobernada de `age` el
transporte soportado para descifrado antes de autorizar el drill; `age` no estaba
disponible en el `PATH` de este audit, por lo que no se asumió una semántica de
stdin no demostrada.

La identity permanece bajo custodia del operador y nunca es eliminada por el
cleanup del drill.

## 7. Workspace de recovery

El operador suministrará un parent absoluto dedicado. El tooling creará una
sesión única no reutilizable mediante un nombre aleatorio y fail-if-exists:

```text
recovery-session/
  download/     # receipt y ciphertext temporales descargados
  plaintext/    # bundle descifrado
  target/       # proyecto Supabase local desechable
  evidence/     # resultado técnico local, luego sanitizado
```

El parent y la sesión deben quedar fuera de:

- repositorio;
- output root original del backup;
- directorio que contiene el ciphertext/receipt locales preservados;
- cualquier otro target Supabase existente.

Todos los componentes deben ser directorios reales, privados y sin links o
reparse points. El tooling debe revalidar `lstat`/`realpath` antes de extraer,
antes de SQL y antes de cleanup. No puede reutilizar una sesión previa.

La extracción tar necesita un gate nuevo. No basta con `tar -tf` seguido de
`tar -xf`: antes de materializar debe rechazar entradas absolutas, traversal,
backslashes, duplicados, symlinks, hardlinks y tipos especiales. Tras extraer se
recorre nuevamente el árbol y se aplica el contrato exacto de artifacts.

## 8. Target recomendado

El único target de M.5.3 bajo este alcance es:

```text
fresh
isolated
Supabase CLI local
Docker-backed
local-only
not linked
not current developer state
disposable
```

Se reutilizará el patrón de M.5.1, extrayéndolo a tooling testeable:

1. copiar a la sesión sólo `supabase/config.toml` y las migraciones gobernadas;
2. generar project ID, puertos y nombres de containers únicos;
3. deshabilitar seed y servicios no requeridos;
4. rechazar `supabase/.temp/project-ref` y cualquier selector `--linked`;
5. arrancar con la CLI repo-local exacta y environment mínimo;
6. comprobar que no existe fixture/estado previo;
7. aplicar la baseline desde la autoridad `productionRuntimeSha` del manifest, o
   demostrar que los seis archivos locales son byte-identical a esa autoridad;
8. validar baseline 01–06, extensión requerida y bucket privado antes de datos.

Los puertos fijos y helpers privados del script M.5.1 no son adecuados para el
drill real. El nuevo tooling debe reservar/verificar puertos y limpiar por
project ID exacto. No se usará Supabase Managed como target; la prueba de
fidelidad provider-managed queda clasificada como trabajo posterior al piloto.

## 9. Orden de restauración de base de datos

Los cinco artifacts no tienen la misma semántica. El orden gobernado es:

| Orden | Artifact | Tratamiento |
| --- | --- | --- |
| 1 | `roles.sql` | Validación/audit only. Verificar ausencia de passwords y compatibilidad; no recrear roles managed. |
| 2 | `managed-schema.sql` | Validación/audit only contra el target producido por 01–06; no ejecutar DDL duplicado. |
| 3 | `migration-history-schema.sql` | Validar el contrato del schema de historia; no reemplazar el schema bootstrappeado. |
| 4 | `migration-history-data.sql` | Comparar versiones con la historia generada por 01–06; no importar ciegamente. |
| 5 | `managed-data.sql` | Único artifact SQL mutante del restore normal, después de todos los gates anteriores. |

La historia de migraciones y el schema audit son evidencia, no autoridad. La
autoridad es Git en `productionRuntimeSha` más la baseline congelada. Una fila
de historia inesperada, una migración ausente o un schema drift bloquean el
restore antes de datos.

El executor será exclusivamente el PostgreSQL del target local:

```text
docker exec -i <exact-disposable-db-container>
psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction
```

El dump se entrega por stdin; no se pasa una URL ni password en argv. El
container se deriva del project ID creado por la sesión y se valida por labels,
no por input arbitrario.

Dentro de la transacción se controla `session_replication_role = replica`, se
vacía únicamente el conjunto de tablas admitido derivado del dump y se restaura
el data-only dump. Al terminar la transacción la sesión vuelve a `origin`; el
post-gate lo verifica. El parser debe admitir sólo el dialecto data-only
esperado (`COPY`, secuencias y statements seguros de pg_dump) y rechazar DDL,
roles, extensions, programas, includes o comandos meta no gobernados.

### Incompatibilidades que deben resolverse en M.5.3A/B

- M.5.1 restaura sólo `managed-data.sql`; no gobierna los otros cuatro files.
- El restore local actual trunca dinámicamente todas las tablas encontradas y
  necesita convertirse en un plan explícito revisable.
- Debe demostrarse que el dump Productivo y el runtime local son compatibles en
  versión y schemas Auth/Storage.
- `storage.buckets` y demás filas platform-managed necesitan reconciliación
  exacta para evitar duplicados o pérdida de configuración.
- La historia capturada no incluye por sí sola hashes de migraciones; deben
  resolverse desde la autoridad Git del runtime y compararse antes del restore.

## 10. Gates de Auth

Antes de SQL, el tooling debe parsear confidencialmente el dump y construir en
memoria una expectativa no publicable de:

- UUIDs de `auth.users`;
- digest de cada `encrypted_password`, nunca el hash en evidencia;
- relaciones `auth.identities.user_id`;
- relaciones `public.perfiles.id`;
- conteos de las tablas privadas de auditoría requeridas.

Después del restore debe probar:

```text
auth.users count = expected
auth.identities count = expected
UUID set continuity = PASS
encrypted-password digest continuity = PASS
auth.users.id ↔ public.perfiles.id = PASS
required private audit tables = PRESENT / COUNTS VERIFIED
```

El tratamiento de sesiones, refresh tokens y estados OTP debe verificarse en el
contenido real del dump. La declaración `excluded` del inventario no basta si el
SQL incluyera esas tablas. El restore debe excluirlas o invalidarlas antes de
arrancar Auth y demostrar que ninguna sesión previa queda utilizable.

Se recomienda exigir un login real de una credencial interna contra el target
local como gate de cierre. Identificador y password se introducirán mediante un
prompt interactivo oculto, sólo en memoria; no environment, argv, archivos o
logs. La evidencia pública registra únicamente `REAL INTERNAL LOGIN = PASS`.
Si el operador no puede proporcionar una credencial válida, el drill puede
continuar para diagnóstico pero M.5.3 no se cierra.

## 11. Restore de Storage y caso vacío real

El orden permanece:

```text
restore DB metadata
→ validate metadata-before-bytes gate
→ restore object bytes
→ validate exact metadata/byte agreement
```

Para el backup real actual:

```text
capturedObjects = []
objectCount = 0
totalBytes = 0
```

Esto no elimina los gates. El restore debe:

1. validar que el inventario durable admite exactamente cero objetos;
2. comprobar después de SQL que el target tiene cero metadata durable y cero
   bytes bajo el bucket gobernado;
3. ejecutar una fase explícita `EMPTY BYTE RESTORE / VALIDATED NO-OP`, sin
   invocar upload remoto;
4. volver a listar el S3 local y confirmar cero objetos, cero bytes y cero
   residue;
5. mantener bucket privado, configuración y policies creadas por la baseline.

Para backups futuros no vacíos, los paths se derivan del inventario y de
`storage/<path>`. Metadata se restaura antes de usar el plan `upload-restore` de
rclone contra el S3 local. Cada tamaño y SHA-256 debe coincidir antes y después.

## 12. Verificación interna previa a SQL

La secuencia fail-closed será:

```text
external receipt VERIFIED
→ ciphertext size/SHA-256 VERIFIED
→ safe decrypt/extract
→ internal-manifest COMPLETE
→ exact artifact tree VERIFIED
→ all internal checksums VERIFIED
→ Auth inventory VERIFIED
→ Storage durable inventory VERIFIED
→ configuration snapshot VERIFIED
→ manifest/receipt/snapshot authority agreement VERIFIED
→ writer-freeze chronology VERIFIED
→ SQL admission VERIFIED
→ target mutation may begin
```

El snapshot se usa para validar autoridad e invariantes, no para copiar valores
Productivos al target. El Site URL, redirect allowlist y variables del target
local no deben convertirse en endpoints Productivos.

## 13. Validación posterior

El drill debe comparar el target contra el manifest, inventarios y expectativas
derivadas del dump sin publicar rows:

- cada tabla admitida y su `rowCount`;
- seis versiones de migration history y hashes desde Git authority;
- Auth users/identities, UUIDs, digests de password y perfiles;
- tablas privadas requeridas;
- bucket privado y configuración gobernada;
- Storage object count, total bytes, paths y SHA-256;
- ausencia de duplicados, metadata faltante y residue inesperado;
- triggers activos, `session_replication_role = origin` y constraints válidas;
- health local de Auth/Storage y login real interno;
- cero conexiones o requests a Production/Supabase Managed.

La evidencia persistida sólo contiene estados, conteos agregados y versiones
sanitizadas. No contiene UUIDs, emails, paths de objetos, hashes de password ni
valores del snapshot clasificados como internos.

## 14. Cleanup

Tras PASS o FAIL controlado:

```text
stop and destroy exact disposable target
verify zero target containers/volumes owned by the session
delete decrypted plaintext workspace
delete temporary R2 ciphertext/receipt downloads
delete disposable target/config workdir
preserve original local ciphertext
preserve original local receipt
preserve all R2 objects
leave external age identity untouched
```

Antes de borrar se revalida contención y ausencia de links. No se afirma secure
erase. Si cualquier cleanup falla, el resultado será
`CLEANUP INCOMPLETE / MANUAL OPERATOR ACTION REQUIRED`; el reporte conserva una
referencia sanitizada de fase, no una ruta absoluta, y M.5.3 no puede cerrar.

## 15. Gap y severidad

| Severidad | Gap | Criterio de salida |
| --- | --- | --- |
| `BLOCKER PARA M.5.3` | No existe restore Managed ni command gate separado. | M.5.3A/B con tests fail-closed. |
| `BLOCKER PARA M.5.3` | No existe admisión exacta manifest↔checksums↔árbol. | Verificador que rechace missing, extra, links y mismatch. |
| `BLOCKER PARA M.5.3` | Extracción tar no endurecida contra entries inseguras. | Preflight de archive y walk posterior sin links/tipos especiales. |
| `BLOCKER PARA M.5.3` | R2 adapter mezcla recovery y publicación. | Adapter recovery-only con operaciones read-only. |
| `BLOCKER PARA M.5.3` | M.5.1 target/restore es monolítico y fixture-specific. | Target local reutilizable, ports/project ID únicos y cleanup probado. |
| `BLOCKER PARA M.5.3` | Falta clasificar/admitir los cinco artifacts SQL Productivos. | Roles/schema/history audit-only y data-only mutante probado. |
| `BLOCKER PARA M.5.3` | Exclusión/invalidez de sesiones Auth no está demostrada desde el dump. | Gate pre-SQL y post-restore de estado efímero. |
| `BLOCKER PARA M.5.3` | Continuidad exacta Auth y login real no tienen tooling de drill. | Comparación confidencial y prompt interactivo testeados. |
| `BLOCKER PARA M.5.3` | Layout Storage local de M.5.1 difiere del Productivo. | Adoptar `storage/<path>` y cubrir empty/nonempty. |
| `BLOCKER PARA M.5.3` | Cleanup integral de recovery no existe. | Cleanup PASS/FAIL probado y bloqueo de cierre. |
| `IMPORTANT AFTER PILOT` | El target local no prueba fidelidad Supabase Managed completa. | Drill futuro en proyecto managed nuevo bajo autorización separada. |
| `IMPORTANT AFTER PILOT` | El backup real actual no ejercita Storage no vacío. | Drill posterior con objetos reales o fixture gobernado no vacío. |
| `IMPORTANT AFTER PILOT` | Escala y duración no están caracterizadas. | Medición con volumen representativo y budget operativo. |
| `IMPORTANT AFTER PILOT` | Compatibilidad de archive para futuros paths de Storage que requieran GNU longname/PAX; recovery actual permanece fail-closed. | Diseñar, admitir y probar extensiones de archive sin relajar traversal/links/exact-tree. |
| `OPTIONAL HARDENING` | Reporte machine-readable firmado por operador. | Diseño separado sin secretos ni nueva PKI improvisada. |
| `OPTIONAL HARDENING` | Mejoras platform-specific de ACL/secure temp. | Hardening adicional sin prometer secure erase. |

## 16. Plan de implementación recomendado

### PPO-04M.5.3A — Restore contract + source verification tooling

- schemas estrictos de recovery session y writer-freeze;
- adapter R2 recovery-only inyectable;
- receipt/ciphertext verification;
- identity path admission y runner redacted;
- safe archive preflight/extract;
- manifest/checksum/tree/authority cross-validation;
- tests sintéticos sin R2 ni decrypt real.

Estado implementado el 2026-09-25 bajo `scripts/managed-backup-recovery/`:

- sesión privada, no reutilizable y con cleanup fail-closed;
- admisión de identity externa sin lectura ni serialización de su ruta;
- preflight sanitizado de Node, age 1.3.1, tar, rclone, Docker y Supabase CLI
  repo-local;
- adapter R2 recovery-only con candidate keys deterministas y descargas locales
  no-replace;
- parser ustar propio que admite sólo files/directories y bloquea traversal,
  links, duplicados y tipos especiales antes de extraer;
- segundo walk del árbol extraído;
- verificación exacta manifest↔checksums↔filesystem↔inventarios↔receipt↔snapshot;
- validación temporal compartida de `writer-freeze.json`;
- clasificación no ejecutora de los cinco artifacts SQL y admisión fail-closed
  de `managed-data.sql`;
- detección agregada de estado Auth efímero;
- orquestador local con adapters inyectables y cleanup en PASS/FAIL.

La suite `ops:restore:managed:source:test` usa únicamente fixtures locales. No
existe todavía comando destructivo `ops:restore:managed`.

Los blockers de source verification, archive admission, adapter R2 read-only,
exact-tree, clasificación SQL, Storage empty/nonempty y cleanup quedaron
aprobados en M.5.3A. La lectura R2, el decrypt y el restore reales permanecen
fuera de este pase.

### PPO-04M.5.3B — Isolated local target + restore tooling

Implementado el 2026-09-25 bajo `scripts/managed-backup-recovery/`, sólo con
fixtures y adapters falsos:

- autoridad Git read-only sobre `manifest.productionRuntimeSha`, con config y
  las seis migraciones exactas leídas del objeto Git sin checkout/fetch;
- target workdir contenido en `session.target`, project ID interno, puertos
  dinámicos únicos y config local sin seed, link ni URLs Productivas;
- command plans `shell:false`, CLI repo-local, environment allowlisted,
  resolución del DB container por labels y proof `LOCAL_ONLY`;
- baseline gate 01–06, schemas/extensiones y bucket privado;
- audit no ejecutor de roles/schema/history y plan mutable derivado del parser
  admitido de M.5.3A;
- eliminación determinista de COPY blocks Auth efímeros y construcción opaca
  de stdin para `psql --single-transaction` con truncation explícito;
- continuidad Auth mediante digests no reversibles, validación DB/Storage por
  agregados y contrato de login interactivo todavía `NOT_EXECUTED`;
- orden DB → metadata Storage → bytes, con
  `EMPTY_STORAGE_BYTE_RESTORE = VALIDATED_NO_OP` cuando el inventario es cero;
- cleanup limitado al project/session identity, con residue y fallo visibles.

La suite `ops:restore:managed:target:test` no inicia Docker, Supabase ni psql.
No existe un CLI destructivo `ops:restore:managed`.

### PPO-04M.5.3C — Real backup restore drill

Requiere autorización one-shot separada. Descarga desde R2, usa la identity
externa bajo control del operador y restaura sólo al target local desechable.
No usa Production ni Supabase Managed como target y no modifica R2.

La corrección C.1.1 hace operator-governed el boundary real de recuperación,
elimina el truncado implícito con `CASCADE`, impone autoridad explícita de
truncado y añade un gate read-only de integridad FK de datos y constraint
triggers. El catálogo y la evidencia permanecen opacos; no contienen nombres de
relaciones, columnas, paths ni SQL de datos. Toda la verificación de este pase es
sintética y la ejecución real continúa no autorizada.

M.5.3C.0 queda `CLOSED / REAL RESTORE EXECUTION CONTRACT APPROVED`. M.5.3C.1
implementa el comando `ops:restore:managed:drill:local`, pero su ejecución real
queda `NOT AUTHORIZED`. El orquestador conserva una única `RecoverySession`,
reusa el adapter R2 read-only y el verifier exacto de M.5.3A, y usa las mismas
primitives de executor/baseline que pasaron B.2 Attempt #5. Revalida el target
inmediatamente antes de la única transacción `managed-data.sql`, exige metadata
Storage consultada al target, restringe este primer drill a `objectCount = 0`,
ejecuta validación DB/Auth/Storage completa y sólo después habilita el login
local interactivo en memoria. Cleanup target y cleanup source/session mantienen
precedencia fail-closed.

```text
PPO-04M.5.3B.2 ATTEMPT #3 = FAIL / OPERATOR DOCKER EXECUTION CONTEXT FINDING
PPO-04M.5.3B.2 ATTEMPT #5 = PASS / REAL LOCAL TARGET COMPATIBILITY VERIFIED
PPO-04M.5.3B.2 TESTED TOOLING SHA = 77cd7f7233e2b417a2c62e8147f57389c0704112
PPO-04M.5.3C REAL EXECUTION = NOT AUTHORIZED
REAL BACKUP RESTORE EXECUTION = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
```

La evidencia sanitizada exacta de Attempt #5 se conserva en
`PPO_04M5_BACKUP_RECOVERY_DESIGN.md`; no contiene project ID, containers,
puertos, endpoints, paths, credenciales ni catálogo completo.

### PPO-04M.5.3D — Validation + baseline closure

`PPO-04M.5.3D.0` queda cerrado como contrato y `PPO-04M.5.3D.1` queda aprobado
con tooling SHA `0b8ab995221c7fedde28f5567831810e13085eaf`. D.1.1 corrigió su
autoridad runtime: source/config y `package-lock.json` continúan
byte-exact, mientras `package.json` excluye semánticamente sólo `scripts` y
compara exactamente todos los demás campos. La copia Git-governed dentro de
`session.evidence` recibe el `package.json` exacto del SHA Productivo y sólo
permite que Next escriba dist/cache/temporales dentro de esa sesión.

La aplicación queda limitada a `127.0.0.1` y puerto dinámico, con environment
allowlisted construido desde el target local admitido. Los gates sintéticos
cubren health exacto, reutilización de una única credencial en memoria, login
email-only, dashboard o cambio inicial, rechazo anónimo y bloqueo de todo origin
que no sea la app o el Supabase local recuperado. No se ejecutó Playwright real.

El cierre RLS/grants no repite la matriz E2E: verifica la cadena baseline 01–06
exacta + roles/schema/history `AUDIT_ONLY` + restore data-only. El backup actual
tiene Storage vacío, por lo que private download no se ejerce y
`TD-BACKUP-004` continúa requerido antes del primer recovery no vacío. Cleanup
mantiene precedencia source/session > target > app > fallo primario.

```text
PPO-04M.5.3C.1.1 = CLOSED / RESTORE MUTATION + BOUNDARY HARDENING APPROVED
PPO-04M.5.3C.1 = CLOSED / REAL RESTORE ORCHESTRATOR TOOLING APPROVED
PPO-04M.5.3C.1 APPROVED TOOLING SHA = 5e257838cdf73df1a3f07d3473b6d65bf5f4595c
PPO-04M.5.3D.0 = CLOSED / VALIDATION + BASELINE CLOSURE CONTRACT APPROVED
PPO-04M.5.3D.1 = CLOSED / RECOVERY APPLICATION VALIDATION TOOLING APPROVED
PPO-04M.5.3D.1 APPROVED TOOLING SHA = 0b8ab995221c7fedde28f5567831810e13085eaf
PPO-04M.5.3D.1.1 = CLOSED / APPLICATION RUNTIME AUTHORITY CORRECTION APPROVED
PPO-04M.5.3D.2 = CLOSED / REAL LOCAL RECOVERY APPLICATION COMPATIBILITY VERIFIED
PPO-04M.5.3D.2.1 = REAL-ENVIRONMENT CORRECTION VERIFIED BY ATTEMPT #2
PPO-04M.5.3D.2.2 = CLOSED / HEALTH DIAGNOSTIC + COLD-START HARDENING APPROVED
PPO-04M.5.3D.2.3 = REAL-ENVIRONMENT DIAGNOSTIC VERIFIED BY ATTEMPT #4
PPO-04M.5.3D.2.4 = REAL-ENVIRONMENT MOUNT + TOPOLOGY PATH VERIFIED / LIVE 5XX PERSISTS
PPO-04M.5.3D.2.5 = REAL-ENVIRONMENT REQUEST-SCOPED DIAGNOSTIC VERIFIED BY ATTEMPT #6
PPO-04M.5.3D.2.6 = REAL-ENVIRONMENT SAFE TAXONOMY VERIFIED BY ATTEMPT #7
PPO-04M.5.3D.2.7 = CLOSED / REAL-ENVIRONMENT PRODUCT DEFAULT DISTDIR VERIFIED / NOT CAUSAL FOR THE LIVE FAILURE / ARCHITECTURAL FIDELITY IMPROVEMENT RETAINED
PPO-04M.5.3D.2.8 = CLOSED / WINDOWS SAME-VOLUME APPLICATION RUNTIME TOPOLOGY / REAL-ENVIRONMENT VERIFIED BY ATTEMPT #9
BYTE-EXACT APP RUNTIME AUTHORITY = RETAINED FOR APPLICATION SOURCE / CONFIG / PACKAGE LOCK
PACKAGE.JSON SCRIPTS-ONLY OPERATIONAL DRIFT = SEMANTICALLY EXCLUDED
PACKAGE.JSON NON-SCRIPT FIELDS = EXACT AUTHORITY
TEMPORARY APP PACKAGE.JSON = PRODUCTION RUNTIME AUTHORITY
REAL_SHA_APP_RUNTIME_AUTHORITY = PASS
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED / PENDING FINAL DOCUMENTARY REVIEW
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #1 = FAIL / APPLICATION PROCESS SHUTDOWN LIFECYCLE FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #2 = FAIL / APPLICATION HEALTH GATE DIAGNOSTIC FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #3 = FAIL / LIVE ROUTE RESPONSE DIAGNOSTIC FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #4 = FAIL / TEMPORARY RUNTIME DEPENDENCY RESOLUTION FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #5 = FAIL / LIVE 5XX WITH ACCUMULATED MODULE-RESOLUTION DIAGNOSTIC
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #6 = FAIL / REQUEST-SCOPED MODULE RESOLUTION / SAFE TAXONOMY INSUFFICIENT
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #7 = FAIL / REQUEST-SCOPED RELATIVE IMPORT RESOLUTION FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #8 = FAIL / RELATIVE IMPORT PERSISTS AFTER PRODUCT DISTDIR CORRECTION
PPO-04M.5.3D.2 ATTEMPT #9 = PASS / REAL LOCAL RECOVERY APPLICATION COMPATIBILITY VERIFIED
TD-BACKUP-004 = OPEN
PRIVATE DOWNLOAD = NOT EXERCISED IN EMPTY-STORAGE DRILL / IMPORTANT AFTER PILOT
```

`PPO-04M.5.3D.2` añade un entrypoint independiente para comprobar la aplicación
contra un target local disposable sin descargar ni restaurar el backup. Reutiliza
el baseline read-only de B.2 y la autoridad/runtime D.1, exige confirmación, SHA,
branch y worktree exactos, y bloquea confirmaciones simultáneas de operaciones
Productivas o del restore real. Next sólo puede escribir dentro de
`session.evidence`.

El smoke Playwright D.2 no recibe credenciales ni hace login: verifica la
superficie de `/login` y el rechazo anónimo exacto de `/dashboard`. Browser queda
limitado a los origins locales de app y Supabase; readiness verifica el Auth
local, sin extrapolar esa prueba a todo egress server-side. El cleanup conserva
la precedencia sesión > target > aplicación > browser > fallo primario y verifica
la ausencia del puerto, recursos Docker propios y root de sesión.

Attempt #1 detectó un finding del lifecycle de shutdown del proceso de
aplicación. La evidencia sanitizada sólo permite afirmar
`RECOVERY_APP_CLEANUP_INCOMPLETE` en `APP_CLEANUP`; no permite determinar el
resultado primario previo ni atribuir el fallo a `nextApp.close()`. En
particular, no se registran health, ready ni browser como PASS.

D.2.1 corrige el protocolo terminal del worker: cierre graceful HTTP/Next,
mensaje IPC terminal con callback completado, desconexión IPC y exit explícito.
El parent mantiene ACK + exit real + verificación independiente del puerto; el
kill de emergencia nunca es PASS. Los tres resultados sanitizados nuevos se
limitan a `RECOVERY_APP_SHUTDOWN_CLOSE_FAILED`,
`RECOVERY_APP_SHUTDOWN_EXIT_FAILED` y `RECOVERY_APP_SHUTDOWN_PORT_OPEN`, todos
en `APP_CLEANUP`.

Attempt #2 mantuvo como resultado público `RECOVERY_APP_HEALTH_FAILED` en
`APP_HEALTH`. Por la precedencia de cleanup, esto verifica en entorno real la
corrección D.2.1: no se reprodujo un fallo de aplicación, target o sesión que
sobrescribiera el resultado primario. La clasificación correcta es `NO CLEANUP
FAILURE DETECTED BY PRECEDENCE`, no observación independiente de cada cierre.
Browser no fue alcanzado y la evidencia no identifica live frente a ready ni
confirma como causa a la compilación cold de Next o a Supabase Auth.

D.2.2 añade una request read-only directa a Auth local antes de arrancar Next y
separa los gates `APP_LIVE` y `APP_READY`. Auth usa timeout de 10 segundos;
live/ready usan 120 segundos para el cold start del recovery runtime, una sola
request por endpoint y sin retry de 503. Request y respuesta tienen códigos
sanitizados distintos. El restore real replica estos gates exclusivamente sobre
su `freshStatus` local.

Attempt #3 progresó por baseline, Auth local, autoridad runtime y arranque de
aplicación, y completó la request live; el resultado público fue
`RECOVERY_APP_LIVE_RESPONSE_INVALID` en `APP_LIVE`. Esa evidencia no permitía
afirmar status HTTP, fallo de compilación ni resolución de dependencias. D.2.3 separa
redirect, 404, otros 4xx, 5xx y body inválido; para 5xx consulta exclusivamente
un enum derivado del buffer privado, acotado y redactado del proceso. Nunca
publica logs ni inspecciona body non-200. Attempt #4 verificó ese diagnóstico:
la respuesta live fue 5xx, clase `MODULE_RESOLUTION_FAILURE`, y produjo
`RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED` en `APP_LIVE`.

D.2.4 incorpora una autoridad temporal de dependencias explícita. Valida el
`node_modules` repo-local como directorio real exacto y monta el path exacto del
proyecto temporal mediante junction absoluta de Node en Windows o symlink de
directorio en POSIX. El worker exige que el realpath del mount coincida con el de
`NODE_PATH` antes de invocar `next()`. No modifica Webpack ni el runtime
Productivo, no copia dependencies y no muta la autoridad fuente.

El mount precede al puerto y al proceso. Tanto el cierre normal como todo fallo
posterior al mount lo eliminan antes del cleanup de RecoverySession; la ausencia
del mount y la supervivencia de la fuente se prueban de forma explícita. Sólo se
desvincula el enlace exacto y un fallo produce
`RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED`, preservado como cleanup fail-closed.
El contrato estricto de RecoverySession frente a symlinks/reparse points no se
relaja.

Attempt #5 alcanzó de nuevo `APP_LIVE`. Esto verifica por progresión la
creación del mount D.2.4, la topología comprobada por el worker y el arranque de
Next, pero el live 5xx persiste. El código histórico se obtuvo desde el buffer
acumulado y no permite atribuir la respuesta a module resolution, a una
dependency declarada, a un alias o a un fallo de la junction.

D.2.5 reemplaza esa clasificación por checkpoints opacos ligados a una sola app
y eventos stdout/stderr privados, secuenciados y acotados a aproximadamente 8
KiB. Cada chunk se redacta y normaliza antes de derivar el evento almacenado;
el evento conserva sólo señales y enums seguros, nunca texto diagnóstico,
specifier, ruta o stack. Cada probe crea el checkpoint antes de su
única request; ante 5xx espera hasta 50 ms de quiet local, con máximo de 1000
ms, y sólo clasifica eventos posteriores. No hay retry HTTP ni segunda request.

Attempt #6 devolvió `RECOVERY_APP_LIVE_MODULE_UNKNOWN_FAILED` en `APP_LIVE`
después del checkpoint. Esto verifica en entorno real el boundary request-scoped
de D.2.5, pero no demuestra dependency faltante, alias roto, junction rota,
ruta absoluta, loader request, fallo interno de Next ni otra causa concreta.

D.2.6 descompone de forma fija `PROJECT_ALIAS`, `RELATIVE_IMPORT`,
`NEXT_INTERNAL`, `DECLARED_PACKAGE`, `OTHER_BARE_PACKAGE`, `NODE_BUILTIN`,
`ABSOLUTE_PATH`, `REDACTED_PATH`, `LOADER_REQUEST`, `UNPARSED`, `MIXED` y
`UNKNOWN`. Un marker sin specifier extraíble es `UNPARSED`; dos o más categorías
son `MIXED`; `UNKNOWN` queda sólo como fallback de un specifier extraído no
clasificable. `DECLARED_PACKAGE` deriva exclusivamente del `package.json`
Productivo ya admitido. D.2 y el restore real comparten la misma ruta y
allowlist sanitizada.

Attempt #7 devolvió `RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED` en
`APP_LIVE`. La progresión verifica en entorno real el target y Auth health, el
mount de dependencias y su topología, el arranque, la request live y la
taxonomía segura de D.2.6. El specifier relativo concreto no fue expuesto y la
causa concreta no está probada.

D.2.7 corrige una divergencia arquitectónica observada sin declararla causa
definitiva del 5xx. El Product conserva el `distDir` por defecto `.next` y su
`tsconfig.json` referencia `.next/types` y `.next/dev/types`; el recovery
anterior imponía `.next-recovery`. El runtime disposable reserva ahora
`projectDir/.next` dentro de RecoverySession sin precrearlo y falla cerrado ante
una existencia inesperada. Se eliminó `conf.distDir`; `dir = projectDir`,
`webpack: true`, el mount de `node_modules`, `NODE_PATH`, TEMP/TMP y las demás
autoridades permanecen sin cambios.

Tras `prepare()`, el worker comprueba que `.next` sea un directorio real no
enlazado, con realpath exacto y confinado al proyecto temporal. Si se observa
`next-env.d.ts`, se admite sólo como archivo regular no enlazado, se lee de forma
acotada a 16 KiB y sus imports relativos generados deben resolver dentro de
`.next`; su ausencia se registra internamente como `NOT_OBSERVED`. Los fallos
usan `RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH` o
`RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH` en `APP_START`, sin publicar
contenido generado, targets ni paths.

Attempt #8 volvió a alcanzar `APP_LIVE` y devolvió
`RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED`. Por progresión, el `distDir`
Productivo por defecto y el boundary post-prepare de `.next` pasaron en entorno
real; D.2.7 se retiene como mejora de fidelidad arquitectónica, pero no fue
causal y el fallo relativo persiste. El specifier concreto no fue expuesto.

La hipótesis primaria de D.2.8 es la construcción cross-volume de la entrada
App Router en Windows. En Next 16.2.11, `NEXT_PROJECT_ROOT` deriva del
`__dirname` del paquete Next físico, `NEXT_PROJECT_ROOT_DIST_CLIENT` apunta a su
`dist/client` y el modo development + App Router + webpack construye la entrada
como `"./" + path.relative(dir, .../app-next-dev.js)`. En Windows, la ruta
relativa entre unidades o shares UNC distintos no es una entrada relativa
ordinaria. Esta hipótesis deriva del código exacto instalado, pero queda pendiente
de verificación mediante un intento real same-volume.

D.2.8 mide esta topología con semántica `path.win32`: compara roots de forma
case-insensitive, distingue shares UNC y reproduce estructuralmente la entrada
relativa de Next. El harness local selecciona en Windows un parent hermano del
repositorio, externo y en el mismo volumen; POSIX conserva el parent basado en
`tmpdir()`. Tras crear la sesión vuelve a verificar el volumen antes de
`TARGET_PREPARE`. El restore real valida el parent explícito antes de cualquier
source/R2/decrypt/target. El proceso padre comprueba además la autoridad Next
física antes del fork y el worker repite el control sobre `next/package.json`
resuelto. Todo desacuerdo falla de forma sanitizada con
`RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH`; no se publican volúmenes, shares ni
paths. El mount de `node_modules`, `NODE_PATH`, `.next`, cwd y los contratos de
cleanup permanecen sin cambios.

La auditoría estática del SHA Productivo confirma como inputs raíz
materializados `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`,
`package.json`, `package-lock.json`, `src/` y `public/`; no se identificó un
runtime config raíz obviamente omitido. `/api/health/live` no importa lógica de
aplicación y devuelve exactamente `{ status: "ok" }`. Esto no demuestra que la
compilación de Next evite cargar infraestructura global.

## 17. Estado final del audit

```text
PPO-04M.5.2 =
CLOSED / FIRST PRODUCTION BACKUP + EXTERNAL CUSTODY VERIFIED

PPO-04M.5.3.0 =
CLOSED / RESTORE DRILL ARCHITECTURE APPROVED

PPO-04M.5.3A =
CLOSED / SOURCE VERIFICATION TOOLING APPROVED

PPO-04M.5.3B =
CLOSED / ISOLATED TARGET + RESTORE TOOLING APPROVED

PPO-04M.5.3B.2 =
CLOSED / REAL LOCAL TARGET COMPATIBILITY VERIFIED

PPO-04M.5.3C.0 =
CLOSED / REAL RESTORE EXECUTION CONTRACT APPROVED

PPO-04M.5.3C.1.1 =
CLOSED / RESTORE MUTATION + BOUNDARY HARDENING APPROVED

PPO-04M.5.3C.1 =
CLOSED / REAL RESTORE ORCHESTRATOR TOOLING APPROVED

PPO-04M.5.3C.1 APPROVED TOOLING SHA =
5e257838cdf73df1a3f07d3473b6d65bf5f4595c

PPO-04M.5.3D.0 =
CLOSED / VALIDATION + BASELINE CLOSURE CONTRACT APPROVED

PPO-04M.5.3D.1 =
CLOSED / RECOVERY APPLICATION VALIDATION TOOLING APPROVED

PPO-04M.5.3D.1 APPROVED TOOLING SHA =
0b8ab995221c7fedde28f5567831810e13085eaf

PPO-04M.5.3D.1.1 =
CLOSED / APPLICATION RUNTIME AUTHORITY CORRECTION APPROVED

PPO-04M.5.3D.2 =
CLOSED / REAL LOCAL RECOVERY APPLICATION COMPATIBILITY VERIFIED

PPO-04M.5.3D.2.1 =
REAL-ENVIRONMENT CORRECTION VERIFIED BY ATTEMPT #2

PPO-04M.5.3D.2.2 =
CLOSED / HEALTH DIAGNOSTIC + COLD-START HARDENING APPROVED

PPO-04M.5.3D.2.3 =
REAL-ENVIRONMENT DIAGNOSTIC VERIFIED BY ATTEMPT #4

PPO-04M.5.3D.2.4 =
REAL-ENVIRONMENT MOUNT + TOPOLOGY PATH VERIFIED / LIVE 5XX PERSISTS

PPO-04M.5.3D.2.5 =
REAL-ENVIRONMENT REQUEST-SCOPED DIAGNOSTIC VERIFIED BY ATTEMPT #6

PPO-04M.5.3D.2.6 =
REAL-ENVIRONMENT SAFE TAXONOMY VERIFIED BY ATTEMPT #7

PPO-04M.5.3D.2.7 =
CLOSED /
REAL-ENVIRONMENT PRODUCT DEFAULT DISTDIR VERIFIED /
NOT CAUSAL FOR THE LIVE FAILURE /
ARCHITECTURAL FIDELITY IMPROVEMENT RETAINED

PPO-04M.5.3D.2.8 =
CLOSED /
WINDOWS SAME-VOLUME APPLICATION RUNTIME TOPOLOGY /
REAL-ENVIRONMENT VERIFIED BY ATTEMPT #9

REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #1 =
FAIL / APPLICATION PROCESS SHUTDOWN LIFECYCLE FINDING

FAILURE CODE =
RECOVERY_APP_CLEANUP_INCOMPLETE

PUBLIC FAILURE PHASE =
APP_CLEANUP

REAL TARGET STARTS =
1

RESTORE SQL EXECUTIONS =
0

R2 READS =
0

AGE DECRYPTS =
0

PRODUCTION MUTATIONS =
0

TARGET CLEANUP FAILURE DETECTED =
NO

SESSION CLEANUP FAILURE DETECTED =
NO

PRE-CLEANUP PRIMARY RESULT =
NOT DETERMINABLE FROM SANITIZED ATTEMPT #1 EVIDENCE

ATTEMPT #1 RETRIES =
0

REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #2 =
FAIL / APPLICATION HEALTH GATE DIAGNOSTIC FINDING

FAILURE CODE =
RECOVERY_APP_HEALTH_FAILED

PUBLIC FAILURE PHASE =
APP_HEALTH

REAL TARGET STARTS =
1

RESTORE SQL EXECUTIONS =
0

R2 READS =
0

AGE DECRYPTS =
0

PRODUCTION MUTATIONS =
0

CLEANUP CLASSIFICATION =
NO CLEANUP FAILURE DETECTED BY PRECEDENCE

APPLICATION CLEANUP FAILURE DETECTED =
NO

TARGET CLEANUP FAILURE DETECTED =
NO

SESSION CLEANUP FAILURE DETECTED =
NO

BROWSER REACHED =
NO

LIVE RESULT =
NOT DETERMINABLE FROM ATTEMPT #2 EVIDENCE

READY RESULT =
NOT DETERMINABLE FROM ATTEMPT #2 EVIDENCE

REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #3 =
FAIL / LIVE ROUTE RESPONSE DIAGNOSTIC FINDING

FAILURE CODE =
RECOVERY_APP_LIVE_RESPONSE_INVALID

PUBLIC PHASE =
APP_LIVE

REAL TARGET STARTS =
1

TARGET BASELINE =
PASS BY PHASE PROGRESSION

TARGET AUTH HEALTH =
PASS BY PHASE PROGRESSION

APPLICATION RUNTIME AUTHORITY =
PASS BY PHASE PROGRESSION

APPLICATION START =
PASS BY PHASE PROGRESSION

LIVE REQUEST =
COMPLETED

LIVE RESPONSE =
INVALID / CLASS NOT AVAILABLE IN ATTEMPT #3

READY =
NOT REACHED

BROWSER =
NOT REACHED

CLEANUP CLASSIFICATION =
NO CLEANUP FAILURE DETECTED BY PRECEDENCE

APPLICATION CLEANUP FAILURE DETECTED =
NO

TARGET CLEANUP FAILURE DETECTED =
NO

SESSION CLEANUP FAILURE DETECTED =
NO

RESTORE SQL EXECUTIONS =
0

R2 READS =
0

AGE DECRYPTS =
0

PRODUCTION MUTATIONS =
0

REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #4 =
FAIL / TEMPORARY RUNTIME DEPENDENCY RESOLUTION FINDING

FAILURE CODE =
RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED

PUBLIC PHASE =
APP_LIVE

REAL TARGET STARTS =
1

TARGET AUTH HEALTH =
PASS BY PHASE PROGRESSION

APPLICATION START =
PASS BY PHASE PROGRESSION

LIVE REQUEST =
COMPLETED

LIVE RESPONSE =
5XX / MODULE_RESOLUTION_FAILURE

READY =
NOT REACHED

BROWSER =
NOT REACHED

CLEANUP =
NO CLEANUP FAILURE DETECTED BY PRECEDENCE

RESTORE SQL EXECUTIONS =
0

R2 READS =
0

AGE DECRYPTS =
0

PRODUCTION MUTATIONS =
0

REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #5 =
FAIL / LIVE 5XX WITH ACCUMULATED MODULE-RESOLUTION DIAGNOSTIC

FAILURE CODE =
RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED

PUBLIC PHASE =
APP_LIVE

REAL TARGET STARTS =
1

TARGET AUTH HEALTH =
PASS BY PHASE PROGRESSION

DEPENDENCY MOUNT =
PASS BY PHASE PROGRESSION

WORKER DEPENDENCY TOPOLOGY =
PASS BY PHASE PROGRESSION

APPLICATION START =
PASS BY PHASE PROGRESSION

LIVE REQUEST =
COMPLETED

LIVE RESPONSE =
5XX

REQUEST-SCOPED ROOT DIAGNOSTIC =
NOT AVAILABLE IN ATTEMPT #5

READY =
NOT REACHED

BROWSER =
NOT REACHED

CLEANUP =
NO CLEANUP FAILURE DETECTED BY PRECEDENCE

RESTORE SQL EXECUTIONS =
0

R2 READS =
0

AGE DECRYPTS =
0

PRODUCTION MUTATIONS =
0

REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #6 =
FAIL / REQUEST-SCOPED MODULE RESOLUTION / SAFE TAXONOMY INSUFFICIENT

FAILURE CODE =
RECOVERY_APP_LIVE_MODULE_UNKNOWN_FAILED

PUBLIC PHASE =
APP_LIVE

REAL TARGET STARTS =
1

RESTORE SQL EXECUTIONS =
0

R2 READS =
0

AGE DECRYPTS =
0

PRODUCTION MUTATIONS =
0

CONCRETE ROOT CAUSE =
NOT DEMONSTRATED

PPO-04M.5.3D.2 ATTEMPT #7 =
FAIL / REQUEST-SCOPED RELATIVE IMPORT RESOLUTION FINDING

FAILURE CODE =
RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED

PUBLIC PHASE =
APP_LIVE

REAL TARGET STARTS =
1

RESTORE SQL EXECUTIONS =
0

R2 READS =
0

AGE DECRYPTS =
0

PRODUCTION MUTATIONS =
0

CONCRETE RELATIVE SPECIFIER =
NOT EXPOSED

CONCRETE ROOT CAUSE =
NOT PROVEN

PRODUCT DISTDIR =
.next / DEFAULT

RECOVERY DISTDIR BEFORE D.2.7 =
.next-recovery / PROGRAMMATIC OVERRIDE

PRODUCT TSCONFIG GENERATED TYPE PATHS =
.next/types
.next/dev/types

REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #8 =
FAIL / RELATIVE IMPORT PERSISTS AFTER PRODUCT DISTDIR CORRECTION

FAILURE CODE =
RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED

PUBLIC PHASE =
APP_LIVE

REAL TARGET STARTS =
1

RESTORE SQL EXECUTIONS =
0

R2 READS =
0

AGE DECRYPTS =
0

PRODUCTION MUTATIONS =
0

PRODUCT DEFAULT DISTDIR =
PASSED BY PHASE PROGRESSION

CONCRETE RELATIVE SPECIFIER =
NOT EXPOSED

D.2.7 ROOT-CAUSE STATUS =
NOT CAUSAL / ARCHITECTURAL FIDELITY IMPROVEMENT RETAINED

ROOT CAUSE =
WINDOWS CROSS-VOLUME NEXT APP-ROUTER ENTRY CONSTRUCTION

ROOT CAUSE STATUS =
CONFIRMED BY REAL-ENVIRONMENT ATTEMPT #9

PPO-04M.5.3D.2 ATTEMPT #9 =
PASS / REAL LOCAL RECOVERY APPLICATION COMPATIBILITY VERIFIED

status =
PASS

operation =
real-local-recovery-application-compatibility

runtimeAuthority =
VERIFIED

targetIsolation =
VERIFIED

baselineMigrationCount =
6

targetAuthHealth =
PASS

applicationRuntimeAuthority =
VERIFIED

applicationStart =
PASS

applicationLive =
PASS

applicationReady =
PASS

applicationLocalSupabaseReadiness =
VERIFIED

loginSurface =
PASS

anonymousInternalAccess =
REJECTED

browserRemoteIsolation =
VERIFIED

browserCleanup =
PASS

applicationCleanup =
PASS

targetCleanup =
PASS

sessionCleanup =
PASS

realTargetStarts =
1

restoreSqlExecutions =
0

realR2Reads =
0

realAgeDecrypts =
0

productionMutations =
0

ATTEMPT EXIT CODE =
0

D.2 FINAL REAL ATTEMPT =
#9 / PASS

D.2 FINAL VERIFIED CAPABILITIES =
runtime authority /
local target isolation /
baseline 01-06 /
direct local Auth health /
Product application startup /
live health /
ready health /
local Supabase readiness /
login surface /
anonymous internal rejection /
browser remote isolation /
browser cleanup /
application cleanup /
target cleanup /
session cleanup

D.2 RESTORE ACTIVITY =
NONE

D.2 R2 ACTIVITY =
NONE

D.2 AGE DECRYPT ACTIVITY =
NONE

D.2 PRODUCTION MUTATIONS =
NONE

REAL TARGET STARTS DURING D.2.8 CORRECTION =
0

REAL APP STARTS DURING D.2.8 CORRECTION =
0

REAL CHROMIUM STARTS DURING D.2.8 CORRECTION =
0

RESTORE SQL EXECUTIONS DURING D.2.8 CORRECTION =
0

R2 READS DURING D.2.8 CORRECTION =
0

AGE DECRYPTS DURING D.2.8 CORRECTION =
0

PRODUCTION ACTIVITY DURING D.2.8 CORRECTION =
0

REAL TARGET STARTS DURING D.2.7 CORRECTION =
0

REAL APP STARTS DURING D.2.7 CORRECTION =
0

REAL CHROMIUM STARTS DURING D.2.7 CORRECTION =
0

RESTORE SQL EXECUTIONS DURING D.2.7 CORRECTION =
0

R2 READS DURING D.2.7 CORRECTION =
0

AGE DECRYPTS DURING D.2.7 CORRECTION =
0

PRODUCTION ACTIVITY DURING D.2.7 CORRECTION =
0

REAL TARGET STARTS DURING D.2.5 CORRECTION =
0

REAL APP STARTS DURING D.2.5 CORRECTION =
0

REAL CHROMIUM STARTS DURING D.2.5 CORRECTION =
0

RESTORE SQL EXECUTIONS DURING D.2.5 CORRECTION =
0

R2 READS DURING D.2.5 CORRECTION =
0

AGE DECRYPTS DURING D.2.5 CORRECTION =
0

PRODUCTION ACTIVITY DURING D.2.5 CORRECTION =
0

REAL TARGET STARTS DURING D.2.4 CORRECTION =
0

REAL APP STARTS DURING D.2.4 CORRECTION =
0

REAL CHROMIUM STARTS DURING D.2.4 CORRECTION =
0

RESTORE SQL EXECUTIONS DURING D.2.4 CORRECTION =
0

R2 READS DURING D.2.4 CORRECTION =
0

AGE DECRYPTS DURING D.2.4 CORRECTION =
0

PRODUCTION ACTIVITY DURING D.2.4 CORRECTION =
0

REAL TARGET STARTS DURING D.2.3 CORRECTION =
0

REAL APP STARTS DURING D.2.3 CORRECTION =
0

REAL CHROMIUM STARTS DURING D.2.3 CORRECTION =
0

RESTORE SQL EXECUTIONS DURING D.2.3 CORRECTION =
0

R2 READS DURING D.2.3 CORRECTION =
0

AGE DECRYPTS DURING D.2.3 CORRECTION =
0

PRODUCTION ACTIVITY DURING D.2.3 CORRECTION =
0

REAL TARGET STARTS DURING D.2.2 CORRECTION =
0

REAL APP STARTS DURING D.2.2 CORRECTION =
0

REAL CHROMIUM STARTS DURING D.2.2 CORRECTION =
0

RESTORE SQL EXECUTIONS DURING D.2.2 CORRECTION =
0

R2 READS DURING D.2.2 CORRECTION =
0

AGE DECRYPTS DURING D.2.2 CORRECTION =
0

PRODUCTION ACTIVITY DURING D.2.2 CORRECTION =
0

PPO-04M.5.3 =
ACTIVE / ROLES DIALECT REMEDIATION

REAL RESTORE ATTEMPT #1 =
FAIL / PREFLIGHT OPERATOR CONFIGURATION

REAL RESTORE ATTEMPT #2 =
FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING

REAL RESTORE ATTEMPT #3 =
NOT AUTHORIZED / PENDING FINAL DOCUMENTARY REVIEW

CURRENT REAL RESTORE STORAGE SCOPE =
EMPTY STORAGE ONLY

PRODUCTION RESTORE =
NOT AUTHORIZED

REAL LOCAL RESTORE TARGET =
COMPATIBILITY VERIFIED /
NOT REACHED BY REAL RESTORE ATTEMPTS #1-#2

REAL R2 RECOVERY READ =
EXECUTED / ATTEMPT #2

REAL R2 READ OPERATIONS =
3 / READ-ONLY

REAL AGE DECRYPT =
EXECUTED / ATTEMPT #2

REAL AGE DECRYPT OPERATIONS =
1

REMOTE ACTIVITY =
3 / READ-ONLY R2 OPERATIONS

REAL TARGET STARTS ACROSS REAL RESTORE ATTEMPTS #1-#2 =
0

REAL RESTORE SQL EXECUTIONS ACROSS ATTEMPTS #1-#2 =
0

REAL RESTORE TARGET MUTATIONS ACROSS ATTEMPTS #1-#2 =
0

PRODUCTION MUTATIONS =
0

REAL TARGET STARTS ACROSS D.2 ATTEMPTS #1-#5 =
5 / ONE IN EACH ATTEMPT

TARGET MUTATIONS =
NOT DETERMINABLE FROM SANITIZED ATTEMPT #1 EVIDENCE

SQL EXECUTION =
0

REAL APP STARTS =
NOT DETERMINABLE FROM SANITIZED ATTEMPT #1 EVIDENCE

REAL LOGIN ATTEMPTS =
NOT DETERMINABLE FROM SANITIZED ATTEMPT #1 EVIDENCE

TD-BACKUP-004 =
OPEN

PRIVATE DOWNLOAD =
NOT EXERCISED IN EMPTY-STORAGE DRILL / IMPORTANT AFTER PILOT
```

## Cierre causal de PPO-04M.5.3D.2

Attempts #7 y #8 reprodujeron el mismo fallo request-scoped `RELATIVE_IMPORT`
mientras el runtime disposable de aplicación podía ubicarse en un volumen
Windows distinto de la autoridad física repo-local de la dependencia Next.
D.2.8 movió y gobernó el runtime disposable sobre una topología compatible del
mismo volumen y añadió gates de topología fail-closed. En Attempt #9 pasaron la
aplicación live, ready, la validación browser y todos los niveles de cleanup.

La conclusión queda limitada al fallo reproducido por este recovery runtime y
a la construcción relativa de Next implicada. No constituye una afirmación
general sobre todo proyecto Next.js cross-volume en Windows.

La secuencia auditada se conserva completa: #1 corrigió el lifecycle de
shutdown; #2 aisló el diagnóstico de health; #3 expuso el fallo de live; #4
clasificó la resolución de dependencias; #5 demostró la limitación del
diagnóstico acumulado; #6 produjo `UNKNOWN` request-scoped; #7 aisló el import
relativo; #8 confirmó su persistencia tras corregir `distDir`; y #9 pasó tras la
corrección de topología same-volume.

```text
REAL TARGET STARTS DURING DOCUMENTARY CLOSURE = 0
REAL APP STARTS DURING DOCUMENTARY CLOSURE = 0
REAL CHROMIUM STARTS DURING DOCUMENTARY CLOSURE = 0
RESTORE SQL EXECUTIONS DURING DOCUMENTARY CLOSURE = 0
R2 READS DURING DOCUMENTARY CLOSURE = 0
AGE DECRYPTS DURING DOCUMENTARY CLOSURE = 0
PRODUCTION ACTIVITY DURING DOCUMENTARY CLOSURE = 0
```

## Real Restore Attempts #1 y #2 — finding de admisión SQL

Attempt #1 no superó el preflight del operador y no alcanzó fuente, decrypt,
target ni SQL. El path de identity fue introducido con comillas literales por
`Read-Host`, el entorno R2 no estaba cargado y el wrapper PowerShell interactivo
no abortó toda la secuencia pegada después del error. No se registran paths ni
valores privados.

```text
REAL RESTORE ATTEMPT #1 =
FAIL / PREFLIGHT OPERATOR CONFIGURATION

PUBLIC CODE =
RECOVERY_DRILL_FAILED

PUBLIC PHASE =
PREFLIGHT

REAL TARGET STARTS =
0

SQL EXECUTIONS =
0

TARGET MUTATIONS =
0

R2 READS =
0

AGE DECRYPTS =
0

PRODUCTION MUTATIONS =
0

AGE IDENTITY PATH =
ENTERED WITH LITERAL QUOTES THROUGH READ-HOST

R2 PROCESS ENVIRONMENT =
NOT LOADED

INTERACTIVE POWERSHELL WRAPPER =
DID NOT ABORT THE ENTIRE PASTED SEQUENCE AFTER OPERATOR PREFLIGHT ERROR
```

Attempt #2 completó la selección, descarga, decrypt y verificación exacta del
bundle antes de que la admisión del SQL data-only fallara cerrada. Esta
evidencia no declara el backup corrupto ni identifica todavía la sentencia.

```text
REAL RESTORE ATTEMPT #2 =
FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING

status =
FAIL

code =
RECOVERY_SQL_STATEMENT_FORBIDDEN

phase =
SOURCE_VERIFY

realTargetStarts =
0

sqlExecutions =
0

targetMutations =
0

realR2Reads =
3

realAgeDecrypts =
1

productionMutations =
0

ATTEMPT EXIT CODE =
1

R2 candidate inspection =
PASS BY PHASE PROGRESSION

external receipt =
PASS BY PHASE PROGRESSION

ciphertext download + verification =
PASS BY PHASE PROGRESSION

age identity =
PASS BY PHASE PROGRESSION

age decrypt =
PASS BY PHASE PROGRESSION

safe TAR inspection/extraction =
PASS BY PHASE PROGRESSION

exact bundle verification =
PASS BY PHASE PROGRESSION

managed SQL admission =
FAIL / RECOVERY_SQL_STATEMENT_FORBIDDEN
```

La corrección incorpora una clasificación interna bounded de sentencias no
admitidas. Sólo publica clases fijas; para `SET_PARAMETER` puede conservar el
nombre del parámetro si cumple el identificador seguro, nunca su valor. El JSON
público del restore real continúa mostrando únicamente el código público.

El comando `ops:restore:managed:source:local:diagnose` reutiliza la verificación
oficial con un adapter read-only sobre `<backupId>.age` y
`<backupId>.external-receipt.json` locales. Su preflight sólo requiere Node,
age y tar; no carga R2, no crea target y no ejecuta SQL. El loader estricto de
`.env.managed.r2.local` queda reservado al entrypoint del restore real y aplica
precedencia all-or-none frente al entorno del proceso. El diagnóstico no fue
ejecutado durante esta implementación.

```text
PPO-04M.5.3 = ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

## Local Source Diagnostic #4 — finding de dialecto de roles

Local Source Diagnostic #4 usó exclusivamente el ciphertext local preservado y
confirmó cinco statements inesperados, todos dentro de tres familias upstream
conocidas de Supabase CLI 2.109.1 y PostgreSQL 17. No observó ninguna de las
otras seis clases bounded ni material credencial. La evidencia permanece
sanitizada: no se registran roles, grantees, parámetros concretos, valores ni
SQL Productivo.

La remediación mantiene `database/roles.sql` como `AUDIT_ONLY` y fuera de
`restoreSql`. `auditRolesSql()` admite únicamente `RESET ALL;`, los `ALTER ROLE
... SET ... TO ...` estrictos del allowlist Supabase y los ACL `PARAMETER`
exactos que `buildACLCommands()` puede generar. Las demás variantes continúan
fallando cerrado. Diagnostic #5 no fue ejecutado y su resultado no se presume.

```text
LOCAL SOURCE DIAGNOSTIC #4 = FINDING / ROLES_AUDIT
TOOLING SHA = dcc396107144a763c4757cd522798b30c4de00e8
status = FINDING
phase = ROLES_AUDIT
code = RECOVERY_ROLES_DIALECT_DIAGNOSTIC_FINDING
unexpectedStatementCount = 5
ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG = 3
RESET_ALL = 1
ROLE_PARAMETER_PRIVILEGE_VARIANT = 1
ALTER_ROLE_SET_OTHER_CONFIG = 0
GRANT_ROLE_MEMBERSHIP_VARIANT = 0
CREATE_ROLE_VARIANT = 0
ALTER_ROLE_WITH_VARIANT = 0
SET_STATEMENT_VARIANT = 0
OTHER_ROLE_SQL = 0
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS

UNEXPECTED ROLE SQL OUTSIDE KNOWN UPSTREAM FAMILIES = NOT OBSERVED
CREDENTIAL MATERIAL = NOT OBSERVED

PPO-04M.5.3 = ACTIVE / ROLES DIALECT REMEDIATION
LOCAL SOURCE DIAGNOSTIC #4 = CLOSED / FINDING CONFIRMED
LOCAL SOURCE DIAGNOSTIC #5 = NOT AUTHORIZED / PENDING REMEDIATION REVIEW
REAL RESTORE ATTEMPT #5 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


## Local Source Diagnostic #5 — cierre / roles audit verified

El tooling inmutable `6424609827a9e5d24ad56c991ecb27f331bb7788`
se ejecutó sobre el mismo backup real preservado usado por Diagnostic #4.
Diagnostic #5 cerró en `PASS` y verificó que la remediación estricta cubre las
tres familias observadas sin findings adicionales. La evidencia sigue
sanitizada: no publica identidades, nombres concretos de parámetros, valores,
SQL Productivo raw ni paths absolutos.

```text
LOCAL SOURCE DIAGNOSTIC #5 = PASS / ROLES_AUDIT VERIFIED
TOOLING SHA = 6424609827a9e5d24ad56c991ecb27f331bb7788
status = PASS
operation = local-managed-recovery-source-diagnostic
phase = ROLES_AUDIT
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS
DIAGNOSTIC EXIT CODE = 0

LOCAL PRESERVED CIPHERTEXT = VERIFIED
LOCAL AGE DECRYPT = PASS
SAFE TAR = PASS
EXACT BUNDLE TREE = PASS
MANAGED-DATA SQL ADMISSION = PASS
ROLES.SQL DIALECT AUDIT = PASS
SOURCE CLEANUP = PASS

SUPABASE DATA WRAPPER REMEDIATION = REAL BACKUP VERIFIED
PG_DUMP SEQUENCE SET REMEDIATION = REAL BACKUP VERIFIED
ROLES DIALECT REMEDIATION = REAL BACKUP VERIFIED
```

`database/roles.sql` permanece `AUDIT_ONLY` y fuera de `restoreSql`.
Diagnostic #5 demuestra únicamente que el artifact pertenece al dialecto
gobernado; no demuestra ni autoriza su ejecución. El hard-fail
`RECOVERY_ROLES_CREDENTIAL_MATERIAL` permanece vigente.

```text
ROLE CREDENTIAL MATERIAL = NOT OBSERVED
UNEXPECTED ROLE SQL OUTSIDE GOVERNED DIALECT = NOT OBSERVED
```

Diagnostic #4 se conserva como evidencia histórica del finding previo, sin
reinterpretarlo como corrupción del backup:

```text
LOCAL SOURCE DIAGNOSTIC #4 = FINDING / ROLES_AUDIT
TOOLING SHA = dcc396107144a763c4757cd522798b30c4de00e8
unexpectedStatementCount = 5
ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG = 3
RESET_ALL = 1
ROLE_PARAMETER_PRIVILEGE_VARIANT = 1
```

El historial de intentos reales también permanece inalterado:

```text
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY SQL DIALECT ADMISSION
REAL RESTORE ATTEMPT #3 = FAIL / PREFLIGHT R2 LOCAL ENV ADMISSION
REAL RESTORE ATTEMPT #4 = FAIL / RESTORE_PLAN / ROLES DIALECT AUDIT
REAL RESTORE ATTEMPT #4 TOOLING SHA = 80d27aa9518a928557b8a4e98370d46433c45ee3
ATTEMPT #4 realTargetStarts = 1
ATTEMPT #4 sqlExecutions = 0
ATTEMPT #4 targetMutations = 0
ATTEMPT #4 realR2Reads = 3
ATTEMPT #4 realAgeDecrypts = 1
ATTEMPT #4 productionMutations = 0
```

Diagnostic #5 no verifica el restore completo. Para Real Restore Attempt #5
siguen pendientes:

```text
R2 source re-verification
fresh disposable target creation
target baseline validation
managed-schema audit
migration-history audit
restore-plan complete construction
single SQL mutation
post-restore DB validation
referential integrity
Auth continuity
real internal login
empty Storage validation
application live
application ready
application login
anonymous rejection
RLS/grant baseline
cleanup
```

El estado vigente queda:

```text
LOCAL SOURCE DIAGNOSTIC #5 = CLOSED / PASS / ROLES_AUDIT VERIFIED
SOURCE DIAGNOSTIC WORKSTREAM = CLOSED / REAL BACKUP SOURCE + ROLES VERIFIED
ROLES DIALECT REMEDIATION = APPROVED / REAL BACKUP VERIFIED
PPO-04M.5.3 = ACTIVE / SOURCE + ROLES VERIFIED / REAL RESTORE ATTEMPT #5 PENDING AUTHORIZATION
REAL RESTORE ATTEMPT #5 = NOT AUTHORIZED / PENDING FINAL DOCUMENTARY REVIEW
TD-BACKUP-004 = OPEN
TD-BACKUP-004 = REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

Este cierre fue exclusivamente documental:

```text
REAL R2 READS = 0
REAL AGE DECRYPTS = 0
REAL TARGET STARTS = 0
REAL APP STARTS = 0
REAL CHROMIUM STARTS = 0
SQL EXECUTIONS = 0
PRODUCTION ACTIVITY = 0
```

## Real Restore Attempt #5 — restore plan diagnostic

Real Restore Attempt #5 ejecutó el tooling inmutable
`dbe9c940511ae2b989995da5fb0e831d635e84ec` y se detuvo de forma segura en
`RESTORE_PLAN`. La fuente R2 fue verificada en modo read-only, el decrypt y la
verificación de fuente completaron, y el target local desechable alcanzó su
baseline. No se ejecutó SQL de restore ni hubo mutación del target o Production.
El resultado no demuestra corrupción del backup.

```text
REAL RESTORE ATTEMPT #5 = FAIL / RESTORE_PLAN
TOOLING SHA = dbe9c940511ae2b989995da5fb0e831d635e84ec
code = RECOVERY_DRILL_FAILED
phase = RESTORE_PLAN
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 3
realAgeDecrypts = 1
productionMutations = 0

SOURCE R2 = VERIFIED / READ-ONLY
AGE DECRYPT = REACHED
SOURCE VERIFY = PASS
DISPOSABLE TARGET = STARTED
TARGET BASELINE = REACHED
RESTORE SQL = NOT EXECUTED
TARGET MUTATION = 0
PRODUCTION MUTATION = 0
```

La observabilidad genérica de `sanitizeRealRestoreDrillFailure()` convierte en
`RECOVERY_DRILL_FAILED` cualquier error interno que no pertenezca a su enum
público cerrado. No se amplió indiscriminadamente ese enum. En su lugar se
implementó un diagnóstico separado, bounded y no mutante que reproduce el
mismo punto mediante `buildManagedRestorePlan()` real.

El backup fue creado con Supabase CLI 2.109.1. El dialecto upstream de
`dump_data.sh` envuelve los dumps data-only con un `SET` inicial y
`RESET ALL;` final, incluido el dump de migration history. El auditor actual
admite el `SET` pero no ese `RESET ALL;`; por ello
`RECOVERY_MIGRATION_HISTORY_DATA_INVALID` es una hipótesis fuerte, no un
finding confirmado. No se afirma que fuera el primer error de Attempt #5 porque
`managed-schema` se audita antes.

```text
LOCAL MANAGED RECOVERY PLAN DIAGNOSTIC =
IMPLEMENTED / NOT EXECUTED

SOURCE =
LOCAL PRESERVED BACKUP ONLY

SOURCE ADAPTER =
createLocalRecoverySourceAdapter

R2 READS =
FORBIDDEN / 0

PLAN AUTHORITY =
buildManagedRestorePlan REAL

STOP BOUNDARY =
IMMEDIATELY AFTER RESTORE_PLAN

RESTORE SQL EXECUTION =
FORBIDDEN

STORAGE TRANSFER =
FORBIDDEN

CREDENTIAL PROMPT =
FORBIDDEN

APPLICATION START =
FORBIDDEN

CHROMIUM START =
FORBIDDEN
```

El diagnóstico exige la confirmación exacta
`GODEL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC_CONFIRM=ALLOW_LOCAL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC`,
rechaza confirmaciones incompatibles y mantiene un enum cerrado limitado a
fallos alcanzables durante la construcción del plan. Un código no admitido se
publica únicamente como `RECOVERY_RESTORE_PLAN_DIAGNOSTIC_UNCLASSIFIED`.

```text
PPO-04M.5.3 = ACTIVE / REAL RESTORE PLAN DIAGNOSTIC
REAL RESTORE ATTEMPT #5 = CLOSED / SAFE FAIL / RESTORE_PLAN
LOCAL MANAGED RECOVERY PLAN DIAGNOSTIC = IMPLEMENTED / NOT EXECUTED / PENDING REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
TD-BACKUP-004 = REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

## Local Managed Recovery Source Diagnostic #1 — wrapper confirmado

El diagnóstico local real terminó en `SQL_ADMISSION` y confirmó que el finding
no representa corrupción del backup. La causa es el wrapper data-only exacto
emitido por Supabase CLI 2.109.1. Su prefix y suffix quedan gobernados como
metadata de transporte no ejecutable: ambos se eliminan antes de construir el
SQL de restore y la readmission fail-closed se ejecuta sobre el resultado.

```text
LOCAL MANAGED RECOVERY SOURCE DIAGNOSTIC #1 = FINDING / SQL_ADMISSION
TOOLING SHA = 5f1f4ddb2f7dfe1b7d15d1c14ec8fccd9195737f
statementClass = SET_PARAMETER
setParameter = session_replication_role
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS
SQL DIALECT ROOT CAUSE = SUPABASE CLI V2.109.1 DATA-ONLY WRAPPER NOT YET MODELED
OBSERVED WRAPPER PREFIX = SET session_replication_role = replica;
EXPECTED UPSTREAM WRAPPER SUFFIX = RESET ALL;
PPO-04M.5.3 = ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
LOCAL SOURCE DIAGNOSTIC #2 = CLOSED / FINDING CONFIRMED
LOCAL SOURCE DIAGNOSTIC #3 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

## Local Managed Recovery Source Diagnostic #2 — Sequence SET

Diagnostic #2 alcanzó nuevamente `SQL_ADMISSION` y confirmó que el parser
legacy esperaba `::regclass`, pero el `pg_dump` Productivo de Supabase CLI
2.109.1 usa un qualified sequence name citado, `int64` y boolean. Esto no
declara corrupción del backup. La forma canonical se admite sólo bajo schemas e
identificadores gobernados; la forma legacy permanece limitada y ambas se
conservan como SQL durable, no como transporte.

```text
LOCAL MANAGED RECOVERY SOURCE DIAGNOSTIC #2 = FINDING / SQL_ADMISSION
TOOLING SHA = 86a3b15073f924031116675e22dce056323d3fc7
statementClass = SELECT_PG_CATALOG_SETVAL_VARIANT
setParameter = NOT_APPLICABLE
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS
DIAGNOSTIC #2 ROOT CAUSE = PG_DUMP SEQUENCE SET FORMAT NOT REPRESENTED BY CURRENT SETVAL ADMISSION
CURRENT PARSER EXPECTATION = LEGACY ::regclass FORM
UPSTREAM PG_DUMP CONTRACT = QUALIFIED SEQUENCE NAME STRING + INT64 + BOOLEAN / NO ::regclass
SUPABASE CLI 2.109.1 = DATA-ONLY + QUOTE-ALL-IDENTIFIER
PPO-04M.5.3 = ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION
LOCAL SOURCE DIAGNOSTIC #2 = CLOSED / FINDING CONFIRMED
LOCAL SOURCE DIAGNOSTIC #3 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

## Local Managed Recovery Source Diagnostic #3 — cierre

Diagnostic #3 completó la admisión del managed-data SQL real usando únicamente
la fuente local preservada. Confirma las remediaciones de los findings
identificados por Diagnostics #1/#2 después de Attempt #2; no declara un fallo
del backup ni acredita todavía restore de target, Auth o aplicación.

```text
LOCAL MANAGED RECOVERY SOURCE DIAGNOSTIC #3 = PASS / SQL_ADMISSION VERIFIED
TOOLING SHA = 32e88ac50e540593b3ec464909797605764028d5
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS

LOCAL SOURCE DIAGNOSTIC #1 = CLOSED / SUPABASE DATA WRAPPER FINDING REMEDIATED
LOCAL SOURCE DIAGNOSTIC #2 = CLOSED / PG_DUMP SEQUENCE SET FINDING REMEDIATED
LOCAL SOURCE DIAGNOSTIC #3 = PASS / COMPLETE MANAGED-DATA SQL ADMISSION VERIFIED
SUPABASE DATA WRAPPER REMEDIATION = REAL BACKUP VERIFIED
PG_DUMP SEQUENCE SET REMEDIATION = REAL BACKUP VERIFIED
REAL BACKUP MANAGED-DATA SQL ADMISSION = VERIFIED

LOCAL PRESERVED CIPHERTEXT = VERIFIED
LOCAL AGE DECRYPT = PASS
SAFE TAR = PASS
EXACT BUNDLE TREE = PASS
MANAGED SQL ARTIFACT READ = PASS
MANAGED-DATA SQL ADMISSION = PASS
SOURCE CLEANUP = PASS

R2 SOURCE RE-VERIFICATION = PENDING REAL RESTORE ATTEMPT #3
FRESH DISPOSABLE TARGET CREATION = PENDING REAL RESTORE ATTEMPT #3
BASELINE VALIDATION = PENDING REAL RESTORE ATTEMPT #3
ROLES/SCHEMA/HISTORY AUDITS AGAINST TARGET = PENDING REAL RESTORE ATTEMPT #3
RESTORE-PLAN CONSTRUCTION = PENDING REAL RESTORE ATTEMPT #3
SINGLE SQL MUTATION = PENDING REAL RESTORE ATTEMPT #3
POST-RESTORE DB VALIDATION = PENDING REAL RESTORE ATTEMPT #3
FK/CONSTRAINT VALIDATION = PENDING REAL RESTORE ATTEMPT #3
AUTH CONTINUITY = PENDING REAL RESTORE ATTEMPT #3
REAL INTERNAL LOGIN = PENDING REAL RESTORE ATTEMPT #3
EMPTY STORAGE VALIDATION = PENDING REAL RESTORE ATTEMPT #3
APPLICATION LIVE/READY/LOGIN = PENDING REAL RESTORE ATTEMPT #3
ANONYMOUS REJECTION = PENDING REAL RESTORE ATTEMPT #3
RLS/GRANT BASELINE = PENDING REAL RESTORE ATTEMPT #3
CLEANUP = PENDING REAL RESTORE ATTEMPT #3

LOCAL DIAGNOSTIC R2 READ = NOT EXECUTED
LOCAL DIAGNOSTIC TARGET CREATION = NOT EXECUTED
LOCAL DIAGNOSTIC SQL EXECUTION = NOT EXECUTED
LOCAL DIAGNOSTIC AUTH START = NOT EXECUTED
LOCAL DIAGNOSTIC APPLICATION START = NOT EXECUTED
LOCAL DIAGNOSTIC CHROMIUM START = NOT EXECUTED
LOCAL DIAGNOSTIC PRODUCTION MUTATION = NOT EXECUTED

LOCAL SOURCE DIAGNOSTIC #3 = CLOSED / PASS / SQL_ADMISSION VERIFIED
SOURCE DIAGNOSTIC WORKSTREAM = CLOSED / REAL BACKUP SOURCE SQL ADMISSION VERIFIED
PPO-04M.5.3 = ACTIVE / SOURCE VERIFIED / REAL RESTORE ATTEMPT #3 PENDING AUTHORIZATION
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED / PENDING FINAL DOCUMENTARY REVIEW
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
PRODUCTION RESTORE = NOT AUTHORIZED
PRODUCTION MUTATIONS = 0
TD-BACKUP-004 REQUIREMENT = REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY

REAL R2 READS DURING DOCUMENTARY CLOSURE = 0
REAL AGE DECRYPTS DURING DOCUMENTARY CLOSURE = 0
REAL TARGET STARTS = 0
REAL APP STARTS = 0
REAL CHROMIUM STARTS = 0
SQL EXECUTIONS = 0
PRODUCTION ACTIVITY = 0
```

## Real Restore Attempt #4 — diagnóstico del dialecto de roles

Real Restore Attempt #4 alcanzó la fuente R2 en modo read-only, verificó y
descifró el bundle, inició un target desechable y se detuvo de forma segura al
construir el restore plan porque el dialecto de `database/roles.sql` excede la
gramática gobernada actual. No se ejecutó SQL ni se mutó el target o Production;
esta evidencia no declara corrupción del backup.

La autoridad upstream confirmada es Supabase CLI 2.109.1, release commit
`6d4c19870ed213ba7f682f117d0345c8a40bfa94`, archivo
`apps/cli-go/pkg/migration/scripts/dump_role.sh`. Ese flujo usa
`pg_dumpall --roles-only --role postgres --quote-all-identifier --no-role-passwords --no-comments`,
aplica filtros Supabase y añade `RESET ALL;`. Que upstream emita ese suffix y
que el auditor actual no lo admita no demuestra que esa haya sido la sentencia
concreta del finding Productivo.

El tooling local incorpora una clasificación sanitizada y bounded del artifact
de roles después de la admisión completa de managed-data. No amplía
`auditRolesSql()`, no publica SQL, identities, parámetros ni valores, y conserva
el material credencial como hard failure. Local Source Diagnostic #4 no fue
ejecutado durante esta implementación y continúa sujeto a revisión y autorización.

```text
REAL RESTORE ATTEMPT #4 = FAIL / RESTORE_PLAN / ROLES DIALECT AUDIT
TOOLING SHA = 80d27aa9518a928557b8a4e98370d46433c45ee3
code = RECOVERY_ROLES_DIALECT_UNEXPECTED
phase = RESTORE_PLAN
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 3
realAgeDecrypts = 1
productionMutations = 0

R2 SOURCE = REACHED / READ-ONLY
DECRYPT = REACHED
SOURCE VERIFY = REACHED
DISPOSABLE TARGET = STARTED
RESTORE SQL = NOT EXECUTED
TARGET DATA MUTATION = 0
PRODUCTION MUTATION = 0

KNOWN UPSTREAM ROLE-DUMP DIALECT GAP = CONFIRMED
SUPABASE CLI 2.109.1 ROLE DUMP = pg_dumpall --roles-only + Supabase filters + RESET ALL suffix
ACTUAL PRODUCT BACKUP ROLE DIALECT = PENDING LOCAL SANITIZED CLASSIFICATION

PPO-04M.5.3 = ACTIVE / REAL BACKUP ROLES DIALECT DIAGNOSTIC
REAL RESTORE ATTEMPT #4 = CLOSED / SAFE FAIL / NO SQL MUTATION
LOCAL SOURCE DIAGNOSTIC #4 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #5 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


## Local Restore Plan Diagnostic #1 — migration history dialect finding

Local Restore Plan Diagnostic #1 ejecutó el tooling inmutable
`6081250f9943837d278e449d4f9c3602534f9b0a` sobre la fuente local preservada
y confirmó el primer fallo interno de Real Restore Attempt #5. La fuente local,
el target desechable y su baseline alcanzaron PASS antes del finding. No se
ejecutó SQL ni hubo actividad remota o mutación del target o Production. Este
resultado no declara corrupción del backup.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #1 = FINDING / RESTORE_PLAN
TOOLING SHA = 6081250f9943837d278e449d4f9c3602534f9b0a
code = RECOVERY_MIGRATION_HISTORY_DATA_INVALID
localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS
PLAN_DIAGNOSTIC_EXIT_CODE = 1

SOURCE LOCAL VERIFY = PASS
TARGET START = PASS
TARGET BASELINE = PASS
ROLES AUDIT = PASSED BEFORE FAILURE
MANAGED SCHEMA AUDIT = PASSED BEFORE FAILURE
MIGRATION HISTORY DATA AUDIT = FINDING
RESTORE SQL = NOT EXECUTED

ATTEMPT #5 FIRST INTERNAL FAILURE = CONFIRMED / MIGRATION HISTORY DATA AUDIT
MANAGED SCHEMA FIRST-FAIL HYPOTHESIS = DISCARDED
MIGRATION-HISTORY DATA DIALECT GAP = CONFIRMED
```

La causa técnica confirmada es el wrapper data-only de Supabase CLI 2.109.1,
release commit upstream `6d4c19870ed213ba7f682f117d0345c8a40bfa94`.
`apps/cli-go/pkg/migration/scripts/dump_data.sh` produce
`database/migration-history-data.sql` mediante `supabase db dump --linked
--data-only --use-copy --schema supabase_migrations` y lo envuelve con
`SET session_replication_role = replica;` y un único `RESET ALL;` final. El
auditor admitía el prefix, pero no el suffix exacto.

La remediación admite `RESET ALL;` únicamente fuera de COPY, después del único
COPY esperado, una sola vez y al final lógico del artifact. Comments y líneas
vacías posteriores siguen siendo no significativos. El historial de migraciones
permanece `AUDIT_ONLY`; ni su schema ni sus datos se incorporan a
`restoreSql`. La comparación exacta entre las versiones capturadas y la
baseline 01–06 permanece intacta.

```text
SUPABASE CLI 2.109.1 DATA-DUMP WRAPPER =
SET session_replication_role = replica
...
RESET ALL

DIAGNOSTIC #1 AUDITOR GAP = RESET ALL suffix was not admitted
CURRENT AUDITOR GAP = NONE KNOWN / PENDING REAL BACKUP VERIFICATION
MIGRATION HISTORY DIALECT REMEDIATION = IMPLEMENTED / PENDING REAL BACKUP VERIFICATION

PPO-04M.5.3 = ACTIVE / MIGRATION HISTORY DIALECT REMEDIATION
LOCAL RESTORE PLAN DIAGNOSTIC #1 = CLOSED / FINDING CONFIRMED
LOCAL RESTORE PLAN DIAGNOSTIC #2 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```
