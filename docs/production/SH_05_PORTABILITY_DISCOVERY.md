# SH-05.0 — Descubrimiento de portabilidad y realineación de destino

**Estado:** CLOSED / APPROVED / PASS_PORTABILITY_DISCOVERY
**SH-05:** ACTIVE
**Workstream SH:** OPEN
**Baseline revisada:** 31c52b8ac2f9650709badbfaa215ff8e349ec2be

## Alcance y decisión vigente

Este informe es la evidencia canónica del descubrimiento SH-05.0. No ejecuta una reconstrucción clean-host, no prueba portabilidad, no despliega una VPS y no declara preparación productiva.

La máquina de Godel Diseño ya no es el destino operativo. La VPS de Hosting DC es el destino real seleccionado para PPO, pero no es una dependencia del software ni del runtime. El contrato permanente es **PROVIDER_NEUTRAL_CLEAN_LINUX_DOCKER_HOST**.

**DECISION:** para el primer proof, «compatible» incluye CPU. El helper de build de aplicación evidencia linux/amd64; por tanto el primer clean host debe ser Linux amd64. No existe evidencia de portabilidad ARM64 ni a una arquitectura Linux arbitraria.

## Lectura y estado de evidencia

| Etiqueta | Significado |
| --- | --- |
| **FACT OBSERVED IN REPOSITORY** | Hecho comprobado en fuentes, Compose o tooling existente. |
| **ARCHITECTURAL INTERPRETATION** | Consecuencia de diseño derivada del hecho. |
| **GAP** | Capacidad necesaria que no está demostrada o implementada para host limpio. |
| **DECISION** | Dirección aprobada para SH/PPO. |
| **DEFERRED IMPLEMENTATION** | Trabajo posterior que este informe no implementa. |

No se ejecutó proof de portabilidad, reconstrucción en host limpio ni despliegue VPS. No se deriva una afirmación de production readiness.

## Modelo de fuentes de reconstrucción

| Requisito | Clase | Estado documentado |
| --- | --- | --- |
| Revision Git exacta; aplicación Godel; Dockerfiles; Nginx; Compose raíz; overlay; migraciones; Function requerida | TRACKED_GIT | **FACT:** están versionados. |
| Autoridad/pin upstream y árbol vendor Supabase | TRACKED_GIT | Se recuperan por la revisión compatible. |
| Configuración pública, límites, URLs y demás configuración operativa no secreta | EXTERNAL_NON_SECRET_CONFIG | Requiere entrega explícita al target. |
| Configuración exclusiva de QA, cuando se requiera para acceptance | EXTERNAL_NON_SECRET_CONFIG | No es requisito del runtime productivo; puede incluir secretos QA aislados fuera de la fuente productiva. |
| Entradas secretas de runtime; registro, snapshots y puntero de generación externa | EXTERNAL_SECRET_GENERATION | Estado operacional protegido y no versionado. |
| Backup recovery-grade: PGDATA, dump lógico, Storage, sidecar xattr y provenance | RECOVERY_BACKUP | Contrato existente; sin transporte ni proof cross-host. |
| Material raíz pgsodium asociado al backup | PROTECTED_RECOVERY_MATERIAL | Custodia separada del archive de datos. |
| Linux amd64, Docker, Compose, filesystem y conectividad de adquisición | HOST_PREREQUISITE | Deben validarse antes de reconstruir. |
| Redes Compose, red compartida operator-owned, contenido version-coupled de db-config y directorios runtime | REGENERABLE_RUNTIME_STATE | Se recrean sin identidad Docker heredada. |
| Caches, tmpfs, writable layers, snippets Studio y Functions no trackeadas | NOT_REQUIRED | No son dependencia actual de Godel. |
| Dependencia activa no clasificada | UNKNOWN | No se identificó ninguna en el runtime actual. |

**DECISION — GIT RECONSTRUCTION: PASS.** Git contiene la aplicación, Dockerfiles, configuración Nginx, definiciones Compose, snapshot vendor de Supabase, overlay Godel, migraciones y la Function actualmente requerida. Git no es la fuente completa: entornos runtime, estado de generación externa, backups y material protegido quedan intencionalmente fuera de Git.

## Dependencias y prerrequisitos

| Clasificación | Resultado |
| --- | --- |
| PORTABLE | Compose, Nginx, Dockerfiles, topología de redes y árbol vendor versionado. |
| DEVELOPMENT_ONLY | Docker Desktop, WSL, LOCALAPPDATA, PowerShell, rutas Windows y localhost de desarrollo/E2E. |
| HISTORICAL_TEST_ONLY | Ensayos de actualización/rollback con tooling específico de la estación histórica. |
| PORTABLE_WITH_LINUX_REQUIREMENT | Usuarios/grupos Unix, tmpfs, bind mounts, ownership/modos, xattrs Storage y amd64 inicial. |
| MUST_GENERALIZE | Bootstrap clean-host, adquisición/verificación de imágenes, transporte protegido y target explícito de restore. |
| BLOCKING | Ninguno para este descubrimiento; las brechas bloquean el cierre de SH-05. |
| UNKNOWN | Ninguno identificado para el runtime actual. |

**FACT:** no se encontró dependencia operacional activa del runtime en Docker Desktop, WSL, letras Windows, LOCALAPPDATA o PowerShell. El tooling PowerShell/Windows retenido es desarrollo, preproducción o evidencia histórica; no se elimina en SH-05.0.

| Plano | Requisito actualmente evidenciado |
| --- | --- |
| **Target runtime / host** | Linux amd64 inicial, Docker Engine, Compose v2, disco, ownership/modos Unix, user.* xattrs, reloj sincronizado y DNS/conectividad operativa. |
| **Reconstrucción / operador** | Git, Node/npm donde ejecute tooling, tar para inspección de archives actual, BuildKit/Compose build-secret y docker buildx sólo si se reutiliza su helper. |
| **Adquisición** | Origen Git, registros de contenedores y npm, o mirror/cache equivalente aprobado. |

**ARCHITECTURAL INTERPRETATION:** tooling temporal de reconstrucción no se vuelve dependencia permanente del runtime. Un clean host no puede depender del cache Docker/npm del host fuente.

## Imágenes y configuración externa

**DECISION — IMAGE PORTABILITY: PARTIAL.** App y Nginx se construyen desde Dockerfiles trackeados y sus imágenes base están fijadas por digest. El bundle Supabase efectivo usa varias imágenes upstream por tag versionado, no una lista de digests propiedad del repositorio. Algunos helpers de recovery usan --pull=never, y no existe un procedimiento completo de adquisición e identidad para host limpio. El proof futuro no aceptará cache local accidental como fuente.

**DECISION — EXTERNAL CONFIG: MAPPED / CLEAN_HOST_READY = PARTIAL.** compose.env.local e infra/supabase/.env están ignorados deliberadamente. Cubren, sin registrar valores aquí, configuración pública build/runtime, server-only, secretos, configuración operativa no secreta y valores específicos del host cuando correspondan.

**GAP:** falta un delivery seguro y explícito hacia host limpio. **DEFERRED IMPLEMENTATION:** SH-05 posterior lo define y prueba sin exponer ni copiar secretos dentro de SH-05.0.

## Generación externa, backup y restore

**DECISION — SECRET GENERATION CLEAN-HOST READY: PARTIAL.** El registro de generación externa vive como estado operacional protegido. La interfaz actual ofrece status/bootstrap, no export/import clean-host aprobado. La identidad permanente es el **external secret generation ID** y se conserva NO_IMPLICIT_ROLLBACK_CHAIN.

**GAP:** falta contrato de transferencia/importación protegida cross-host. **DEFERRED IMPLEMENTATION:** SH-05 posterior lo diseña e implementa sin inventar un mecanismo ni documentar snapshots en este informe.

**DECISION — BACKUP CLEAN-HOST READY: PARTIAL.** El backup recovery-grade cubre PGDATA físico, dump lógico, bytes Storage, sidecar xattr, provenance, asociación a generación externa y material pgsodium protegido. SAME-HOST RESTORE PROOF no equivale a CLEAN-HOST RESTORE PROOF. No se ejecutó transporte ni reconstrucción cross-host. SH-04 conserva íntegra su evidencia same-host.

**DECISION — RESTORE STRATEGY: GENERALIZE_WITH_NEW_EXPLICIT_TARGET.** El executor actual conserva --target current-selfhosted-qa y --confirm-destructive-qa-restore para el contrato técnico same-host. No se autoriza restore productivo general; PPO-06 conserva esa autoridad.

**FACT:** el executor resuelve contenedores Compose existentes, inspecciona sus mounts, espera targets PGDATA/Storage y volumen db-config, valida imágenes actuales y usa helpers --pull=never; no puede restaurar directamente un host vacío. **DEFERRED IMPLEMENTATION:** target explícito de rehearsal clean-host, bootstrap y adquisición previos, sin debilitar el guard same-host.

**DECISION — DB-CONFIG CLEAN-HOST READY: PARTIAL.** No se restaura un db-config histórico completo: se crea volumen compatible fresco, se reproduce contenido version-coupled y se restaura únicamente el material raíz pgsodium protegido. El gap es bootstrapear volumen e imagen compatibles antes de las suposiciones same-host.

Storage es una única unidad de consistencia: bytes Storage × metadata PostgreSQL × sidecar xattrs × ownership/modos × directorios. El filesystem debe soportar user.* xattrs. No se declara portabilidad hasta que el rehearsal pruebe replay y acceso funcional.

## Redes, volúmenes y host limpio

**FACT:** el perfil efectivo cierra publicación de puertos de api-gw y Supavisor, no publica PostgreSQL y une api-gw a la red externa operator-owned godel-supabase-api con alias api-gw. App y Nginx también la consumen. Las redes privadas las recrea Compose. El contrato mínimo compartido es inspeccionar y crear sólo si está ausente; los IDs Docker no son identidad.

| Estado | Clasificación |
| --- | --- |
| PGDATA bind-backed | RESTORE_DATA |
| Storage bind-backed | RESTORE_DATA |
| db-config named volume | RECREATE_AND_RESTORE_PROTECTED_MATERIAL |
| deno-cache | CACHE |
| Caches, tmpfs y writable layers | NOT_REQUIRED |
| Redes privadas y compartida | RECREATE_EMPTY |

Un target SH-05 es **CLEAN** sólo si inicia sin contenedores, volúmenes, redes, PGDATA, Storage, entornos runtime, registro de generación externa, estado Godel, imágenes no reproducibles ni estado copiado no documentado del host fuente. Puede contener prerrequisitos genéricos. En Modelo A debe usar daemon Docker y filesystem independientes: otro Compose project sobre el daemon fuente no es evidencia válida.

## Evidencia futura y QA funcional

Antes de reconstruir se probará ausencia segura de estado Godel/Supabase. Durante la ejecución cada objeto se asociará a fuente aprobada. Después se verificará revisión Git, imágenes, redes, volúmenes, datos, alineación de generación, salud y comportamiento funcional. «Contenedores iniciaron» no es aceptación.

**DECISION — Godel functional validation: PARTIAL.** El wrapper E2E self-hosted fija localhost, aunque Playwright admite PLAYWRIGHT_BASE_URL. Las suites SH-03 son reutilizables, pero runner placement/base URL deben decidirse antes del drill. La preferencia es runner QA externo contra el clean-host, sin forzar Playwright/browser como dependencia del host desplegado salvo evidencia posterior.

## Modelo de host y frontera PPO

**DECISION — TARGET HOST MODEL: A_SEPARATE_DISPOSABLE.** Aporta evidencia más fuerte, cero estado claro, daemon/filesystem independientes, rehearsal destructivo seguro, separación de producción y reprovisionamiento fácil. Modelo B se evaluó y no se seleccionó. La VPS Hosting DC sigue siendo destino futuro de PPO; SH-05 no despliega producción allí.

SH-05 = CLEAN-HOST PORTABILITY PROOF
PPO-04 = AUTHORIZED REAL DEPLOYMENT TO SELECTED VPS

SH-05 no se convierte en despliegue productivo y PPO-04 no sustituye el proof.

## Realineación PPO y siguiente descomposición

| Bloque | Estado y responsabilidad |
| --- | --- |
| PPO-01C | SUPERSEDED / NOT EXECUTED; auditoría company-host histórica. |
| PPO-01D | SUPERSEDED / NOT EXECUTED; veredicto company-host histórico. |
| PPO-01E | NOT STARTED / PENDING; readiness VPS/Linux Docker host provider-neutral. |
| PPO-01F | NOT STARTED / PENDING; veredicto y gate PPO-04. |
| PPO-04 | PENDING; despliegue operativo privado al VPS seleccionado tras SH cerrado y PPO-01F aprobado. |
| PPO-05 | Gate de seguridad/exposición pública. |
| PPO-06 | Scheduling, retención, destino off-host, DR productivo y RPO/RTO cuando se definan. |
| PPO-07 | Monitorización, logs, métricas, alertas y soporte/escalation. |
| PPO-10 | DEFERRED_OPTIONAL_FUTURE_PROVIDER_MIGRATION. |

No se presuponen distribución Linux, recursos, IP, firewall, panel de proveedor, DNS, TLS ni producto de backup. Cloudflare Tunnel y company-host quedan como referencias históricas donde correspondan, no como requisitos actuales.

| Subbloque SH-05 | Estado |
| --- | --- |
| SH-05.0 — Discovery and target realignment | CLOSED / APPROVED / PASS_PORTABILITY_DISCOVERY |
| SH-05.1 — Clean-host portability contract and tooling design | READY / NEXT / NOT STARTED |
| SH-05.2 — Minimal clean-host portability tooling | NOT STARTED |
| SH-05.3 — Disposable clean-host reconstruction rehearsal | NOT STARTED |
| SH-05.4 — Functional acceptance, cleanup, documentation and SH closure | NOT STARTED |

SH sigue abierto. No se implementó tooling de portabilidad, no se ejecutó rehearsal, no se desplegó VPS y no hubo mutación de producción.
