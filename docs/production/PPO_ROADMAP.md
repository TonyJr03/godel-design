# PPO — Preproducción y Puesta en Operación

## Metadatos

- Actualización de estado: 2026-09-21

- Proyecto: Godel Diseño
- Estado: Activo
- Fecha de creación: 2026-07-21
- Última revisión: 2026-09-21
- Responsable técnico: Dirección Técnica de Godel Diseño
- Arquitectura y supervisión: Arquitectura Senior / Orquestación Técnica
- Implementación: Agente Codex en VS Code

## Propósito

PPO lleva el sistema desde el MVP interno funcional hasta una operación real
controlada, segura, reproducible, recuperable, observable y validada por
usuarios.

La iniciativa diferencia ahora tres momentos operativos:

1. Preparación y validación en desarrollo/preproducción.
2. Managed Free Production Pilot sobre Vercel Hobby y Supabase Managed Free.
3. Investigación Lightweight Self-Hosted posterior, alimentada por medidas
   reales del piloto.

## 2026-09-16 — Architectural / Economic Hosting Pivot

La ruta anterior era:

```text
VPS + full Supabase Self-Hosted
```

Su estado es:

```text
SUPERSEDED FOR CURRENT PRODUCTION PILOT
NOT EXECUTED
```

El pivot responde a viabilidad económica y al presupuesto actual de un proyecto
personal/no comercial. No declara un fallo técnico de Supabase Self-Hosted ni
reescribe las aprobaciones SH-01–SH-04. El cierre/handoff vive en
[PPO-04 — Cierre del camino Self-Hosted VPS](PPO_04_SELF_HOSTED_VPS_PATH_CLOSURE.md).

La ruta actual es:

```text
Vercel Hobby
+
Supabase Managed Free
```

La ruta futura aprobada es:

```text
Managed measurements
→ LSH
→ Supabase Slim
→ decision gate
→ lightweight Supabase OR PostgreSQL/PostgREST/Auth/Storage
```

El deployment técnico de Vercel Production está `READY`, su aceptación es
`PASS` y su exposición permanece `PROTECTED`. El pilot rollout todavía no se ha
ejecutado.

## Decisiones arquitectónicas confirmadas

- La iniciativa se denomina PPO y sigue siendo el roadmap maestro.
- El primer destino real es Vercel Hobby + Supabase Managed Free.
- Godel Diseño se considera actualmente personal/no comercial. Si su uso cambia
  materialmente, deberá reevaluarse la elegibilidad del plan de hosting.
- No hay Nginx, Docker, VPS ni Supabase Self-Hosted en el runtime productivo del
  Managed Free Pilot.
- Desarrollo/E2E conserva Next.js development + Supabase CLI/local workflow.
- Los archivos siguen siendo privados y sus bytes no atraviesan Server Actions.
- PPO-05 conserva seguridad pública/antiabuso; PPO-06 backup/recovery managed;
  PPO-07 observabilidad y operación managed.
- La baseline 01–06 permanece congelada; cualquier cambio posterior usa 07+.
- Full Supabase Self-Hosted queda congelado como referencia técnica.
- LSH queda planificado, no iniciado, y empieza después de medir uso real.
- PPO-10 solo gobernará una eventual migración productiva posterior a la
  decisión de LSH; no duplica su investigación ni su prototipo.

Las referencias a Windows/WSL2, company-host, LAN provisional, Cloudflare Tunnel
u OVHcloud pertenecen a contexto histórico cuando aparezcan en evidencia cerrada;
no son arquitectura operativa vigente. Las decisiones de fases posteriores no se
declaran implementadas en este roadmap.

## Arquitectura backend vigente

```text
DEVELOPMENT / E2E
Next.js development + Supabase CLI/local workflow

CURRENT PRODUCTION TARGET
Vercel Hobby / Next.js + Supabase Managed Free

FUTURE SELF-HOSTED R&D
LSH → Supabase Slim → decision gate
```

PPO-02/PPO-03 contienen evidencia histórica de compatibilidad managed que vuelve
a ser relevante, pero no constituye aceptación del nuevo entorno productivo.
PPO-04M debe ejecutar su propia validación.

## Integración de los workstreams Self-Hosted

Este documento sigue siendo el roadmap maestro de Preproducción y Puesta en
Operación. [SH — Roadmap de transición a Supabase Self-Hosted](SH_ROADMAP.md)
conserva el workstream full-stack como referencia técnica subordinada. No es el
target productivo actual. [LSH — Lightweight Self-Hosted](LSH_ROADMAP.md) es el
nuevo workstream futuro, también subordinado a PPO y todavía no iniciado.

La secuencia originalmente prevista fue la siguiente; su cierre final no se
alcanzó porque SH-05 quedó pausado:

```text
SH-02
→ SH-03
→ PPO-03G
→ PPO-03 CLOSED
→ SH-04
→ SH-05
→ SH CLOSED
```

PPO-03F cerró/aprobó expiración, abandono, reconciliación, cleanup, idempotencia,
autoridad de eliminación y trazabilidad del lifecycle de Storage. SH-02 es el
siguiente bloque e integra PPO-02 con el backend self-hosted; SH-03 prueba esas
fronteras antes del gate final PPO-03G.
Por tanto, PPO-03G no puede cerrar Storage solo con evidencia de desarrollo/E2E
local.

Estado histórico preservado: SH-02 = CLOSED / APPROVED; SH-03 = CLOSED / APPROVED;
PPO-03G = CLOSED / APPROVED; PPO-03 = CLOSED / APPROVED; SH-04 = CLOSED / APPROVED;
SH-05 = PAUSED / INCOMPLETE. SH-05.0, SH-05.1 y SH-05.2 conservan
sus cierres aprobados; SH-05.3 = PARTIALLY PROVEN / DEFERRED y SH-05.4 =
DEFERRED. La evidencia y las brechas se consolidan en
[SH-05 — Handoff del rehearsal clean-host](SH_05_REHEARSAL_HANDOFF.md).

PPO-03F.0 aprobó el último amendment excepcional de la baseline consolidada
01–06. PPO-03F.1 lo implementó y exigió fresh rebuild 01–06 y QA. PPO-03F
cerró/aprobó y `BASELINE 01–06 = FROZEN`; todo cambio DB posterior deberá usar
una migración `07+`.

PPO-01C/D fueron superseded y no ejecutados porque company-host dejó de ser el
target. El trabajo residual PPO-01E/F de readiness VPS/Linux Docker se difiere a
LSH o a un futuro self-host autorizado y deja de ser gate del piloto actual.
PPO-04 queda `ACTIVE / NEXT` mediante PPO-04M. El backup externo mínimo pertenece
al piloto managed; PPO-06 lo operacionalizará en profundidad y PPO-07 conserva
observabilidad, logs, métricas, alertas y soporte adaptados a los proveedores.
PPO-04M.0 queda `CLOSED / APPROVED` mediante
[PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md](PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md);
PPO-04M.1 queda `CLOSED / APPROVED` mediante
[PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md](PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md);
PPO-04M.2 queda `CLOSED / APPROVED`: M.2A y M.2B están `CLOSED / APPROVED`,
con evidencia estructural y funcional en
[PPO_04M2_MANAGED_PROVISIONING_REPORT.md](PPO_04M2_MANAGED_PROVISIONING_REPORT.md).
PPO-04M.3 queda `CLOSED / APPROVED`; PPO-04M.4 queda
`CLOSED / QUALIFIED PRODUCTION QA ACCEPTANCE`; PPO-04M.5 queda
`ACTIVE / TOOLING IMPLEMENTATION`, con M.5.0 `CLOSED / ARCHITECTURE APPROVED`,
M.5.1 `LOCAL INTEGRATION PASS / PENDING FINAL ARCHITECTURAL REVIEW`
(`DATABASE SECRET-SAFE TRANSPORT`, `AGE ENCRYPTION`, `RCLONE S3` y
`STORAGE METADATA + BYTE RESTORE ORDER` localmente probados) y
M.5.2–M.5.3 `NOT STARTED`;
y PPO-04M.6–PPO-04M.7 permanecen `NOT STARTED`. PPO-04 global continúa
`ACTIVE / NEXT` porque todavía faltan M.5, M.6 y M.7. El Production pilot
rollout permanece `NOT EXECUTED`.

## Estado de fases

| Fase      | Nombre                                      | Estado    |
| --------- | ------------------------------------------- | --------- |
| PPO-00    | Baseline local y formalización inicial      | Cerrada   |
| PPO-01    | Auditoría de infraestructura y conectividad | Residual host-readiness deferred a LSH/self-host futuro |
| PPO-02    | Base reproducible / evidencia managed       | Cerrada; evidencia managed relevante otra vez |
| PPO-03    | Rediseño de cargas y almacenamiento         | Cerrada / aprobada |
| PPO-04    | Managed Free Production Pilot              | ACTIVE / NEXT — deployment ready/protected; rollout pendiente |
| PPO-05    | Seguridad pública                           | Pendiente |
| PPO-06    | Backups y recuperación                      | Pendiente |
| PPO-07    | Observabilidad y operación                  | Pendiente |
| PPO-08    | UAT y puesta en operación                   | Pendiente |
| PPO-09    | Estabilización                              | Pendiente |
| PPO-10    | Gobernanza de eventual migración productiva post-LSH | Deferred / optional; no duplica LSH |
| PPO-QA-01 | Consolidación y aislamiento de la suite E2E | Diferida  |

PPO-QA-01 no bloquea PPO-01, conserva el trabajo archivado y deberá resolverse
antes del cierre definitivo de la puesta en producción.

El plan operativo gobernante de la fase activa es
[PPO-04 — Managed Free Production Pilot](PPO_04_MANAGED_FREE_PILOT_PLAN.md).
El contrato de backup/recovery mínimo y el core local de tooling están en
[PPO-04M.5 — Managed Backup & Recovery Architecture](PPO_04M5_BACKUP_RECOVERY_DESIGN.md),
con transporte secreto de base de datos y orden de restore metadata/bytes
pendientes de prueba local. El primer backup Production sigue `NOT AUTHORIZED`;
la integración local sigue `NOT AUTHORIZED`; no se ejecutaron backup real ni
restore.
El core corregido conserva evidencia `INCOMPLETE` fuera del staging, publica el
nombre final sólo tras cleanup plaintext y prohíbe configuración/credenciales
inline en remotes `rclone`.
El antiguo [plan Self-Hosted VPS](PPO_04_PRODUCTION_PILOT_PLAN.md) queda
superseded sin despliegue. PPO-05, PPO-06 y PPO-07 permanecen pendientes.

### Workstream Self-Hosted

El detalle, alcance y límites del workstream se mantienen en
[SH_ROADMAP.md](SH_ROADMAP.md), para evitar duplicar el roadmap maestro.

Estado interno vigente de PPO-02:

| Bloque    | Estado |
| --------- | ------ |
| PPO-02A   | Cerrada |
| PPO-02B   | Cerrada para la imagen app |
| PPO-02C.1 | Cerrada — validación local aprobada |
| PPO-02C.2 | Cerrada — composición local aprobada con condiciones |
| PPO-02C.3 | Absorbida en PPO-02C.2 — límites y aislamiento validados |
| PPO-02D.1 | Cerrada — healthchecks locales aprobados |
| PPO-02D.2 | Cerrada — Aprobada con condiciones |
| PPO-02E.1 | Cerrada — handoff aprobado |

PPO-02 queda cerrada con condiciones. Este cierre no cierra PPO-01, no aprueba
`company-host` y no constituye despliegue. PPO-02C.1 no constituye despliegue;
PPO-02C.2 integra y valida Docker Compose solo localmente en
`development-laptop`, incluyendo CPU, memoria, `pids_limit`, `read_only`,
tmpfs, usuarios no root, `cap_drop=ALL`, `no-new-privileges`, red dedicada,
`app` sin puerto publicado, Nginx como única entrada, ausencia de Docker socket,
ausencia de montajes persistentes, `docker stats` y límites efectivos vía
Docker. PPO-02D.1 valida healthchecks locales y dependencia operativa inicial.
PPO-02D.2 formaliza `compose.env.local` como archivo runtime ignorado por Git,
valida sus propiedades, recibe evidencia manual de baseline remota aplicada 6/6
sin seed, confirma que HTTPS administrado es alcanzable con VPN activo,
clasifica ProTUN/PostgreSQL como restricción administrativa y aprueba readiness
administrado al enviar la publishable key existente como cabecera `apikey` en la
llamada server-side a `/auth/v1/health`. PPO-02E.1 formaliza el cierre y el
handoff operativo. PPO-03 queda activa: PPO-03A.1 formalizó el contrato y
PPO-03A.2 cerró aprobada con condiciones. El spike separó TUS autenticado por
JWT para internos de TUS presigned para público y difirió la policy pública
reservation-aware al alcance de PPO-03B. PPO-03B.1 validó localmente el control
plane de sesiones/items y policies operation-aware. PPO-03B.2A aplicó la
migración 07 en administrado por Dirección Técnica; PPO-03B.2B confirmó por
HTTPS control plane cerrado, reserva obligatoria y compatibilidad legacy con
VPN activo, sin PostgreSQL remoto. El listing devolvió cero objetos visibles;
sin staged real no prueba su enumeración, pero no evidencia una apertura.
PPO-03B queda cerrada. PPO-03C.1 queda cerrada y aprobada localmente; PPO-03C.2
queda cerrada y aprobada con condición de integración runtime en PPO-03D/E para
la infraestructura TypeScript común. PPO-03C.3A promovió manualmente la
migración 08 y PPO-03C.3B cerró el gate HTTPS administrado de reserva real,
TUS presigned, staged aislado y finalize idempotente. PPO-03C queda cerrada;
PPO-03 permanece activa y PPO-03D es la fase activa.

PPO-03C.1 implementó localmente el control plane de reserva y finalize y queda
aprobada localmente. PPO-03C.2 implementó la infraestructura TypeScript común y
queda aprobada con condición de integración runtime en PPO-03D/E. PPO-03C.3B
validó administradamente las RPCs, policies, Storage y TUS sin ejecutar el
wrapper productivo. PPO-03D.1 integra el flujo interno de Pedidos y queda
implementada localmente, pendiente de revisión arquitectónica. PPO-03C queda
cerrada y PPO-03 permanece activa mientras continúan PPO-03D, PPO-03E, PPO-03F
y PPO-03G.

## Estado vigente de PPO-03

Los párrafos anteriores documentan la secuencia histórica antes del pivot SH.
El estado operativo actual es:

| Bloque | Estado |
| --- | --- |
| PPO-03A | Cerrada |
| PPO-03B | Cerrada |
| PPO-03C | Cerrada |
| PPO-03D.1 | Cerrada / aprobada |
| PPO-03D.2 | Superseded por self-hosted |
| PPO-03E.1 | Cerrada / aprobada |
| PPO-03E.2 | Cerrada / aprobada |
| PPO-03E.3 | Cerrada / aprobada |
| PPO-03E | Cerrada / aprobada |
| PPO-03F.0 | Cerrada / aprobada |
| PPO-03F.1 | Cerrada / aprobada |
| PPO-03F.2 | Cerrada / aprobada |
| PPO-03F.3 | Cerrada / aprobada |
| PPO-03F | Cerrada / aprobada |
| SH-03 | Cerrada / aprobada |
| PPO-03G | Cerrada / aprobada |
| PPO-03 | Cerrada / aprobada |
| SH-04 | CLOSED / APPROVED |
| SH-05 | PAUSED / INCOMPLETE — SH-05.3 PARTIALLY PROVEN / DEFERRED; SH-05.4 DEFERRED |

El diseño aprobado de PPO-03F.0 vive en
[PPO_03F_CLEANUP_DESIGN.md](PPO_03F_CLEANUP_DESIGN.md), el cierre de F.1 en
[PPO_03F_DATABASE_LIFECYCLE_REPORT.md](PPO_03F_DATABASE_LIFECYCLE_REPORT.md) y
el QA/freeze aprobado de F.3 en
[PPO_03F_QA_FREEZE_REPORT.md](PPO_03F_QA_FREEZE_REPORT.md). PPO-03 queda
CLOSED / APPROVED: cerró el modelo, reserva y finalize; Pedido authenticated
TUS; Solicitud signed TUS; lifecycle/cleanup; QA production-like SH-03; el gate
exacto de 20 MiB; bytes fuera de Next; retirada de los límites de 110 MB; y
TD-UPLOAD-001 resuelta. La evidencia de cierre se concentra en
[PPO_03G_UPLOAD_LIMITS_QA_REPORT.md](PPO_03G_UPLOAD_LIMITS_QA_REPORT.md),
[SH_03_CLOSURE_REPORT.md](SH_03_CLOSURE_REPORT.md) y
[SH_03_STORAGE_QA_REPORT.md](SH_03_STORAGE_QA_REPORT.md). SH-04 queda CLOSED /
APPROVED. SH-05 queda PAUSED / INCOMPLETE; SH-05.0, SH-05.1 y
SH-05.2 conservan sus cierres aprobados, SH-05.3 queda PARTIALLY PROVEN /
DEFERRED y SH-05.4 queda DEFERRED. PPO-04M / Managed Free Production Pilot es
la iniciativa `ACTIVE / NEXT`.

## PPO-00

PPO-00 queda cerrada con una baseline local reproducible: puertos canónicos para
Supabase local, reconstrucción limpia desde las seis migraciones consolidadas,
bootstrap local de identidades y perfiles QA, login verificado por rol y
validaciones de cierre documentadas.

El detalle aprobado vive en [PPO-00 - Cierre de baseline local de preproducción](../preproduction/PPO_00_CLOSURE.md).

## PPO-01 revisada

Definición oficial:

> Determinar si el entorno de desarrollo y el futuro host operativo compatible
> poseen las capacidades, prerrequisitos y condiciones necesarias para construir
> y ejecutar la infraestructura contenerizada prevista por PPO.

PPO-01 debe responder:

1. Si la laptop puede construir y validar la composición.
2. Si el host operativo seleccionado satisface el contrato provider-neutral
   aplicable antes de un despliegue real.
3. Qué límites iniciales de CPU, memoria y almacenamiento deberían evaluarse.
4. Si la conectividad es suficiente y estable.
5. Qué estrategia de almacenamiento merece pasar a pruebas reales posteriores.

PPO-01 no construye la composición, no instala Nginx, no configura exposición
pública, no modifica el flujo de archivos, no despliega el sistema en la VPS,
no decide definitivamente el almacenamiento y no prueba todavía el dominio
productivo.

La ejecución real de la composición pertenece a PPO-02.

Estado interno de PPO-01:

| Bloque    | Estado |
| --------- | ------ |
| PPO-01A.1 | Cerrada |
| PPO-01A.2 | Cerrada |
| PPO-01B   | Cerrada — `development-laptop` Apta con condiciones |
| PPO-01C   | SUPERSEDED / NOT EXECUTED — company-host audit histórica |
| PPO-01D   | SUPERSEDED / NOT EXECUTED — veredicto company-host histórico |
| PPO-01E   | DEFERRED TO LSH/SELF-HOST FUTURE — VPS/Linux Docker readiness |
| PPO-01F   | DEFERRED TO LSH/SELF-HOST FUTURE — final host readiness verdict |

`development-laptop` ya demostró capacidad suficiente para construir y validar
la composición contenerizada prevista para PPO-02: WSL2 y Docker con
contenedores Linux están operativos, el build terminó correctamente y Supabase
local coexistió con Next.js durante las mediciones controladas.

La conectividad desde el contexto físico declarado `cuba` y con VPN confirmada
manualmente como desconectada fue demostrada para los destinos ejecutados de
GitHub, Vercel y Cloudflare. Las transferencias sintéticas de 20 MiB se
completaron en descarga y carga. En PPO-01, Supabase administrado quedó
pendiente porque el proyecto administrado no estaba configurado; la validación
administrada correspondiente quedó cubierta después en PPO-02D.2.

PPO-01 conserva sus cierres y la trazabilidad de targets anteriores. PPO-01C/D
no se ejecutarán. PPO-01E/F dejan de ser gates del Managed Free Pilot y quedan
diferidas a LSH o a un futuro self-host autorizado; no se declaran cerradas.

Por decisión expresa de Dirección Técnica, PPO-02 quedó autorizada en paralelo
para construcción y validación local en `development-laptop`. Ese inicio no
implicó cierre de PPO-01, no implicó aprobación de `company-host` y no implicó
despliegue productivo ni despliegue en la empresa.

## PPO-02 a PPO-10 — detalle histórico

La sección siguiente conserva el alcance y las decisiones registradas antes de
los pivots SH y Managed Free. Sus estados de backend, fases activas y destinos
operativos están superseded por las secciones actuales de este documento.

- PPO-02: cerró Dockerfile, Compose, Nginx, redes, healthchecks, readiness
  administrado y criterios de reproducibilidad local. PPO-02A, PPO-02B,
  PPO-02C, PPO-02D y PPO-02E.1 quedan cerradas o absorbidas según corresponda.
  Esto no implementa despliegue, TLS, Cloudflare ni validación de
  `company-host`. El contrato y cierre viven en
  [PPO-02 - Plan de contenerización](PPO_02_CONTAINERIZATION_PLAN.md) y
  [PPO-02 — Cierre de base contenerizada reproducible](PPO_02_CLOSURE.md).
- PPO-03: queda activa. PPO-03A.1 formaliza el
  [contrato de cargas y almacenamiento](PPO_03_UPLOAD_STORAGE_CONTRACT.md), y
  PPO-03A.2 queda [aprobada con condiciones](PPO_03_TUS_SPIKE_REPORT.md): el
  transporte directo usa JWT interno o token firmado público según el actor.
  No implementan el rediseño. La secuencia continúa con PPO-03B (modelo DB, RLS
  y policies), PPO-03C
  (infraestructura común de reserva, firma, transferencia y finalize), PPO-03D
  (migración interna de Pedidos), PPO-03E (migración pública de Solicitudes),
  PPO-03F (expiración, reconciliación y cleanup) y PPO-03G (QA integral,
  retirada de 110 MB y cierre documental). PPO-03B queda cerrada. PPO-03B.2B
  no probó artificialmente el positivo presigned de `cargas/v1`; PPO-03C.3B lo
  validó mediante las RPCs reales de reserva, junto con staged no enumerable por
  actores no autorizados. PPO-03D.1 integra localmente Pedidos mediante TUS
  autenticado directo y queda pendiente de revisión arquitectónica; PPO-03E
  sigue para integrar el flujo público.
- Actualización PPO-03E: Solicitudes ya integra localmente reserva, firma TUS,
  transferencia directa, finalize, resume y retry. PPO-03E queda pendiente de
  revisión/cierre arquitectónico antes de PPO-03F/G.
- PPO-04 (snapshot histórico): proponía Production Pilot V1 en VPS, con
  App/Nginx `linux/amd64` construidos fuera del target. Ese plan quedó
  `SUPERSEDED / NOT EXECUTED`; PPO-04M es ahora el plan gobernante.
- PPO-05: abordará el hardening público completo: antiabuso, rate limiting,
  superficies públicas, uploads y revisión de exposición.
- PPO-06: profundizará backups y recovery para Supabase Managed Free en la ruta
  actual: calendario, retención, custodia externa, restore drills, RPO/RTO y DR.
- PPO-07: definirá monitoreo, logs, métricas, alertas, incidentes y runbooks para
  Vercel/Supabase Managed.
- PPO-08: ejecutará validación con usuarios reales.
- PPO-09: medirá y estabilizará el uso real.
- PPO-10: queda diferida para gobernar una migración productiva futura después
  del decision gate de LSH; no repite la investigación o prototipado de LSH.

Estas fases describen alcance futuro. No incorporan diseño de implementación en
este documento.

## Fuera del alcance de PPO

- Catálogo comercial.
- Tienda online.
- Carrito.
- Pagos online.
- Inventario avanzado.
- Facturación fiscal completa.
- Aplicación móvil nativa.
- WhatsApp avanzado.
- Panel independiente de clientes.
- Analítica comercial avanzada.
- Kubernetes.
- Microservicios distribuidos.
- Alta disponibilidad multinodo.
- Nuevo rediseño visual general.
