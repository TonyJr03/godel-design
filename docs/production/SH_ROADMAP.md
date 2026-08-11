# SH — Roadmap de transición a Supabase Self-Hosted

## Gobernanza

`PPO_ROADMAP.md` es el roadmap maestro de Preproducción y Puesta en Operación.
Este documento describe el workstream técnico subordinado que completa el pivot:

```text
Supabase managed
→ Supabase self-hosted Docker
```

SH no es un roadmap de producto paralelo, una sustitución de PPO, una segunda
puesta en producción ni una duplicación de PPO-04, PPO-06, PPO-07 o PPO-10.
Tiene un alcance técnico acotado y un final explícito: al cerrar SH-05,
`SH = CLOSED`; toda evolución posterior continúa exclusivamente mediante PPO.

## Propósito

SH proporciona a PPO un backend Supabase self-hosted que sea reproducible,
integrado, validado, operable, recuperable y portable. No introduce nuevas
funcionalidades de producto.

La arquitectura vigente es:

```text
DESARROLLO / E2E
npm run dev
→ Supabase CLI local

PRODUCTION-LIKE / OBJETIVO OPERATIVO
App Docker + Nginx
→ Supabase self-hosted Docker
```

Supabase administrado pertenece únicamente a evidencia histórica previa; no es
el backend objetivo actual.

## Estado del workstream

| Bloque | Nombre | Estado |
| --- | --- | --- |
| SH-01 | Baseline oficial Supabase self-hosted | Cerrada / aprobada |
| SH-02 | Integración Godel ↔ Supabase self-hosted | Pendiente |
| SH-03 | QA funcional production-like | Pendiente |
| SH-04 | Fundamentos operativos self-hosted | Pendiente |
| SH-05 | Portabilidad reproducible | Pendiente |

### SH-01 — cerrada / aprobada

| Subbloque | Estado |
| --- | --- |
| SH-01A — distribución oficial fijada | CLOSED |
| SH-01B — secretos y standalone | CLOSED |
| SH-01C — baseline Godel / DB, Auth y Storage | CLOSED |

SH-01C dejó una baseline final de seis migraciones consolidadas
(`20260811131824` a `20260811131829`), con fresh rebuild aprobado y
PostgreSQL, Auth y Storage validados. La evidencia detallada no se reescribe en
este roadmap: véase [Auditoría de baseline self-hosted SH-01C](SH_01C_DATABASE_BASELINE_AUDIT.md).

## Bloques pendientes

### SH-02 — Integración Godel ↔ Supabase self-hosted

Integra el runtime contenerizado de PPO-02 con el backend construido en SH-01.
La topología objetivo es:

```text
Browser
   │
   ▼
Nginx
   ├── Next.js
   └── Supabase public API
            │
            ▼
          api-gw
        /   |   \
      Auth REST Storage
             ...
```

Las URLs se separan por actor:

```text
Browser
→ NEXT_PUBLIC_SUPABASE_URL
→ endpoint público servido o proxyado por Nginx

Next container
→ SUPABASE_SERVER_URL
→ http://api-gw:8000
```

Sus objetivos son redes Docker, integración entre ambos stacks, proxy público
de Supabase, distinción URL pública/server-side, Auth, Storage, healthchecks,
readiness, orden de inicio y dependencias, y aislamiento de PostgreSQL y
Supavisor. Este roadmap no diseña archivos Compose concretos ni implementa
SH-02.

### SH-03 — QA funcional production-like

Demuestra que Godel funciona sobre `App Docker + Nginx + Supabase self-hosted`,
y no solo sobre `npm run dev + Supabase CLI local`. Es un gate focal sobre las
fronteras que cambian por la topología, no una duplicación completa de la suite
E2E local.

El mínimo conceptual cubre health/readiness, login, roles, Auth Admin,
dashboard, clientes, solicitudes, pedidos, tareas, pagos, tracking público, TUS
interno, TUS público presigned, resume, finalize, listados y descargas.

### SH-04 — Fundamentos operativos self-hosted

Construye y demuestra capacidades técnicas: persistencia e inventario de
volúmenes/datos; backup de PostgreSQL, objetos Storage y configuración necesaria
para reconstrucción; restore demostrado; estrategia de secretos; configuración
SMTP; actualización del bundle upstream; rollback; y un runbook técnico mínimo.

SH-04 no sustituye PPO-06 ni PPO-07:

```text
SH-04
→ demuestra técnicamente backup, restore, update y rollback

PPO-06
→ operacionaliza backup/recovery en el company-host: periodicidad,
  retención, ubicación y procedimiento de desastre

PPO-07
→ operacionaliza monitoreo, logs, métricas, alertas y soporte
```

No define todavía retenciones ni cron productivo.

### SH-05 — Portabilidad reproducible

Demuestra que la instalación puede reconstruirse en otro Docker host desde
repositorio, configuración externa, secretos y backups:

```text
host A
→ backup/export
→ host limpio B
→ restore/rebuild
→ Godel operativo
```

No ejecuta todavía una migración `laptop → company-host` ni
`company-host → VPS/infraestructura estable`. PPO-04 usará este contrato para
desplegar en `company-host`; PPO-10 lo reutilizará para una futura migración a
infraestructura estable.

## Secuencia integrada y gates

La ruta activa aprobada es:

```text
PPO-03E ✅
    │
    ▼
PPO-03F
    │
    ▼
SH-02
    │
    ▼
SH-03
    │
    ▼
PPO-03G
    │
    ▼
PPO-03 ✅
    │
    ▼
SH-04
    │
    ▼
SH-05
    │
    ▼
SH ✅
```

PPO-03F precede SH-02 porque completa conceptualmente el lifecycle de Storage:
`reserved → upload → finalize → committed` y también abandono, expiración,
reconciliación y cleanup. Debe resolver su diseño técnico en PPO-03F.0, con
idempotencia, autoridad de eliminación y trazabilidad mínima; este roadmap no
diseña esos internals. No se cierra una integración production-like sobre un
modelo de Storage incompleto.

SH-03 precede PPO-03G porque este último es el gate final de Storage. PPO-03G
debe apoyarse en evidencia de `Browser → Nginx → Supabase self-hosted Storage` y
`Next Docker → api-gw`, no únicamente en desarrollo local. Después, PPO-03G
realiza QA integral de uploads, valida bytes y control plane, revisa límites
finales, retira los límites transitorios de 110 MB en Next/Nginx si ya no son
necesarios, reejecuta gates relevantes, cierra TD-UPLOAD-001 y completa la
documentación de PPO-03.

## Gobernanza de la baseline DB

PPO-03F es la última oportunidad para evaluar si el lifecycle de Storage exige
un amendment excepcional de la baseline consolidada 01–06. No se presume que
sea necesario:

```text
PPO-03F.0
→ analizar necesidad DB

si NO:
  baseline permanece intacta

si SÍ:
  amendment explícitamente aprobado
  + fresh rebuild 01–06
  + QA
```

Después del cierre de PPO-03F, `BASELINE 01–06 = FROZEN`. Todo cambio de base
de datos posterior deberá ser una migración nueva `07+`; no se reescribirán
01–06.

## Relación con PPO posterior

Una vez cerrados PPO-03 y SH, la secuencia de PPO continúa así:

```text
PPO-01C / PPO-01D
        │
        ▼
PPO-04
        │
        ▼
PPO-05
        │
        ▼
PPO-06
        │
        ▼
PPO-07
        │
        ▼
PPO-08
        │
        ▼
PPO-09
        │
        ▼
PPO-10
```

PPO-01C (auditoría de `company-host`) y PPO-01D (veredicto final) son un
workstream paralelo: pueden ejecutarse cuando Dirección Técnica disponga de la
máquina de Godel Diseño y no bloquean PPO-03/SH. Sin embargo, PPO-01D aprobado
es gate obligatorio antes de PPO-04.

PPO-04 inicia como despliegue provisional privado/LAN en `company-host`; no
declara exposición pública automática. Cloudflare Tunnel puede prepararse, pero
su activación pública depende del gate PPO-05. PPO-05 cubre rate limiting,
antiabuso, protección de `/solicitud` y `/estado`, política de requests
públicas, hardening, revisión de uploads públicos y evaluación de
CAPTCHA/honeypot cuando corresponda.

PPO-06 aplica operativamente en `company-host` las capacidades probadas en
SH-04: frecuencia, retención, ubicación, copia secundaria, responsabilidades,
restore drills y recuperación ante desastre. PPO-07 consume los healthchecks y
capacidades técnicas de PPO-02/SH para observabilidad, logs, métricas, alertas,
runbooks y operación cotidiana. PPO-08 conserva UAT con usuarios reales;
PPO-09, estabilización posterior; y PPO-10, migración futura a infraestructura
estable, reutilizando el contrato de portabilidad demostrado por SH-05.

OVHcloud Canadá permanece como candidato para PPO-10, no como decisión cerrada.

