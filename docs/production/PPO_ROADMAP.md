# PPO — Preproducción y Puesta en Operación

## Metadatos

- Actualización de estado: 2026-08-11

- Proyecto: Godel Diseño
- Estado: Activo
- Fecha de creación: 2026-07-21
- Última revisión: 2026-08-11
- Responsable técnico: Dirección Técnica de Godel Diseño
- Arquitectura y supervisión: Arquitectura Senior / Orquestación Técnica
- Implementación: Agente Codex en VS Code

## Propósito

PPO lleva el sistema desde el MVP interno funcional hasta una operación real
controlada, segura, reproducible, recuperable, observable y validada por
usuarios.

La iniciativa diferencia tres momentos operativos:

1. Preparación en la laptop de desarrollo, donde se construirán y validarán las
   bases técnicas antes de moverlas a otro host.
2. Operación provisional en la máquina de Godel Diseño, conviviendo con sus
   demás aplicaciones y bajo condiciones controladas.
3. Migración futura a infraestructura estable, conservando una estrategia de
   recuperación y soporte.

## Decisiones arquitectónicas confirmadas

- La iniciativa se denomina PPO.
- Nginx será el proxy inverso.
- Caddy no forma parte de la arquitectura.
- Los hosts iniciales utilizan Windows.
- Docker Desktop utiliza WSL2.
- Se usarán contenedores Linux.
- La máquina de la empresa no es un servidor dedicado.
- La infraestructura debe quedar aislada del resto de aplicaciones del host.
- La composición se construirá primero en la laptop.
- La misma base se trasladará después a la máquina de la empresa.
- Supabase administrado continuará inicialmente como backend.
- La afirmación anterior sobre continuidad de Supabase administrado es evidencia
  histórica superseded. El backend objetivo actual es Supabase self-hosted en
  Docker y Supabase CLI local queda para desarrollo/E2E.
- Vercel Hobby se utilizará para previews, demostración y preproducción controlada.
- Cloudflare Tunnel se evaluará para la exposición segura de la operación provisional.
- Los archivos serán privados.
- El contenido de archivos no atravesará Server Actions de Next.js.
- El objetivo futuro contempla hasta diez archivos por operación.
- El límite inicialmente planteado es 20 MiB por archivo.
- ZIP, RAR y CDR están dentro del alcance futuro del rediseño de archivos.
- OVHcloud Canadá continúa como candidato para la producción futura.
- Después de la migración, la máquina de la empresa podrá actuar como soporte
  de backup y recuperación.

Estas decisiones registran dirección arquitectónica. Las que pertenecen a fases
posteriores no se declaran implementadas en este roadmap.

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

La ruta activa es:

```text
PPO-03F
→ SH-02
→ SH-03
→ PPO-03G
→ PPO-03 CLOSED
→ SH-04
→ SH-05
→ SH CLOSED
```

PPO-03F completa conceptualmente expiración, abandono, reconciliación, cleanup,
idempotencia, autoridad de eliminación y trazabilidad del lifecycle de Storage
antes de integrar la topología production-like. SH-02 integra PPO-02 con el
backend self-hosted; SH-03 prueba esas fronteras antes del gate final PPO-03G.
Por tanto, PPO-03G no puede cerrar Storage solo con evidencia de desarrollo/E2E
local.

PPO-03F.0 aprobó el último amendment excepcional de la baseline consolidada
01–06. PPO-03F.1 lo implementa y exige fresh rebuild 01–06 y QA. Tras cerrar PPO-03F, la baseline
01–06 queda frozen y todo cambio DB posterior deberá usar una migración `07+`.

Al cierre de PPO-03 y SH, PPO-01C/D continúan como workstream paralelo cuando
esté disponible `company-host`, con PPO-01D aprobado como gate de PPO-04.
PPO-04 empieza como despliegue provisional privado/LAN; una exposición pública,
incluido Cloudflare Tunnel si sigue siendo la solución elegida, requiere el gate
PPO-05. PPO-05 cubre antiabuso, rate limiting, `/solicitud`, `/estado`, política
de requests públicas, hardening y revisión de uploads públicos. SH-04 prueba
los mecanismos técnicos de backup/restore/update/rollback; PPO-06 los
operacionaliza en `company-host`. PPO-07 operacionaliza observabilidad, logs,
métricas, alertas y soporte. PPO-10 reutilizará el contrato de portabilidad
demostrado por SH-05 para una futura infraestructura estable.

## Estado de fases

| Fase      | Nombre                                      | Estado    |
| --------- | ------------------------------------------- | --------- |
| PPO-00    | Baseline local y formalización inicial      | Cerrada   |
| PPO-01    | Auditoría de infraestructura y conectividad | Activa    |
| PPO-02    | Base contenerizada reproducible             | Cerrada — Aprobada con condiciones |
| PPO-03    | Rediseño de cargas y almacenamiento         | Activa |
| PPO-04    | Despliegue provisional en la empresa        | Pendiente |
| PPO-05    | Seguridad pública                           | Pendiente |
| PPO-06    | Backups y recuperación                      | Pendiente |
| PPO-07    | Observabilidad y operación                  | Pendiente |
| PPO-08    | UAT y puesta en operación                   | Pendiente |
| PPO-09    | Estabilización                              | Pendiente |
| PPO-10    | Migración futura a infraestructura estable  | Pendiente |
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
| PPO-03F.1 | Implementada / pendiente de revisión arquitectónica |
| PPO-03F | Activa; siguiente PPO-03F.2 tras revisión |
| PPO-03G | Pendiente |
| PPO-03 | Activa |

El diseño aprobado de PPO-03F.0 vive en
[PPO_03F_CLEANUP_DESIGN.md](PPO_03F_CLEANUP_DESIGN.md) y la implementación
pendiente de revisión de F.1 en [PPO_03F_DATABASE_LIFECYCLE_REPORT.md](PPO_03F_DATABASE_LIFECYCLE_REPORT.md).
PPO-03 continúa activa hasta completar los bloques funcionales y de cierre pendientes.

## PPO-00

PPO-00 queda cerrada con una baseline local reproducible: puertos canónicos para
Supabase local, reconstrucción limpia desde las seis migraciones consolidadas,
bootstrap local de identidades y perfiles QA, login verificado por rol y
validaciones de cierre documentadas.

El detalle aprobado vive en [PPO-00 - Cierre de baseline local de preproducción](../preproduction/PPO_00_CLOSURE.md).

## PPO-01 revisada

Definición oficial:

> Determinar si la laptop de desarrollo y la máquina de Godel Diseño poseen las capacidades, prerrequisitos y condiciones operativas necesarias para construir y ejecutar posteriormente la infraestructura contenerizada prevista por PPO.

PPO-01 debe responder:

1. Si la laptop puede construir y validar la composición.
2. Si la máquina de la empresa puede alojar provisionalmente el sistema junto
   con sus demás aplicaciones.
3. Qué límites iniciales de CPU, memoria y almacenamiento deberían evaluarse.
4. Si la conectividad es suficiente y estable.
5. Qué estrategia de almacenamiento merece pasar a pruebas reales posteriores.

PPO-01 no construye la composición, no instala Nginx, no configura Cloudflare
Tunnel, no modifica el flujo de archivos, no despliega el sistema en la empresa,
no decide definitivamente el almacenamiento y no prueba todavía el dominio
productivo.

La ejecución real de la composición pertenece a PPO-02.

Estado interno de PPO-01:

| Bloque    | Estado |
| --------- | ------ |
| PPO-01A.1 | Cerrada |
| PPO-01A.2 | Cerrada |
| PPO-01B   | Cerrada — `development-laptop` Apta con condiciones |
| PPO-01C   | Diferida temporalmente |
| PPO-01D   | Pendiente, bloqueada por PPO-01C |

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

`company-host` todavía no ha sido auditado y PPO-01 no está cerrada.

PPO-01C (auditoría de `company-host`) y PPO-01D (veredicto final) pueden
ejecutarse en paralelo con PPO-03/SH tan pronto Dirección Técnica disponga de
la máquina. No son dependencia técnica de esa ruta, pero PPO-01D aprobado sí es
un gate obligatorio antes de PPO-04.

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
- PPO-04: cubrirá despliegue provisional, Cloudflare Tunnel, dominio y
  recuperación del host.
- PPO-05: abordará antiabuso, rate limiting, seguridad pública y protección de
  archivos.
- PPO-06: definirá backups y restauraciones demostrables.
- PPO-07: definirá logs, métricas, healthchecks y runbooks.
- PPO-08: ejecutará validación con usuarios reales.
- PPO-09: medirá y estabilizará el uso real.
- PPO-10: gobernará la migración futura a infraestructura estable y la
  conservación de una estrategia de recuperación.

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
