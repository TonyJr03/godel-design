# Estado del proyecto

Última actualización: 2026-08-04

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

PPO-02 está activa únicamente para construcción y validación local en
`development-laptop`, por decisión expresa de Dirección Técnica. PPO-02A.1
queda cerrada, PPO-02A.2 fue ejecutada como spike técnico reversible y
PPO-02A.3 formalizó el contrato de endpoints Supabase por contexto. La evidencia
soporta `output: "standalone"` para el empaquetado, la familia
`node:<major>-bookworm-slim` como base candidata, usuario no root, copia
explícita de `public` y `.next/static`, secretos solo en runtime y un resultado
local de conectividad Caso B para Supabase local resuelto mediante URL pública
para navegador y override server-only opcional para servidor.

Esto no cierra PPO-01, no aprueba `company-host`, no declara despliegue en la
empresa y no presenta Dockerfile definitivo, Docker Compose, Nginx, Cloudflare
Tunnel ni el nuevo flujo de archivos como implementados. No existe despliegue
productivo. Supabase administrado permanece pendiente. PPO-QA-01 queda diferida
sin bloquear la preparación local de PPO-02.

Documentos vigentes:

- [Roadmap PPO](production/PPO_ROADMAP.md).
- [Plan de auditoría PPO-01](production/PPO_01_AUDIT_PLAN.md).
- [Informe de capacidad PPO-01](production/PPO_01_CAPACITY_REPORT.md).
- [Plan de contenerización PPO-02](production/PPO_02_CONTAINERIZATION_PLAN.md).
- [Spike técnico de empaquetado PPO-02A.2](production/PPO_02_PACKAGING_SPIKE.md).
- [Cierre PPO-00](preproduction/PPO_00_CLOSURE.md).

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

Estado correcto: seis migraciones consolidadas:

1. `20260731000100_01_core_schema.sql`: enums, tablas, constraints, triggers base y servicios iniciales.
2. `20260731000200_02_security_rls_grants.sql`: RLS, policies y grants.
3. `20260731000300_03_business_rpcs.sql`: RPCs de negocio.
4. `20260731000400_04_storage.sql`: bucket privado, policies Storage y helpers.
5. `20260731000500_05_auth_admin_user_lifecycle.sql`: ciclo Auth Admin, auditorías privadas, provisioning y reset.
6. `20260731000600_06_final_hardening.sql`: assertions finales y hardening.

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

- Ejecutar como siguiente checkpoint PPO-02B.1: implementación del Dockerfile de aplicación, usando el contrato de endpoints Supabase aprobado en PPO-02A.3.
- Hardening de preproducción.
- Protección antiabuso en rutas públicas.
- Estrategia operativa de archivos.
- Observabilidad y alertas.
- Configuración de despliegue y variables de entorno.
