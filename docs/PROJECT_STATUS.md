# Estado del proyecto

Última actualización: 2026-08-30

## Estado general

Godel Diseño mantiene un MVP interno funcional y una baseline de base de datos
self-hosted reproducible. La preparación de preproducción continúa activa: no
existe todavía despliegue productivo ni aprobación de `company-host`.

## Arquitectura vigente

```text
Desarrollo y E2E
npm run dev -> Supabase CLI local

Production-like y objetivo operativo
App Docker + Nginx -> Supabase self-hosted Docker
```

Supabase administrado fue el backend de validaciones históricas de PPO-02 y
PPO-03. Esa evidencia se conserva en sus informes, pero fue superseded como
backend objetivo por el workstream SH.

## Baseline de base de datos

La baseline congelada contiene exactamente seis migraciones consolidadas:

1. `20260811131824_01_core_schema.sql`
2. `20260811131825_02_security_rls_grants.sql`
3. `20260811131826_03_business_rpcs.sql`
4. `20260811131827_04_storage.sql`
5. `20260811131828_05_auth_admin_user_lifecycle.sql`
6. `20260811131829_06_final_hardening.sql`

La baseline self-hosted aprobó fresh rebuild, 6/6 migraciones, DB lint, Storage
QA, tipos generados y build. `BASELINE 01–06 = FROZEN`: toda evolución de base
de datos posterior deberá realizarse mediante una nueva migration 07+. Las
antiguas migraciones incrementales 07/08 pertenecen a la historia previa a
SH-01C; sus responsabilidades quedaron absorbidas en la baseline consolidada y
no forman parte de una instalación actual.

## Estado PPO

| Bloque | Estado |
| --- | --- |
| PPO-00 | Cerrada |
| PPO-01 | Activa; `company-host` sigue pendiente |
| PPO-02 | Cerrada con condiciones; evidencia managed histórica |
| PPO-03A | Cerrada |
| PPO-03B | Cerrada |
| PPO-03C | Cerrada |
| PPO-03D.1 | Cerrada / aprobada |
| PPO-03D.2 | Superseded por el pivot self-hosted |
| PPO-03E.1 | Cerrada / aprobada |
| PPO-03E.2 | Cerrada / aprobada |
| PPO-03E.3 | Cerrada / aprobada |
| PPO-03E | Cerrada / aprobada |
| PPO-03F.0 | Cerrada / aprobada |
| PPO-03F.1 | Cerrada / aprobada |
| PPO-03F.2 | Cerrada / aprobada |
| PPO-03F.3 | Cerrada / aprobada |
| PPO-03F | Cerrada / aprobada |
| PPO-03G | Cerrada / aprobada |
| PPO-03 | Cerrada / aprobada |

PPO-03D/E ya trasladaron los bytes de archivos del navegador directamente a
Storage por TUS. PPO-03F.0 aprobó el lifecycle, la autoridad y el amendment
final; PPO-03F.1 lo implementa en la baseline y fue cerrada/aprobada tras la
revisión arquitectónica. PPO-03F.2 incorporó el executor server-only y la
operación manual, y quedó cerrada/aprobada. PPO-03F.3 completó el QA final; la
revisión arquitectónica cerró/aprobó PPO-03F y congeló la baseline 01–06.
PPO-03G mantiene el gate final de infraestructura y retirada de límites
transitorios.

## Ruta histórica hasta el cierre de PPO-03

```text
SH-03
→ PPO-03G
→ PPO-03 CLOSED
→ SH-04
→ SH-05
→ cierre SH
```

## Ruta activa

```text
SH-04
→ SH-04.3: CLOSED / APPROVED
→ SH-04.4 NEXT
→ SH-04.5
→ SH-05
→ cierre SH
```

PPO-03F cerró el lifecycle de Storage y congeló la baseline 01–06; PPO-03G
cerró el gate final de infraestructura y PPO-03 quedó cerrado/aprobado. SH-02 y
SH-03 están cerrados/aprobados: la topología `App Docker + Nginx + Supabase
self-hosted`, Auth, flujos core, Storage y la regresión agregada quedaron
validados. SH continúa como workstream técnico subordinado al roadmap maestro
PPO y termina al cerrar SH-05.

SH-04 está en curso. SH-04.3 quedó `CLOSED / APPROVED` tras la aceptación
operativa final `SH043_FINAL_OPERATIONAL_ACCEPTANCE_PASS`: D5 permanece
`CURRENT / MATCH`, con D5 como recovery same-host rutinario y GEN7/GEN6
retenidas/no actuales. La baseline canónica D5
`20260830T201300Z-aefc033f` fue restaurada destructivamente con el checkpoint
defensivo `20260831T004014Z-e69d3fca`; el backup histórico GEN7
`20260830T135345Z-a1b3d14d` permanece verificado. SH-04.4 es el siguiente
bloque; SH-04.5 no ha iniciado. Esto no declara un despliegue en `company-host`,
cuyo gate PPO-01 sigue separado.
PPO-01C/D puede avanzar en paralelo
cuando `company-host` esté disponible; PPO-01D aprobado es gate antes de PPO-04.

## Capacidades disponibles

- Solicitud pública y tracking público `/estado`.
- Dashboard interno por rol, clientes, solicitudes, pedidos y tareas.
- Archivos privados con control plane de reserva, TUS y finalize.
- Comentarios, historial, pagos y administración de usuarios internos.

## Documentación vigente

- [Roadmap PPO](production/PPO_ROADMAP.md)
- [Roadmap Self-Hosted](production/SH_ROADMAP.md)
- [Diseño de integración SH-02.0](production/SH_02_INTEGRATION_DESIGN.md)
- [Informe Compose y networking SH-02.1](production/SH_02_COMPOSE_NETWORK_REPORT.md)
- [Informe proxy Nginx SH-02.2](production/SH_02_NGINX_PROXY_REPORT.md)
- [Informe runtime, readiness y configuración SH-02.3](production/SH_02_RUNTIME_OPERATIONS_REPORT.md)
- [Cierre de integración SH-02](production/SH_02_CLOSURE_REPORT.md)
- [Plan QA funcional production-like SH-03](production/SH_03_QA_PLAN.md)
- [Informe QA de provisioning, Auth y roles SH-03.1](production/SH_03_AUTH_QA_REPORT.md)
- [Cierre core y baseline production-like SH-03.2A](production/SH_03_CORE_QA_REPORT.md)
- [Contrato PPO-03 de cargas y almacenamiento](production/PPO_03_UPLOAD_STORAGE_CONTRACT.md)
- [Diseño de cleanup PPO-03F.0](production/PPO_03F_CLEANUP_DESIGN.md)
- [Informe DB lifecycle PPO-03F.1](production/PPO_03F_DATABASE_LIFECYCLE_REPORT.md)
- [QA, freeze y handoff PPO-03F.3](production/PPO_03F_QA_FREEZE_REPORT.md)
- [Cierre de Solicitudes públicas PPO-03E](production/PPO_03_PUBLIC_SOLICITUD_UPLOAD_REPORT.md)
- [Auditoría de baseline self-hosted SH-01C](production/SH_01C_DATABASE_BASELINE_AUDIT.md)
- [Deuda técnica activa](development/TECH_DEBT.md)
