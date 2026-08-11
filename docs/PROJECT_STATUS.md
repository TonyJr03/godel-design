# Estado del proyecto

Última actualización: 2026-08-11

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

La baseline activa contiene exactamente seis migraciones consolidadas:

1. `20260811131824_01_core_schema.sql`
2. `20260811131825_02_security_rls_grants.sql`
3. `20260811131826_03_business_rpcs.sql`
4. `20260811131827_04_storage.sql`
5. `20260811131828_05_auth_admin_user_lifecycle.sql`
6. `20260811131829_06_final_hardening.sql`

La baseline self-hosted aprobó fresh rebuild, 6/6 migraciones, DB lint, Storage
QA, tipos generados y build. Las antiguas migraciones incrementales 07/08
pertenecen a la historia previa a SH-01C; sus responsabilidades quedaron
absorbidas en la baseline consolidada y no forman parte de una instalación
actual.

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
| PPO-03F | Siguiente bloque funcional |
| PPO-03G | Pendiente |
| PPO-03 | Activa |

PPO-03D/E ya trasladaron los bytes de archivos del navegador directamente a
Storage por TUS. PPO-03F abordará expiración, reconciliación y cleanup; PPO-03G
mantiene el gate final de infraestructura y retirada de límites transitorios.

## Workstream self-hosted

SH completa la transición desde la arquitectura previa hacia Supabase
self-hosted:

| Bloque | Estado |
| --- | --- |
| SH-01 | Cerrado / aprobado |
| SH-02 | Pendiente |
| SH-03 | Pendiente |
| SH-04 | Pendiente |
| SH-05 | Pendiente |

La orquestación definitiva entre PPO y SH se decidirá por separado con
Dirección Técnica.

## Capacidades disponibles

- Solicitud pública y tracking público `/estado`.
- Dashboard interno por rol, clientes, solicitudes, pedidos y tareas.
- Archivos privados con control plane de reserva, TUS y finalize.
- Comentarios, historial, pagos y administración de usuarios internos.

## Documentación vigente

- [Roadmap PPO](production/PPO_ROADMAP.md)
- [Contrato PPO-03 de cargas y almacenamiento](production/PPO_03_UPLOAD_STORAGE_CONTRACT.md)
- [Cierre de Solicitudes públicas PPO-03E](production/PPO_03_PUBLIC_SOLICITUD_UPLOAD_REPORT.md)
- [Auditoría de baseline self-hosted SH-01C](production/SH_01C_DATABASE_BASELINE_AUDIT.md)
- [Deuda técnica activa](development/TECH_DEBT.md)
