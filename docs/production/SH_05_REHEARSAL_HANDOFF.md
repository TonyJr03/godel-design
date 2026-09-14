# SH-05 — Handoff del rehearsal clean-host

**Fecha de corte:** 2026-09-13

**Estado SH-05:** `PAUSED / NON-BLOCKING HARDENING`

**SH-05.3:** `PARTIALLY PROVEN / DEFERRED`

**SH-05.4:** `DEFERRED`

## Decisión de gobernanza

SH-05 no está cerrado ni aprobado en su totalidad. La evidencia real obtenida
demuestra una parte importante de la portabilidad cross-host, pero no completa
el build de Godel en el host objetivo ni la aceptación funcional final. El
trabajo restante se conserva como endurecimiento post-piloto y deja de ser un
prerrequisito para iniciar PPO-04 / Production Pilot V1.

Este informe separa deliberadamente tooling implementado, prueba empírica y
trabajo diferido. R7 es evidencia histórica sanitizada de rehearsal; no es una
configuración productiva ni una generación que pueda reutilizarse como tal.

## 1. IMPLEMENTED TOOLING

### Groundwork cerrado

| Bloque | Estado aprobado |
| --- | --- |
| SH-05.0 | `CLOSED / APPROVED / PASS_PORTABILITY_DISCOVERY` |
| SH-05.1 | `CLOSED / APPROVED` |
| SH-05.2 | `CLOSED / APPROVED / PASS_MINIMAL_CLEAN_HOST_PORTABILITY_TOOLING` |

Se preservan sin reescribir los subbloques aprobados de SH-05.2:

| Subbloque | Estado aprobado |
| --- | --- |
| SH-05.2A | `CLOSED / APPROVED / PASS_CANONICAL_SECURITY_AUDIT_REALIGNMENT` |
| SH-05.2B | `CLOSED / APPROVED / PASS_PULL_ONLY_IMAGE_AUTHORITY` |
| SH-05.2C | `CLOSED / APPROVED / PASS_RECONSTRUCTION_MANIFEST_BINDING` |
| SH-05.2D | `CLOSED / APPROVED / PASS_PROTECTED_EXACT_GENERATION_TRANSPORT` |
| SH-05.2E | `CLOSED / APPROVED / PASS_CLEAN_HOST_IDENTITY_EMPTY_STATE_GATE` |
| SH-05.2F | `CLOSED / APPROVED / PASS_IMMUTABLE_PULL_ONLY_IMAGE_ACQUISITION` |
| SH-05.2G | `CLOSED / APPROVED / PASS_VERIFIED_GODEL_IMAGE_BUILD` |
| SH-05.2H | `CLOSED / APPROVED / PASS_TRANSPORTED_RECONSTRUCTION_INPUT_ADMISSION` |
| SH-05.2I | `CLOSED / APPROVED / PASS_CLEAN_HOST_TARGET_BOOTSTRAP_FOUNDATION` |
| SH-05.2J | `CLOSED / APPROVED / PASS_EXACT_TARGET_GENERATION_ACTIVATION` |
| SH-05.2K | `CLOSED / APPROVED / PASS_CLEAN_HOST_OFFLINE_RECOVERY_DATA_MATERIALIZATION` |
| SH-05.2L | `CLOSED / APPROVED / PASS_CLEAN_HOST_RUNTIME_RECONSTRUCTION` |

Estos estados prueban que el tooling y sus contratos fueron implementados y
aprobados. Por sí solos no afirman que cada paso terminara en un host real.

## 2. REAL CROSS-HOST PROOF

### Conjunto de reconstrucción R7 aceptado

La última selección aceptada se conserva como evidencia histórica sanitizada:

```text
gitCommit = d8f5f63f72f9e93e75bb51986cd9fffc0323633e
backupId = 20260908T180030Z-43e99630
backupSourceGitCommit = c684009e0b1ebd44d7944eb2b98d6a627e4770f8
externalGenerationId = 63d9bbf1-02b7-4b6b-9fe3-e201f26d4da2
imageLockSchema = 3
logicalAuthorities = 16
physicalImages = 13
operationId = ff2d7dd1-672d-4b37-8d89-788eb6f2f9b2
manifestSha256 = 535ba870384e0998e2ba8f9ca28eb34a64a6751f6df5f3f92f5a5d42c36e887b
```

No se registran valores secretos, snapshots de entorno ni material protegido.

### Evidencia empírica en Ubuntu desechable

| Comprobación real | Resultado |
| --- | --- |
| Exact checkout | `PASS` |
| Linux clean-host tests | `PASS` |
| Transported input admission | `PASS` |
| Clean-host gate antes del import | `PASS` |
| R7 offline image transport | `PASS` |
| Offline import | `PASS` |
| Logical authorities | `16` |
| Unique images | `13` |
| Verified images | `13` |
| Registry access | `NOT_REQUIRED` |
| Node local OCI authority | `PASS` |
| Nginx local OCI authority | `PASS` |
| Clean-host gate después del import de imágenes | `PASS` |
| Contexto nombrado local de Buildx usando la base Node importada | `PASS` |

Identidades exactas de los manifiestos hijo `linux/amd64` usados como bases de
build:

```text
Node  = sha256:9a81c173b244297fb9c8aabf38234786adbd3e698240dbb00cc241a2cc085cc8
Nginx = sha256:10bf30f80ce9af183b2db50a91ea59cea5eb5e4106820656bac8cd369ed14904
```

La prueba real demuestra admisión, transporte e import offline, autoridad OCI
local y resolución de la base Node por un contexto nombrado de Buildx. No
demuestra el build completo de App/Nginx ni la aceptación funcional completa.

## 3. DEFERRED WORK

### A. Frontend Dockerfile externo

Los Dockerfiles usan `# syntax=docker/dockerfile:1.7`. En el host objetivo, la
resolución de `docker.io/docker/dockerfile:1.7` devolvió 403. El override intentado
`BUILDKIT_SYNTAX=dockerfile.v0` hizo que BuildKit/Buildx intentara resolver
`docker.io/library/dockerfile.v0:latest`, que también devolvió 403.

```text
target-side fully Docker-Hub-independent build frontend = NOT PROVEN
```

Queda diferido evaluar un frontend incluido, pretransportado o equivalente que
mantenga el build fail-closed sin requerir resolución externa en el target.

### B. Autoridad exacta del Dockerfile

El builder crea un contexto exacto mediante `git archive`, pero actualmente
invoca Buildx con `--file Dockerfile` y `--file Dockerfile.nginx` mientras el
proceso Docker se ejecuta con el root del repositorio como directorio de
trabajo. Por ello, los bytes verificados dentro del contexto Git exacto no
quedan ligados explícitamente al archivo que recibe Buildx.

Invariante futuro deseado:

```text
verified Dockerfile bytes == Dockerfile bytes actually passed to Buildx
```

Es un defecto de endurecimiento. No se corrige en este handoff.

### C. Diagnóstico sin frontend externo y build inconcluso

Un diagnóstico usó el Dockerfile del `git archive` exacto y retiró únicamente
la directiva `# syntax=`. El build avanzó por:

```text
Dockerfile load
local Node named context resolution
base stage
COPY package.json package-lock.json
RUN npm ci
```

No hubo resolución del registry para el frontend antes de `npm ci`. El proceso
`npm ci` permaneció ejecutándose aproximadamente cuatro horas sin completar y
la investigación se detuvo de forma intencional. Esa observación no prueba que
el registry de npm esté roto.

```text
clean-host target-side Godel build = DEFERRED
production impact = NON-BLOCKING
reason = production release images will be built outside the production VPS
```

### D. Aceptación pendiente

SH-05.3 queda `PARTIALLY PROVEN / DEFERRED`: la prueba real anterior es válida,
pero falta terminar el build target-side y el recorrido completo del rehearsal.
SH-05.4 queda `DEFERRED`: no se completaron la aceptación funcional/Playwright,
la limpieza final ni el cierre agregado de SH.

Los cuatro frentes están registrados en
[Deuda técnica activa](../development/TECH_DEBT.md) como `post-pilot hardening`.

## Resultado y siguiente iniciativa

```text
SH-01 = CLOSED / APPROVED
SH-02 = CLOSED / APPROVED
SH-03 = CLOSED / APPROVED
SH-04 = CLOSED / APPROVED
SH-05 = PAUSED / NON-BLOCKING HARDENING

SH-05.3 = PARTIALLY PROVEN / DEFERRED
SH-05.4 = DEFERRED

NEXT = PPO-04 / PRODUCTION PILOT V1
```

El plan gobernante siguiente es
[PPO-04 — Production Pilot V1](PPO_04_PRODUCTION_PILOT_PLAN.md).
