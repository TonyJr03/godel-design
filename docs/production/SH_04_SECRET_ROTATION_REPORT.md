# SH-04.3D — Rotación segura de secretos y continuidad de recovery

Estado: `IN PROGRESS` — arquitectura D.0 auditada y tooling D.1 implementado;
no se ha rotado ningún secreto ni se ha cambiado el runtime QA.

Este documento es la autoridad operativa para SH-04.3D. Complementa el
[informe general SH-04.3](SH_04_SECRETS_AUTH_REPORT.md), que conserva el
contrato de configuración y Auth.

## Alcance y límites

La fase cubre el diseño de rotación, la custodia local de generaciones externas
y su vínculo con backup/restore. No autoriza generar valores productivos,
editar `infra/supabase/.env`, `compose.env.local` o `.env.qa.local`, reiniciar
servicios, modificar base de datos, usuarios o Storage, ni ejecutar restores.

Los valores se generan y se custodian fuera de Git. Los snapshots de esta fase
contienen secretos y deben permanecer en
`protected-recovery-material/selfhosted/external-secrets/`, que no se imprime,
sube ni se trata como artefacto de documentación.

## Resultado de auditoría D.0

La rotación se clasifica por impacto, no por el nombre de la variable:

| Grupo | Variables o material | Continuidad y decisión |
| --- | --- | --- |
| Credenciales de base | `POSTGRES_PASSWORD` y roles dependientes | Requiere procedimiento específico de roles/Supavisor; el helper upstream actual no es seguro para ejecutar. |
| Firma y sesiones | `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, JWT HS256/JWKS | Cambiar HS invalida sesiones; el JWKS ES256 permite adición controlada de clave sin retirar verificación legacy. |
| API keys opacas | `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | El upstream acepta un valor activo; publishable requiere rebuild de la imagen Godel y secret exige recrear el runtime server-only. |
| Cifrado con estado | `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, raíz pgsodium | No tienen rotación live aprobada. Hay estado cifrado de Realtime y Supavisor; no se cambian sin drill y procedimiento dedicado. |
| Aplicación/servicios | `SECRET_KEY_BASE`, Dashboard | Tiene consumidores Realtime/Supavisor y debe coordinarse con su reinicio. |
| Opcionales inertes | SMTP, S3, Logflare, MinIO, OpenAI | No forman parte del runtime actual; no se generan ni rotan en D.1. |

El orden de dependencia auditado para Auth asimétrico es: validar los
verificadores (`rest`, `realtime`, `storage`, `functions`), recrearlos y solo
después Auth. La recuperación debe conservar el bundle `JWT_KEYS`, `JWT_JWKS`,
`ANON_KEY_ASYMMETRIC` y `SERVICE_ROLE_KEY_ASYMMETRIC` cuando esté activo.

Los bloqueadores para una rotación real siguen abiertos: el helper upstream de
contraseña imprime material y elimina el schema `_supavisor`; Supavisor mantiene
estado cifrado; y no existe una rotación live aprobada para las claves de
cifrado con estado. Ninguno se resuelve con D.1.

## Clasificación durable D.0

| Clase | Significado operativo |
| --- | --- |
| A — `INDEPENDENT_ROTATABLE` | Material sin estado persistente que puede cambiarse mediante un procedimiento aislado aprobado. |
| B — `COUPLED_ROTATION_SET` | Material que debe cambiar coordinadamente con otros valores o consumidores. |
| C — `SESSION_INVALIDATING` | Cambio que invalida sesiones o tokens existentes. |
| D — `DATABASE_CREDENTIAL_ROTATION` | Credencial de PostgreSQL y roles; exige coordinación DB/Supavisor. |
| E — `STATE_ENCRYPTION_KEY` | Clave que protege estado persistente; no se cambia live sin migración y drill probado. |
| F — `INSTALLATION_ROOT_KEY` | Raíz de instalación que no se rota live durante SH-04.3D. |
| G — `OPTIONAL_UNUSED` | Configuración opcional no consumida por el perfil actual; no se genera ni rota. |

## Matriz completa de rotación

| Material | Consumers | Clase | Acoplado con | Estado persistente / sesiones | Producción nueva | Rotación live | QA / rebuild / servicios | Backup y retención | Recomendación |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL y roles | D | Roles DB, Supavisor | Credenciales DB y estado Supavisor | Sí | No aprobada | Drill DB; DB y Supavisor | Antes; recovery | D.5, preservar `_supavisor`. |
| `JWT_SECRET` | Auth y verificadores legacy | C | `ANON_KEY`, `SERVICE_ROLE_KEY`, JWKS legacy | Invalida HS256 | Sí | Solo plan coordinado | Login, API y todos verificadores | Antes; conservar generación | D.4A. |
| `ANON_KEY` | API gateway / clientes | B,C | `JWT_SECRET`, API key wiring | Token legacy | Sí | Solo plan coordinado | Gateway y consumidores | Antes; conservar generación | D.4A. |
| `SERVICE_ROLE_KEY` | Servicios internos legacy | B,C | `JWT_SECRET`, API key wiring | Token legacy | Sí | Solo plan coordinado | Gateway, Auth admin | Antes; conservar generación | D.4A. |
| `SUPABASE_PUBLISHABLE_KEY` | Cliente Godel / Envoy | B | Opaque key translation | Sin estado DB; build-time público | Sí | No simultánea | Rebuild Godel; app y nginx | Antes; rollback generation | D.3. |
| `SUPABASE_SECRET_KEY` | Adaptador Auth Admin server-only / Envoy | B | Opaque key translation | Sin estado DB | Sí | No simultánea | Recreate app; Auth Admin smoke | Antes; rollback generation | D.3, nunca al cliente. |
| `JWT_KEYS` | Auth firma ES256 | B | `JWT_JWKS` | Mantiene firma ES256 | Sí | Adición controlada | Auth después de verificadores | Antes; retener hasta recovery | D.4B. |
| `JWT_JWKS` | Rest, Realtime, Storage, Functions | B | `JWT_KEYS` | Verificación de sesiones | Sí | Adición controlada | Verificadores antes de Auth | Antes; retener hasta recovery | D.4B. |
| `ANON_KEY_ASYMMETRIC` | Envoy translation | B | `JWT_JWKS`, opaque keys | Token de traducción | Sí | Coordinada | Gateway y verificadores | Antes; retener generación | D.4B/D.3 según plan. |
| `SERVICE_ROLE_KEY_ASYMMETRIC` | Envoy/Auth Admin translation | B | `JWT_JWKS`, opaque keys | Token de traducción | Sí | Coordinada | Gateway, Auth Admin smoke | Antes; retener generación | D.4B/D.3 según plan. |
| `DASHBOARD_PASSWORD` | Studio | A | Ninguno | No afecta Godel/Auth | Sí | Procedimiento aislado | Studio smoke; Studio | No crítico para datos; conservar rollback | D.2. |
| `SECRET_KEY_BASE` | Realtime y Supavisor | B | Realtime/Supavisor | Cookies/estado de esos servicios | Sí | Coordinada | Recreate ambos servicios | Antes; rollback generation | Cambiar juntos; no familia Auth. |
| `REALTIME_DB_ENC_KEY` | Realtime | E | Estado Realtime | Sí, cifrado | Sí | No en SH-04.3D | Drill de migración; Realtime | Backup obligatorio; recovery largo | Fresh unique; congelada live. |
| `VAULT_ENC_KEY` | Supavisor/Vault | E | Estado Supavisor | Sí, cifrado | Sí | No en SH-04.3D | Drill de migración; Supavisor | Backup obligatorio; recovery largo | Fresh unique; congelada live. |
| `PG_META_CRYPTO_KEY` | Postgres Meta / futuros vault-FDW | E | Estado futuro | No probado actualmente; potencial | Sí | No sin migración probada | Drill explícito; Meta | Backup obligatorio | Fresh unique; no live. |
| `pgsodium_root.key` | PostgreSQL pgsodium | F | Instalación DB | Raíz persistente | Única por instalación | No en SH-04.3D | Restore drill; DB | Artefacto protegido; retención recovery | Nunca rotar live en D. |
| Familia SMTP | Auth SMTP | G | Proveedor externo | Inerte actualmente | Solo si producto lo aprueba | Fuera de D.1 | Smoke proveedor futuro | No aplica mientras inerte | No generar. |
| Credenciales protocolo S3 | Storage S3 | G | Backend Storage | Storage actual FILE | Solo si se adopta S3 | Fuera de D.1 | Migración Storage futura | Backup antes de cambio backend | No generar. |
| Credenciales Logflare | Logflare | G | Observabilidad opcional | Inerte | Solo si se adopta | Fuera de D.1 | Prueba de ingestión futura | Política futura | No generar. |
| Credenciales MinIO | MinIO | G | Backend opcional | Inerte | Solo si se adopta | Fuera de D.1 | Migración Storage futura | Política futura | No generar. |
| `OPENAI_API_KEY` | Studio AI opcional | G | Studio AI | Inerte | Solo si se adopta | Fuera de D.1 | Smoke funcional futuro | Política futura | No generar. |

### Campos operativos obligatorios de la matriz

| Material | Consumers | Primary class | Coupled with | Persistent-state impact | Session impact | Fresh production unique | Live rotation | QA proof required | App rebuild | Services affected | Backup before rotation | Historical-secret retention | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | DB/roles | D | Supavisor | Sí | No | Sí | No | DB+Supavisor drill | No | db,supavisor | Sí | Recovery | D.5 only |
| `JWT_SECRET` | Auth/legacy verifiers | C | anon/service keys | No | HS256 invalidated | Sí | Plan only | login+API | No | auth,verifiers | Sí | Recovery | D.4A |
| `ANON_KEY` | gateway/clients | C | JWT secret | No | legacy token | Sí | Plan only | gateway | No | api-gw | Sí | Recovery | D.4A |
| `SERVICE_ROLE_KEY` | internal legacy | C | JWT secret | No | legacy token | Sí | Plan only | Admin Auth | No | api-gw,auth | Sí | Recovery | D.4A |
| `SUPABASE_PUBLISHABLE_KEY` | Godel/Envoy | B | opaque translation | No | No | Sí | No overlap | client+gateway | Sí | app,nginx,api-gw | Sí | Rollback | D.3 |
| `SUPABASE_SECRET_KEY` | Auth Admin/Envoy | B | opaque translation | No | No | Sí | No overlap | Admin Auth | No | app,api-gw | Sí | Rollback | D.3 |
| `JWT_KEYS` | Auth signer | B | JWT_JWKS | No | ES256 continuity | Sí | Add-first | issue/verify token | No | auth | Sí | Recovery | D.4B |
| `JWT_JWKS` | verifiers | B | JWT_KEYS | No | ES256 continuity | Sí | Add-first | verify token | No | rest,realtime,storage,functions | Sí | Recovery | D.4B |
| `ANON_KEY_ASYMMETRIC` | Envoy | B | JWKS/opaque | No | translation token | Sí | Coordinated | gateway API | No | api-gw | Sí | Recovery | D.3/D.4B |
| `SERVICE_ROLE_KEY_ASYMMETRIC` | Envoy/Auth Admin | B | JWKS/opaque | No | translation token | Sí | Coordinated | Admin Auth | No | api-gw,app | Sí | Recovery | D.3/D.4B |
| `DASHBOARD_PASSWORD` | Studio | A | none | No | No | Sí | Isolated | Studio login | No | studio | Recommended | Rollback | D.2 |
| `SECRET_KEY_BASE` | Realtime/Supavisor | B | both services | Yes | service cookies | Sí | Coordinated | service smoke | No | realtime,supavisor | Sí | Rollback | together |
| `REALTIME_DB_ENC_KEY` | Realtime | E | encrypted state | Sí | No | Sí | No | migration drill | No | realtime | Sí | Recovery | frozen |
| `VAULT_ENC_KEY` | Supavisor/Vault | E | encrypted state | Sí | No | Sí | No | migration drill | No | supavisor | Sí | Recovery | frozen |
| `PG_META_CRYPTO_KEY` | Meta | E | future vault/FDW | Potential | No | Sí | No | proven migration | No | meta | Sí | Recovery | frozen |
| `pgsodium_root.key` | DB pgsodium | F | installation | Sí | No | unique install | No | restore drill | No | db | Sí | Recovery | frozen |
| SMTP family | Auth SMTP | G | provider | No | No | if enabled | N/A | provider smoke | No | auth | N/A | N/A | unused |
| S3 protocol credentials | Storage S3 | G | backend | FILE now | No | if enabled | N/A | Storage migration | No | storage | before backend change | future policy | unused |
| Logflare credentials | Logflare | G | observability | No | No | if enabled | N/A | ingest smoke | No | log service | N/A | future policy | unused |
| MinIO credentials | MinIO | G | backend | No | No | if enabled | N/A | Storage migration | No | storage | before backend change | future policy | unused |
| `OPENAI_API_KEY` | Studio AI | G | Studio AI | No | No | if enabled | N/A | AI smoke | No | studio | N/A | future policy | unused |

## Decisiones congeladas y blocker DB

- `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY` y `PG_META_CRYPTO_KEY` deben ser
  únicos para producción; no tienen rotación live autorizada en SH-04.3D. El
  último no puede cambiar sin una migración probada.
- `pgsodium_root.key` es una raíz de instalación: no se rota live en
  SH-04.3D.
- `SECRET_KEY_BASE` es independiente de las familias Auth, pero Realtime y
  Supavisor deben actualizarse y recrearse juntos.
- `infra/supabase/utils/db-passwd.sh` está **NOT AUTHORIZED**: imprime la
  contraseña generada, altera múltiples roles y ejecuta `DROP SCHEMA
  _supavisor CASCADE`. QA mantiene estado cifrado persistente de Supavisor; D.5
  deberá preservarlo.

## Descomposición de SH-04.3D

| Fase | Alcance | Estado |
| --- | --- | --- |
| D.0 | Auditoría de arquitectura y seguridad | CLOSED / APPROVED |
| D.1 | Tooling seguro y modelo de generación/recovery | IN PROGRESS, pendiente de revisión arquitectónica |
| D.2 | Generación cero y rotación Dashboard | Pendiente |
| D.3 | Opaque API keys y rebuild Godel | Pendiente |
| D.4A | Rotación legacy `JWT_SECRET` / anon / service-role | Pendiente |
| D.4B | Rotación de claves EC de firma | Pendiente |
| D.5 | Rotación segura de contraseña PostgreSQL | Pendiente |
| D.6 | Aceptación final de rotación/recovery | Pendiente |

## Retención y semántica de asociación

La **retención de rollback** conserva temporalmente la generación previa para
revertir una rotación fallida. La **retención de recovery** conserva una
generación mientras exista cualquier backup que la referencie. El vencimiento
del rollback no autoriza borrar una generación requerida por un backup
retenido. PPO-06 definirá la política final off-host y de retención.

`externalSecretGenerationId` es metadato de asociación local: no es firma,
HMAC, autenticación ni evidencia de integridad criptográfica, y no se deriva de
secretos. La comparación exacta de bytes vincula estado local; no aporta por sí
misma autenticidad frente a una alteración maliciosa.

## Registro externo de generaciones

El registro no guarda hashes ni valores en metadata. Su forma es:

```text
protected-recovery-material/selfhosted/external-secrets/
  current.json
  generations/<UUID>/
    metadata.json
    supabase.env
    godel.env
```

`metadata.json` usa el formato `godel-external-secret-generation`, schema 1,
un UUID canónico, timestamp, commit del repositorio, razón finita y, cuando
aplique, la generación fuente. Solo enumera los nombres de snapshots. Los
snapshots son copias byte a byte exclusivamente de `infra/supabase/.env` y
`compose.env.local`; `.env.qa.local` está fuera del registro.

El directorio y los snapshots se crean solicitando permisos POSIX restrictivos
(`0700` y `0600`) y con `umask 077`. En Windows esos bits no equivalen a ACLs:
el operador debe asegurar ACL equivalente y que el directorio protegido no se
sincronice ni comparta. El tooling rechaza symlinks, archivos no regulares,
rutas inseguras y generaciones inesperadas.

## Herramienta D.1

`manage-secret-generations.mjs` no genera secretos y no modifica entornos. Sus
dos operaciones son:

```text
npm run ops:secrets:generation:status
npm run ops:secrets:generation:bootstrap -- --apply
```

`status` es read-only. Un registro ausente informa `UNINITIALIZED PASS`; uno
inicializado verifica el puntero, metadata, snapshots y reporta solamente
`MATCH` o `MISMATCH` contra los dos env activos, sin valores ni hashes.

`bootstrap` sin `--apply` es dry-run. Con `--apply`, que no se ejecuta durante
D.1, solo puede inicializar un registro vacío: crea una generación staging,
publica por rename atómico y después publica el puntero. Si falla, limpia lo
que haya creado y no sobrescribe generaciones existentes.

El módulo interno incluye un escritor de env allowlistado para una fase futura:
rechaza claves duplicadas y valores por CLI, conserva líneas no relacionadas y
reemplaza de forma atómica. D.1 no lo invoca sobre ningún archivo real.

## Vínculo de backup y restore

Los manifests permanecen en schema 3. Si el registro no existe, un backup nuevo
no añade campo alguno. Si está inicializado y los dos env activos coinciden
exactamente con la generación actual, el create añade opcionalmente
`externalSecretGenerationId`.

La verificación de un manifest legacy sin ese campo sigue siendo compatible. Si
lo incluye, valida UUID y, cuando el registro local está disponible, exige que
la generación referenciada exista. Restore trata un manifest sin identificador
como legacy; con identificador exige, antes de armar una operación destructiva,
que esa generación sea además la activa en `current.json` y que ambos env
activos coincidan byte a byte con sus snapshots. Restore repite esta validación
después de adquirir su lock y revalidar los backups, antes de detener servicios.
No cambia automáticamente los env.

## Próximos gates

1. Definir y aprobar por separado el runbook para PostgreSQL/Supavisor y las
   claves de cifrado con estado, incluyendo backup/restore drill.
2. Generar material real únicamente fuera del repositorio y bajo autorización
   operativa explícita.
3. Ejecutar una rotación por grupos, verificando consumidores, health y
   recovery antes de retirar la generación anterior.
4. Documentar evidencia sanitizada y completar SH-04.3E/F.
