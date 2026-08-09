# Estado del proyecto

Última actualización: 2026-08-09

## Estado general

Godel Diseño está en estado de MVP interno funcional. La baseline final de base
de datos está consolidada, el rediseño UI/UX está cerrado y la documentación
vigente ya queda separada del archivo histórico. La etapa activa es preparación
para preproducción mediante PPO.

PPO-00 está cerrada y su baseline local fue validada. PPO-01 continúa activa:
PPO-01B quedó cerrada, `development-laptop` fue clasificada `Apta con
condiciones` para construir y validar la composición contenerizada de PPO-02, y
PPO-01C queda diferida temporalmente por disponibilidad de `company-host`.
PPO-01D permanece pendiente y bloqueada hasta completar PPO-01C.

PPO-02 queda cerrada como base contenerizada reproducible aprobada con
condiciones para construcción y validación local en `development-laptop`.
PPO-02A.1 queda cerrada, PPO-02A.2 fue ejecutada como spike técnico reversible,
PPO-02A.3 formalizó el contrato de endpoints Supabase por contexto, PPO-02B
quedó cerrada para la imagen `app`, PPO-02C.1 implementó la imagen y
configuración de Nginx, PPO-02C.2 implementó Docker Compose y red interna local,
PPO-02C.3 queda absorbida en PPO-02C.2 por validación de límites y aislamiento,
PPO-02D.1 implementó healthchecks y dependencia operativa inicial, PPO-02D.2
queda aprobada con condiciones y PPO-02E.1 formalizó el cierre y handoff
operativo. Dirección Técnica declaró aplicada manualmente la baseline remota de
seis migraciones con VPN desactivado; Codex validó HTTPS administrado con VPN
activo y `compose.env.local` cumple el contrato local; la composición
administrada aprueba porque `/api/health/ready` envía la publishable key
existente como cabecera `apikey` a `/auth/v1/health` y devuelve 200 contra
Supabase administrado. La
evidencia soporta `output: "standalone"`, imagen app endurecida
`godel-design-app:ppo-02b2`, filesystem read-only con tmpfs mínimos,
`STOPSIGNAL SIGTERM`, imagen Nginx no privilegiada
`godel-design-nginx:ppo-02c1`, Compose con `app` y `nginx`, red bridge dedicada
`stack`, `app` sin puerto publicado, Nginx como único punto publicado en
`127.0.0.1`, resolución dinámica `app_backend`, liveness público, readiness
dependiente de Supabase server-side, `depends_on` con `service_healthy`,
límites iniciales, `pids_limit`, ejecución no root, `cap_drop=ALL`,
`no-new-privileges`, tmpfs mínimos, ausencia de Docker socket, ausencia de
montajes persistentes, reinicios, recreación local, `docker stats`, límites
efectivos vía Docker y split-horizon HTTP validado entre host y contenedor.

Esto no cierra PPO-01, no aprueba `company-host`, no declara despliegue en la
empresa y no presenta Cloudflare Tunnel ni el nuevo flujo de archivos como
implementados. No existe despliegue productivo. Supabase administrado ya tiene
baseline remota declarada por Dirección Técnica, HTTPS alcanzable desde Codex
con VPN activo y runtime contenerizado validado localmente mediante Nginx.
PPO-02D.1 queda aprobada localmente con condiciones; PPO-02D.2 formaliza
`compose.env.local` como archivo runtime ignorado por Git, conserva la
restricción ProTUN/PostgreSQL como condición administrativa y queda aprobada con
condiciones. PPO-02E.1 cierra PPO-02 sin cerrar PPO-01. PPO-QA-01 queda diferida
sin bloquear la transición hacia PPO-03.

PPO-03 inició en fase contractual con PPO-03A.1 y cerró PPO-03A.2 como
[Aprobada con condiciones](production/PPO_03_TUS_SPIKE_REPORT.md). PPO-03B.1
agregó y validó localmente el control plane de sesiones/items y policies
operation-aware de Storage, sin SQL remoto. El
[contrato de cargas y almacenamiento](production/PPO_03_UPLOAD_STORAGE_CONTRACT.md)
mantiene el path versionado con `storage_nonce`; no hay código de upload
productivo cambiado, las cargas vigentes continúan atravesando Server Actions y
se conservan los límites transitorios de 110 MB. PPO-03B queda cerrada:
PPO-03B.2B validó por HTTPS el backend administrado con VPN activo, control
plane cerrado para `anon` y authenticated, rutas `cargas/v1` sin reserva
rechazadas y compatibilidad legacy conservada. El listing devolvió cero objetos
visibles; sin un staged real no prueba la enumeración de staged. PPO-03C.1
implementó y validó localmente reserva, firma, transferencia y finalize.
PPO-03C.3A promovió manualmente la migración 08 y PPO-03C.3B completó el gate
administrado de staged real, TUS y finalize por HTTPS.

PPO-03C.1 queda cerrada y aprobada localmente. PPO-03C.2 queda cerrada y
aprobada con condición de integración runtime en PPO-03D/E. PPO-03C.3A promovió
manualmente la migración 08 y PPO-03C.3B validó por HTTPS el recorrido real de
reserva, TUS, staged aislado y finalize idempotente. PPO-03C queda cerrada;
PPO-03D es la siguiente fase.

Documentos vigentes:

- [Roadmap PPO](production/PPO_ROADMAP.md).
- [Plan de auditoría PPO-01](production/PPO_01_AUDIT_PLAN.md).
- [Informe de capacidad PPO-01](production/PPO_01_CAPACITY_REPORT.md).
- [Plan de contenerización PPO-02](production/PPO_02_CONTAINERIZATION_PLAN.md).
- [Spike técnico de empaquetado PPO-02A.2](production/PPO_02_PACKAGING_SPIKE.md).
- [Informe de imagen app PPO-02B.1](production/PPO_02_APP_IMAGE_REPORT.md).
- [Informe de endurecimiento de imagen app PPO-02B.2](production/PPO_02_APP_IMAGE_HARDENING_REPORT.md).
- [Informe de imagen Nginx PPO-02C.1](production/PPO_02_NGINX_IMAGE_REPORT.md).
- [Informe de Docker Compose PPO-02C.2](production/PPO_02_COMPOSE_REPORT.md).
- [Informe de healthchecks PPO-02D.1](production/PPO_02_HEALTHCHECK_REPORT.md).
- [Informe de Supabase administrado PPO-02D.2](production/PPO_02_MANAGED_SUPABASE_REPORT.md).
- [Cierre de base contenerizada PPO-02E.1](production/PPO_02_CLOSURE.md).
- [Contrato PPO-03A.1 de cargas y almacenamiento](production/PPO_03_UPLOAD_STORAGE_CONTRACT.md).
- [Informe de spike PPO-03A.2](production/PPO_03_TUS_SPIKE_REPORT.md).
- [Informe DB/Storage PPO-03B.1](production/PPO_03_STORAGE_DB_REPORT.md).
- [Validación HTTPS administrada PPO-03B.2B](production/PPO_03_STORAGE_MANAGED_REPORT.md).
- [Gate HTTPS administrado PPO-03C.3B](production/PPO_03_CONTROL_PLANE_MANAGED_REPORT.md).
- [Cierre PPO-00](preproduction/PPO_00_CLOSURE.md).

## PPO-03B — Cerrada

PPO-03B.1 está validada localmente tras corrección arquitectónica: la séptima migración crea el control plane
privado de sesiones e items de carga y restringe las operaciones nuevas de
Storage por reserva, rol, estado, expiración y operación. TUS interno admite
`create` y `part`; TUS público usa exclusivamente el endpoint firmado
`/upload/resumable/sign`, sin TUS regular anónimo. No se ha aplicado SQL
remoto ni se han cambiado los flujos actuales de upload; reserva, firma,
transferencia y finalize siguen pendientes en PPO-03C. PPO-03B.2A aplicó la
migración 07 administrada por Dirección Técnica y PPO-03B.2B validó sus APIs
HTTPS sin ejecutar PostgreSQL remoto. PPO-03B.2B queda cerrada, aprobada con la
condición de integración de listing/staged transferida a PPO-03C; la evidencia
está en [PPO-03B.2B](production/PPO_03_STORAGE_MANAGED_REPORT.md).
PPO-03B.1 y PPO-03B.2A también están cerradas; PPO-03C es la siguiente fase.

## Funcionalidades disponibles

- Solicitud pública.
- Consulta pública `/estado`.
- Login interno y dashboard por rol.
- Clientes.
- Solicitudes internas.
- Pedidos.
- Asignaciones de personal.
- Tareas de pedido.
- Plantillas de tareas.
- Archivos privados.
- Comentarios e historial.
- Pagos de pedido.
- Gestión de usuarios internos.
- Alta administrativa con Auth Admin.
- Cambio inicial obligatorio.
- Reset administrativo de contraseña.
- Catálogo operativo configurable de tipos de servicio.

El catálogo operativo de tipos de servicio no es un catálogo comercial, una
tienda online ni un carrito.

## Baseline de base de datos

Estado correcto: seis migraciones baseline y dos migraciones incrementales PPO-03:

1. `20260731000100_01_core_schema.sql`: enums, tablas, constraints, triggers base y servicios iniciales.
2. `20260731000200_02_security_rls_grants.sql`: RLS, policies y grants.
3. `20260731000300_03_business_rpcs.sql`: RPCs de negocio.
4. `20260731000400_04_storage.sql`: bucket privado, policies Storage y helpers.
5. `20260731000500_05_auth_admin_user_lifecycle.sql`: ciclo Auth Admin, auditorías privadas, provisioning y reset.
6. `20260731000600_06_final_hardening.sql`: assertions finales y hardening.
7. `20260809000100_07_ppo03b_upload_sessions_storage.sql`: sesiones/items de carga, control plane privado y policies Storage operation-aware.
8. `20260809000200_08_ppo03c_upload_control_plane.sql`: control plane de reserva y finalize, promovida manualmente por Dirección Técnica en PPO-03C.3A y validada por HTTPS en PPO-03C.3B; es inmutable.

## Servicios iniciales

- Nombre visible: `Impresión`.
- Nombre visible: `Otro`.
- Literal técnico: `workflow_type = impresion`.

Sus UUID se generan por PostgreSQL; no existen UUID fijos de servicios. El
servicio `Impresión` se identifica operativamente por `workflow_type =
impresion`. El resto del catálogo se configura desde la aplicación.

## Calidad

El estado validado actual se apoya en `npm.cmd run verify`, `npm.cmd run
diff:check`, auditorías de seguridad, E2E focales por dominio y reset local
reproducible de la base de datos. Esto describe el cierre conocido, no una
garantía permanente: cada cambio debe volver a ejecutar las validaciones que
apliquen.

## Deuda y siguientes pasos

La deuda técnica viva está en [development/TECH_DEBT.md](development/TECH_DEBT.md).
El baseline de rendimiento está en
[performance/PERFORMANCE_BASELINE.md](performance/PERFORMANCE_BASELINE.md).
Las reglas permanentes del proyecto viven en
[project-standards/README.md](project-standards/README.md), y el contexto de
fases cerradas está en [archive/README.md](archive/README.md). El índice general
de documentación está en [README.md](README.md).

Prioridades antes de exposición productiva:

- PPO-03 — rediseño de cargas y almacenamiento.
- Hardening de preproducción.
- Protección antiabuso en rutas públicas.
- Estrategia operativa de archivos.
- Observabilidad y alertas.
- Configuración de despliegue y variables de entorno.
