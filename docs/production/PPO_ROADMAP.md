# PPO — Preproducción y Puesta en Operación

## Metadatos

- Actualización de estado: 2026-09-03

- Proyecto: Godel Diseño
- Estado: Activo
- Fecha de creación: 2026-07-21
- Última revisión: 2026-09-03
- Responsable técnico: Dirección Técnica de Godel Diseño
- Arquitectura y supervisión: Arquitectura Senior / Orquestación Técnica
- Implementación: Agente Codex en VS Code

## Propósito

PPO lleva el sistema desde el MVP interno funcional hasta una operación real
controlada, segura, reproducible, recuperable, observable y validada por
usuarios.

La iniciativa diferencia tres momentos operativos vigentes:

1. Preparación y validación en desarrollo/preproducción.
2. Prueba de portabilidad en un host limpio desechable e independiente.
3. Despliegue operativo privado al VPS seleccionado, bajo un contrato
   provider-neutral de host Linux Docker compatible.

## Decisiones arquitectónicas confirmadas

- La iniciativa se denomina PPO.
- Nginx será el proxy inverso.
- Caddy no forma parte de la arquitectura.
- Los contenedores runtime son Linux y el primer proof clean-host debe ser amd64.
- La infraestructura debe quedar aislada del resto de aplicaciones del host.
- La composición se construye y valida primero en desarrollo/preproducción.
- El destino operativo seleccionado es una VPS de Hosting DC; la arquitectura
  permanece `PROVIDER_NEUTRAL_CLEAN_LINUX_DOCKER_HOST`.
- Supabase administrado continuará inicialmente como backend.
- La afirmación anterior sobre continuidad de Supabase administrado es evidencia
  histórica superseded. El backend objetivo actual es Supabase self-hosted en
  Docker y Supabase CLI local queda para desarrollo/E2E.
- Vercel Hobby se utilizará para previews, demostración y preproducción controlada.
- La exposición pública se decide únicamente tras el gate PPO-05; no se exige
  Cloudflare Tunnel como solución actual.
- Los archivos serán privados.
- El contenido de archivos no atravesará Server Actions de Next.js.
- El objetivo futuro contempla hasta diez archivos por operación.
- El límite inicialmente planteado es 20 MiB por archivo.
- ZIP, RAR y CDR están dentro del alcance futuro del rediseño de archivos.
- PPO-10 conserva una posible migración futura de proveedor/infraestructura,
  sólo si llega a ser necesaria.
- La máquina de la empresa puede evaluarse en el futuro como destino off-host,
  pero no es un supuesto de operación ni backup.

Las referencias a Windows/WSL2, company-host, LAN provisional, Cloudflare Tunnel
u OVHcloud pertenecen a contexto histórico cuando aparezcan en evidencia cerrada;
no son arquitectura operativa vigente. Las decisiones de fases posteriores no se
declaran implementadas en este roadmap.

## Arquitectura backend vigente

Supabase self-hosted en Docker es el backend objetivo de operación.
Supabase CLI local se conserva como entorno de desarrollo y E2E. Las pruebas
previas con Supabase administrado permanecen como evidencia histórica de
PPO-02/PPO-03, pero ese backend fue superseded por el workstream SH. La lista de
decisiones inmediatamente anterior se interpreta como snapshot histórico cuando
menciona continuidad de Supabase administrado.

## Integración del workstream Self-Hosted

Este documento sigue siendo el roadmap maestro de Preproducción y Puesta en
Operación. [SH — Roadmap de transición a Supabase Self-Hosted](SH_ROADMAP.md)
es su workstream técnico subordinado, temporal y con cierre explícito; no es un
roadmap de producto paralelo ni una segunda puesta en producción.

La siguiente secuencia histórica ya completó sus primeros cuatro pasos:

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

Estado vigente de esa secuencia: SH-02 = CLOSED / APPROVED; SH-03 = CLOSED /
APPROVED; PPO-03G = CLOSED / APPROVED; PPO-03 = CLOSED / APPROVED; SH-04 =
CLOSED / APPROVED; SH-05 = ACTIVE. SH-05.0 está CLOSED / APPROVED /
PASS_PORTABILITY_DISCOVERY; SH-05.1 es READY / NEXT / NOT STARTED.

PPO-03F.0 aprobó el último amendment excepcional de la baseline consolidada
01–06. PPO-03F.1 lo implementó y exigió fresh rebuild 01–06 y QA. PPO-03F
cerró/aprobó y `BASELINE 01–06 = FROZEN`; todo cambio DB posterior deberá usar
una migración `07+`.

PPO-01C/D fueron superseded y no ejecutados porque company-host dejó de ser el
target. PPO-01E/F pasan a ser el gate provider-neutral de readiness VPS/Linux
Docker host antes de PPO-04. PPO-04 comienza como despliegue privado/restringido
al VPS seleccionado; cualquier exposición pública requiere PPO-05. SH-04 prueba
capacidades técnicas; PPO-06 las operacionaliza en el host productivo
seleccionado y PPO-07 conserva observabilidad, logs, métricas, alertas y soporte.
PPO-10 queda como migración futura opcional.

## Estado de fases

| Fase      | Nombre                                      | Estado    |
| --------- | ------------------------------------------- | --------- |
| PPO-00    | Baseline local y formalización inicial      | Cerrada   |
| PPO-01    | Auditoría de infraestructura y conectividad | Activa    |
| PPO-02    | Base contenerizada reproducible             | Cerrada — Aprobada con condiciones |
| PPO-03    | Rediseño de cargas y almacenamiento         | Cerrada / aprobada |
| PPO-04    | Despliegue operativo privado al VPS seleccionado | Pendiente |
| PPO-05    | Seguridad pública                           | Pendiente |
| PPO-06    | Backups y recuperación                      | Pendiente |
| PPO-07    | Observabilidad y operación                  | Pendiente |
| PPO-08    | UAT y puesta en operación                   | Pendiente |
| PPO-09    | Estabilización                              | Pendiente |
| PPO-10    | Migración futura de proveedor/infraestructura | Deferred / optional |
| PPO-QA-01 | Consolidación y aislamiento de la suite E2E | Diferida  |

PPO-QA-01 no bloquea PPO-01, conserva el trabajo archivado y deberá resolverse
antes del cierre definitivo de la puesta en producción.

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
| SH-05 | ACTIVE — SH-05.0 CLOSED / APPROVED / PASS_PORTABILITY_DISCOVERY |

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
APPROVED. SH-05 está ACTIVE; SH-05.0 queda CLOSED / APPROVED /
PASS_PORTABILITY_DISCOVERY y SH-05.1 queda READY / NEXT / NOT STARTED.

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
| PPO-01E   | NOT STARTED / PENDING — VPS / Linux Docker host readiness audit |
| PPO-01F   | NOT STARTED / PENDING — final infrastructure readiness verdict / PPO-04 gate |

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

PPO-01 permanece activa. PPO-01C/D preservan trazabilidad del target anterior y
no se ejecutarán. PPO-01E/F no presuponen distribución Linux, recursos, IP,
firewall, panel de proveedor, DNS, TLS ni producto de backup. PPO-01F aprobado
es el gate obligatorio antes de PPO-04.

Por decisión expresa de Dirección Técnica, PPO-02 quedó autorizada en paralelo
para construcción y validación local en `development-laptop`. Ese inicio no
implicó cierre de PPO-01, no implicó aprobación de `company-host` y no implicó
despliegue productivo ni despliegue en la empresa.

## PPO-02 a PPO-10 — detalle histórico

La sección siguiente conserva el alcance y las decisiones registradas antes del
pivot SH. Sus estados de backend administrado, PPO-03D.1 pendiente o PPO-03E
pendiente están superseded por las secciones «Arquitectura backend vigente» y
«Estado vigente de PPO-03» de este documento.

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
- PPO-04: la descripción anterior de despliegue provisional/Cloudflare/dominio
  es histórica; el alcance vigente es despliegue operativo privado al VPS
  seleccionado tras SH cerrado y PPO-01F aprobado.
- PPO-05: abordará antiabuso, rate limiting, seguridad pública y protección de
  archivos.
- PPO-06: definirá operación de backups y recovery para el host productivo
  seleccionado, incluida retención, destino off-host y autorización DR.
- PPO-07: definirá logs, métricas, healthchecks y runbooks.
- PPO-08: ejecutará validación con usuarios reales.
- PPO-09: medirá y estabilizará el uso real.
- PPO-10: queda diferida como gobierno de una migración futura de
  proveedor/infraestructura que llegue a ser necesaria.

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
