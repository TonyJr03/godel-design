# Estado del proyecto

Última actualización: 2026-07-31

## Estado general

Godel Diseño está en estado de MVP interno funcional. La baseline final de base
de datos está consolidada, el rediseño UI/UX está cerrado y la documentación
vigente ya queda separada del archivo histórico. La siguiente etapa recomendada
es preparación para preproducción.

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

- Hardening de preproducción.
- Protección antiabuso en rutas públicas.
- Estrategia operativa de archivos.
- Observabilidad y alertas.
- Configuración de despliegue y variables de entorno.
