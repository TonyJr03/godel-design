# Preproducción y operación

Este índice concentra la documentación vigente para preproducción, auditorías,
arquitectura operativa y puesta en operación de Godel Diseño.

## Roadmaps activos

- [Roadmap PPO](PPO_ROADMAP.md): roadmap maestro de Preproducción y Puesta en
  Operación.
- [Roadmap Self-Hosted](SH_ROADMAP.md): workstream técnico subordinado a PPO
  para completar la transición a Supabase self-hosted.

## Documentos vigentes

- [SH-04.3D — Rotación segura de secretos](SH_04_SECRET_ROTATION_REPORT.md): cerrada y aprobada; D.6 PASS aceptó la rotación/recovery, con TARGET D5 actual, GEN7/GEN6 retenidas y forensics R1A del backup pre-cutover aprobada.

- [SH-04.3E — Compatibilidad recovery tras rotación](SH_04_SECRETS_AUTH_REPORT.md): cerrada, aprobada y PASS; la baseline D5 fue verificada y restaurada destructivamente con checkpoint defensivo distinto, preservando D5 `CURRENT / MATCH`. SH-04.3F es el siguiente workstream.

- [SH-04.3 — Production Secrets & Auth Hardening](SH_04_SECRETS_AUTH_REPORT.md): auditoría de secretos/Auth, contrato productivo, decisiones de hardening y evolución de SH-04.3.

- [SH-02.0 — Diseño de integración Godel ↔ Supabase self-hosted](SH_02_INTEGRATION_DESIGN.md): cerrada y aprobada; incluye el estado vigente de SH-02.
- [SH-02.1 — Compose, networking y naming neutral](SH_02_COMPOSE_NETWORK_REPORT.md): cerrada y aprobada.
- [SH-02.2 — Nginx proxy, URL split y routing TUS](SH_02_NGINX_PROXY_REPORT.md): cerrada y aprobada.
- [SH-02.3 — Runtime, readiness y configuración operativa](SH_02_RUNTIME_OPERATIONS_REPORT.md): cerrada y aprobada.
- [SH-02 — Cierre de integración Godel ↔ Supabase self-hosted](SH_02_CLOSURE_REPORT.md): cerrada y aprobada; entrega la topología técnica a SH-03.
- [SH-03 — Plan QA funcional production-like](SH_03_QA_PLAN.md): cerrada y aprobada, incluidas sus subfases y la regresión agregada.
- [SH-03.1 — Provisioning QA, Auth, session, roles y Auth Admin](SH_03_AUTH_QA_REPORT.md): cierre aprobado, evidencia self-hosted y handoff de compatibilidad para SH-03.2.
- [SH-03.2C — Solicitudes](SH_03_CORE_QA_REPORT.md): lifecycle por Nginx y fallback TD-NEXT-001 limitado por evidencia; cerrada y aprobada dentro de SH-03 cerrada.
- [PPO-03C.1 - Control plane DB de reservas y finalize](PPO_03_CONTROL_PLANE_REPORT.md): cerrada y aprobada localmente; validada administrada en PPO-03C.3B.
- [PPO-03C.2 - Infraestructura TypeScript de cargas directas](PPO_03_UPLOAD_APPLICATION_REPORT.md): cerrada con condición runtime en PPO-03D/E.
- [PPO-03C.3B - Gate HTTPS administrado](PPO_03_CONTROL_PLANE_MANAGED_REPORT.md): cerrada; valida reserva, TUS, staged aislado y finalize idempotente contra el backend administrado.
- [PPO-03F.0 — Diseño de expiración, reconciliación y cleanup](PPO_03F_CLEANUP_DESIGN.md): cerrada y aprobada arquitectónicamente.
- [PPO-03F.1 — Lifecycle DB, cleanup authority y amendment final](PPO_03F_DATABASE_LIFECYCLE_REPORT.md): cerrada y aprobada en baseline.
- [PPO-03F.2 — Executor server-only y operación manual de cleanup](PPO_03F_CLEANUP_EXECUTOR_REPORT.md): cerrada y aprobada.
- [PPO-03F.3 — QA, freeze y handoff](PPO_03F_QA_FREEZE_REPORT.md): cerrada y aprobada; cierra PPO-03F y congela la baseline 01–06.
- [Auditoría de baseline self-hosted SH-01C](SH_01C_DATABASE_BASELINE_AUDIT.md): evidencia aprobada de la baseline final de seis migraciones, fresh rebuild y validación de PostgreSQL, Auth y Storage.
- [PPO-03A.1 — Contrato de cargas y almacenamiento](PPO_03_UPLOAD_STORAGE_CONTRACT.md): arquitectura objetivo aprobada para transferencia directa, sesiones, finalización y reconciliación; no implementa todavía el nuevo flujo.
- [PPO-03A.2 — Informe de spike TUS y signed upload token](PPO_03_TUS_SPIKE_REPORT.md): evidencia local y veredicto aprobado con condiciones; habilita el inicio de PPO-03B.
- [PPO-03B — Informe DB, RLS y Storage](PPO_03_STORAGE_DB_REPORT.md): fase cerrada; control plane de sesiones/items y policies operation-aware validados localmente y por HTTPS administrado.
- [PPO-03B.2B — Validación HTTPS administrada de DB/Storage](PPO_03_STORAGE_MANAGED_REPORT.md): cerrada, aprobada con condición de integración para PPO-03C: reserva real, presigned administrado y staged no enumerable por actores no autorizados.
- [Plan de auditoría PPO-01](PPO_01_AUDIT_PLAN.md): contrato operativo para auditar infraestructura y conectividad.
- [Informe de capacidad PPO-01](PPO_01_CAPACITY_REPORT.md): plantilla para resultados resumidos y aprobados.
- [PPO-02 - Plan de contenerización](PPO_02_CONTAINERIZATION_PLAN.md): contrato y trazabilidad de la base contenerizada local cerrada con condiciones.
- [PPO-02A.2 - Spike técnico de empaquetado](PPO_02_PACKAGING_SPIKE.md): evidencia sanitizada de standalone, variables, secreto runtime y conectividad local.
- [PPO-02B.1 - Informe de imagen app](PPO_02_APP_IMAGE_REPORT.md): evidencia sanitizada del Dockerfile de aplicación, build, runtime, split-horizon y seguridad de imagen.
- [PPO-02B.2 - Informe de endurecimiento de imagen app](PPO_02_APP_IMAGE_HARDENING_REPORT.md): evidencia sanitizada de build reproducido, runtime read-only, tmpfs mínimos, SIGTERM y contrato operativo de secretos.
- [PPO-02C.1 - Informe de imagen Nginx](PPO_02_NGINX_IMAGE_REPORT.md): evidencia sanitizada de imagen Nginx no privilegiada, configuración proxy, smoke vía Nginx y fallo controlado de upstream.
- [PPO-02C.2 - Informe de Docker Compose](PPO_02_COMPOSE_REPORT.md): evidencia sanitizada de composición local, red interna, Nginx como única entrada, DNS dinámico, smokes, recursos y limpieza.
- [PPO-02D.1 - Informe de healthchecks](PPO_02_HEALTHCHECK_REPORT.md): evidencia sanitizada de liveness, readiness, healthchecks Compose, dependencia `service_healthy`, degradación y recuperación.
- [PPO-02D.2 - Validación con Supabase administrado](PPO_02_MANAGED_SUPABASE_REPORT.md): resultado `Aprobada con condiciones`; readiness administrado fue corregido con cabecera `apikey`, HTTPS con VPN activo funciona, baseline remota fue declarada aplicada manualmente y no se modifica backend remoto desde Codex.
- [PPO-02E.1 - Cierre de base contenerizada reproducible](PPO_02_CLOSURE.md): cierre técnico y handoff operativo de PPO-02 como base local reproducible aprobada con condiciones.
- [Cierre PPO-00](../preproduction/PPO_00_CLOSURE.md): baseline local cerrada que habilita PPO-01.

## Diferencia entre carpetas

- `docs/production/`: planes activos, auditorías, arquitectura operativa y
  documentos de puesta en operación. Esta carpeta gobierna el trabajo actual de
  PPO mientras cada fase esté activa o pendiente.
- `docs/preproduction/`: cierres o evidencias concretas ya existentes de las
  fases de preparación. Estos documentos conservan resultados aprobados, como
  el cierre de PPO-00.
- `docs/archive/`: documentación histórica que no gobierna el trabajo actual.
  Puede servir como contexto, pero no debe usarse como fuente primaria para
  cambiar contratos funcionales vigentes.

No se mueven archivos existentes como parte de PPO-01A.1.
