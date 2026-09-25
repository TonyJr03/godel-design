# PPO-04M.5.3 — Restore Drill + Baseline Closure Architecture Audit

**Estado:** `ACTIVE / RESTORE DRILL ARCHITECTURE AUDIT`

**Fecha:** 2026-09-25

**Resultado del audit:** `ARCHITECTURE DEFINED / IMPLEMENTATION NOT STARTED`

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

Este pase sólo audita y diseña el restore. No descarga el backup, no usa la
identity privada, no descifra, no crea un target y no ejecuta SQL. Tampoco
contacta Production, Supabase Managed ni R2.

```text
PRODUCTION RESTORE = NOT AUTHORIZED
RESTORE TARGET = NOT YET CREATED
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

### PPO-04M.5.3B — Isolated local target + restore tooling

- extraer target factory de M.5.1;
- project ID/ports únicos y no-linked proof;
- bootstrap desde `productionRuntimeSha`/baseline exacta;
- SQL artifact admission y data-only restore transaccional;
- Auth/Storage pre/post gates, incluyendo Storage vacío;
- cleanup y failure injection tests.

### PPO-04M.5.3C — Real backup restore drill

Requiere autorización one-shot separada. Descarga desde R2, usa la identity
externa bajo control del operador y restaura sólo al target local desechable.
No usa Production ni Supabase Managed como target y no modifica R2.

### PPO-04M.5.3D — Validation + baseline closure

- comparación completa contra manifest/inventarios;
- login real interno;
- cleanup verificado;
- reporte sanitizado;
- decisión explícita sobre los gaps `IMPORTANT AFTER PILOT`;
- cierre de M.5 sólo si no quedan blockers.

## 17. Estado final del audit

```text
PPO-04M.5.2 =
CLOSED / FIRST PRODUCTION BACKUP + EXTERNAL CUSTODY VERIFIED

PPO-04M.5.3 =
ACTIVE / RESTORE DRILL ARCHITECTURE AUDIT

PRODUCTION RESTORE =
NOT AUTHORIZED

RESTORE TARGET =
NOT YET CREATED

REMOTE ACTIVITY DURING AUDIT =
0
```
