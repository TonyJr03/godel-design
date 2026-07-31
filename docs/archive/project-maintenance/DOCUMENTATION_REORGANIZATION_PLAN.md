# Plan de reorganización documental

Fecha de plan: 2026-07-31.

Rama de trabajo: `docs/archive-development-history`.
SHA base: `cb24593674e01f7a652333d371afaab844cb0ed1`.

## 1. Objetivo

Separar la documentación vigente de Godel Diseño de la documentación histórica
de fases, auditorías, planes y cierres, sin perder trazabilidad. Esta fase no
ejecuta movimientos; deja una matriz y un plan suficientemente exactos para una
fase posterior.

## 2. Alcance

Incluye todos los Markdown reales encontrados fuera de `node_modules`, `.next`,
`playwright-report` y `test-results`.

No incluye modificaciones de código, SQL, migraciones, enlaces actuales ni
indices actuales. Los únicos archivos creados en esta fase son:

- `docs/development/DOCUMENTATION_REORGANIZATION_INVENTORY.md`
- `docs/development/DOCUMENTATION_REORGANIZATION_PLAN.md`

## 3. Estructura actual

Inventario real:

| Ubicación | Total |
| --- | ---: |
| Raiz y control de agentes | 3 |
| `.codex/skills/` | 3 |
| `docs/` raíz | 13 |
| `docs/development/` | 32 |
| `docs/performance/` | 3 |
| `docs/project-standards/` | 12 |
| `docs/ui-ux/` | 22 |
| `src/lib/**/README.md` | 12 |

Totales base antes de crear los artefactos de esta fase:

- 98 Markdown totales.
- 80 dentro de `docs/`.
- 30 dentro de `docs/development/`.

Totales actuales de la rama:

- 100 Markdown totales.
- 82 dentro de `docs/`.
- 32 dentro de `docs/development/`.

El árbol mezcla tres cosas distintas dentro de `docs/development/` y
`docs/ui-ux/`: guias operativas vivas, auditorías/cierres cerrados y contratos
vigentes nacidos en etapas históricas.

## 4. Problemas detectados

- `docs/development/` combina guias vigentes (`LOCAL_DEVELOPMENT.md`,
  `AUTH_LOCAL.md`, `TECH_DEBT.md`) con roadmaps, auditorías y cierres cerrados.
- `docs/ui-ux/` contiene especificaciones vigentes junto a planes de etapas y
  reportes QA ya cerrados.
- `docs/performance/` mezcla baseline vigente con plan/cierre histórico de
  Etapa 15.
- Hay contradicciones documentales sobre usuarios: textos legacy dicen que la
  app no crea credenciales Auth y que se crean perfiles por UUID Auth existente,
  mientras el estado actual usa Auth Admin server-only.
- Hay contradicciones temporales sobre DB: documentos históricos hablan de 21
  migraciones fuente o cinco migraciones consolidadas; el estado actual correcto
  es de seis migraciones consolidadas.
- Hay deuda viva dispersa entre `TECH_DEBT.md` y `BETA_2_TECHNICAL_DEBT.md`.
- Los indices actuales no anuncian `docs/archive/` ni un estado breve vigente
  tipo `docs/PROJECT_STATUS.md`.
- Las reglas de Auth Admin están documentadas con prohibiciones demasiado
  absolutas en `AGENTS.md`, `README.md`, `SECURITY_RULES.md` y
  `ARCHITECTURE_RULES.md`.
- `AUTH_LOCAL.md` todavía menciona `SERVICE_ROLE_KEY` como fallback local, lo
  que debe retirarse del contrato de aplicación.

## 5. Estructura final propuesta

```text
docs/
|-- README.md
|-- PROJECT_STATUS.md
|-- CLIENTS_FLOW.md
|-- COMMENTS_AND_HISTORY_MODEL.md
|-- CONVENCIONES_UI_UX_GODEL.md
|-- DASHBOARD_OPERATIVE_MODEL.md
|-- DATABASE_MODEL.md
|-- INTERNAL_REQUESTS_FLOW.md
|-- ORDER_ASSIGNMENTS_FLOW.md
|-- ORDERS_FLOW.md
|-- PERMISSIONS_MODEL.md
|-- PUBLIC_REQUEST_FLOW.md
|-- STORAGE_MODEL.md
|-- USERS_MANAGEMENT_MODEL.md
|-- project-standards/
|-- ui-ux/
|   |-- README.md
|   |-- FASE_14_DESIGN_SYSTEM.md
|   |-- INTERNAL_LISTINGS_SPEC.md
|   |-- INTERNAL_SHELL_SPEC.md
|   |-- TRANSVERSAL_STATES_DECISION_MATRIX.md
|   `-- WORKSPACE_INTERACTION_SPEC.md
|-- development/
|   |-- README.md
|   |-- AUTH_LOCAL.md
|   |-- LOCAL_DEVELOPMENT.md
|   `-- TECH_DEBT.md
|-- performance/
|   |-- README.md
|   `-- PERFORMANCE_BASELINE.md
`-- archive/
    |-- README.md
    |-- initial-development/
    |-- beta-1-database/
    |-- beta-2-architecture/
    |-- alfa-features/
    |-- database-baseline/
    |-- ui-ux-redesign/
    |-- performance-stages/
    `-- project-maintenance/
```

Ajuste recomendado: no crear `docs/archive/beta-2-qa/` por ahora. Los docs de
QA Beta 2 pertenecen al cierre arquitectónico de Beta 2 y no justifican otra
carpeta con pocos archivos.

`docs/archive/project-maintenance/` guardara inventarios, planes y reportes de
mantenimiento transversal del repositorio que ya fueron ejecutados y no
gobiernan el estado vigente.

## 6. Documentos vigentes

Principales documentos estables que deben permanecer visibles:

- `docs/CLIENTS_FLOW.md`
- `docs/COMMENTS_AND_HISTORY_MODEL.md`
- `docs/DATABASE_MODEL.md`
- `docs/INTERNAL_REQUESTS_FLOW.md`
- `docs/ORDER_ASSIGNMENTS_FLOW.md`
- `docs/ORDERS_FLOW.md`
- `docs/PUBLIC_REQUEST_FLOW.md`
- `docs/STORAGE_MODEL.md`
- `docs/USERS_MANAGEMENT_MODEL.md`
- `docs/project-standards/README.md`
- `docs/project-standards/DATABASE_RULES.md`
- `docs/project-standards/QA_AND_REPORTING.md`
- `docs/project-standards/checklists/**`
- `src/lib/**/README.md`

Vigentes con actualización necesaria:

- `docs/README.md`
- `README.md`
- `AGENTS.md`
- `docs/CONVENCIONES_UI_UX_GODEL.md`
- `docs/DASHBOARD_OPERATIVE_MODEL.md`
- `docs/PERMISSIONS_MODEL.md`
- `docs/project-standards/ARCHITECTURE_RULES.md`
- `docs/project-standards/SECURITY_RULES.md`
- `docs/development/README.md`
- `docs/development/AUTH_LOCAL.md`
- `docs/development/TECH_DEBT.md`
- `docs/ui-ux/FASE_14_DESIGN_SYSTEM.md`
- `docs/ui-ux/INTERNAL_LISTINGS_SPEC.md`
- `docs/ui-ux/INTERNAL_SHELL_SPEC.md`
- `docs/ui-ux/TRANSVERSAL_STATES_DECISION_MATRIX.md`
- `docs/ui-ux/WORKSPACE_INTERACTION_SPEC.md`
- `src/lib/usuarios/README.md`

## 7. Documentos operativos de desarrollo

Deben permanecer fuera del archivo histórico:

- `.codex/skills/godel-authenticated-visual-qa/SKILL.md`
- `.codex/skills/godel-supabase-migration-qa/SKILL.md`
- `.codex/skills/ui-ux-pro-max/SKILL.md`
- `docs/development/LOCAL_DEVELOPMENT.md`
- `docs/development/DOCUMENTATION_REORGANIZATION_INVENTORY.md` hasta completar
  y validar la reorganización.
- `docs/development/DOCUMENTATION_REORGANIZATION_PLAN.md` hasta completar y
  validar la reorganización.
- `docs/performance/PERFORMANCE_BASELINE.md`

## 8. Documentos históricos

Historicos a archivar por etapa o dominio:

- Desarrollo inicial: `ROADMAP.md`, `TECHNICAL_AUDIT.md`.
- Beta 1 database: auditoría DB, plan de consolidación, reportes y cierre Beta
  1.
- Alfa features: checklists de workflow, tracking, plantillas y pagos.
- Beta 2 architecture: auditorías de dominio, QA tooling y cierres.
- Database baseline: inventario y plan usados para diseñar las seis migraciones
  finales.
- UI/UX redesign: auditorías, planes y cierres de Etapas 10-16 que no son
  contratos vigentes.
- Performance stages: plan y cierre de Etapa 15.
- Project maintenance: estos dos documentos de planificacion, movidos al final
  de la siguiente fase.

## 9. Documentos que necesitan actualización

| Documento | Motivo | Acción recomendada |
| --- | --- | --- |
| `README.md` | Seguridad Auth Admin y descripción de `docs/development` requieren precision | Aclarar adaptador server-only y archivo histórico |
| `AGENTS.md` | Reglas absolutas de secretos/Auth Admin deben distinguir el caso server-only permitido | Actualizar reglas breves sin habilitar cliente general administrativo |
| `docs/README.md` | No diferencia archivo histórico ni `PROJECT_STATUS.md` | Reescribir indice vigente |
| `docs/development/README.md` | Lista parcial, mezcla vivos e históricos | Reducir a guias vivas y enlazar archivo |
| `docs/CONVENCIONES_UI_UX_GODEL.md` | Enlaza auditorías/cierres de Fase 14 que se moveran | Actualizar referencias y dejar solo enlaces de soporte |
| `docs/DASHBOARD_OPERATIVE_MODEL.md` | Recomienda modificar `ROADMAP.md` | Cambiar a `TECH_DEBT.md` o `PROJECT_STATUS.md` según caso |
| `docs/PERMISSIONS_MODEL.md` | Sección usuarios conserva alta legacy por UUID Auth | Actualizar a Auth Admin User Lifecycle |
| `docs/project-standards/ARCHITECTURE_RULES.md` | `Servicios de dominio` y `Seguridad` no reconocen el adaptador Auth Admin especializado | Aclarar usos permitidos/prohibidos |
| `docs/project-standards/SECURITY_RULES.md` | Prohibiciones absolutas no distinguen cliente normal de Auth Admin server-only | Reescribir reglas de secretos y cliente administrativo |
| `docs/development/AUTH_LOCAL.md` | Mantiene `SERVICE_ROLE_KEY` como fallback local | Eliminar fallback y exigir `SUPABASE_SECRET_KEY` server-only |
| `docs/development/TECH_DEBT.md` | Debe absorber deuda aceptada de Beta 2 y orientar preproducción | Fusionar pendientes vivos |
| `docs/performance/PERFORMANCE_BASELINE.md` | Enlaza cierre histórico movido | Actualizar enlace a archivo |
| `docs/ui-ux/FASE_14_DESIGN_SYSTEM.md` | Contrato vigente con lenguaje de subfase | Separar contrato vivo de secuencia histórica |
| `docs/ui-ux/INTERNAL_LISTINGS_SPEC.md` | Mantiene contexto de patrón retirado | Dejar contexto histórico resumido |
| `docs/ui-ux/INTERNAL_SHELL_SPEC.md` | Enlaza QA report cerrado | Actualizar enlace a archivo |
| `docs/ui-ux/TRANSVERSAL_STATES_DECISION_MATRIX.md` | Contiene referencias de cierre histórico | Mantener matriz, archivar links de cierre |
| `docs/ui-ux/WORKSPACE_INTERACTION_SPEC.md` | Tiene registro histórico de implementación al final | Conservar contrato y mover/resumir registro |
| `src/lib/storage/README.md` | Enlaza auditoría Beta 2.6 movida | Actualizar enlace |
| `src/lib/usuarios/README.md` | Limita `createAdminClient` a `create-internal-user.ts`; ahora también lo usan reset y cambio inicial | Ajustar regla a Auth Admin server-only y usos permitidos |

## 10. Duplicados o documentos superados

| Documento | Documento/estado que lo supera | Acción |
| --- | --- | --- |
| `CLAUDE.md` | `AGENTS.md` | Conservar como alias, sin archivarlo |
| `docs/development/BETA_2_TECHNICAL_DEBT.md` | `docs/development/TECH_DEBT.md` debe ser registro vivo único | Fusionar deuda viva y archivar registro Beta 2 |

## 11. Movimientos exactos

```text
docs/development/TECHNICAL_AUDIT.md
-> docs/archive/initial-development/TECHNICAL_AUDIT.md

docs/development/ROADMAP.md
-> docs/archive/initial-development/ROADMAP.md

docs/development/ALFA_1_WORKFLOW_TYPE_CHECKLIST.md
-> docs/archive/alfa-features/ALFA_1_WORKFLOW_TYPE_CHECKLIST.md

docs/development/ALFA_2_PUBLIC_TRACKING_CHECKLIST.md
-> docs/archive/alfa-features/ALFA_2_PUBLIC_TRACKING_CHECKLIST.md

docs/development/ALFA_3_TASK_TEMPLATES_CHECKLIST.md
-> docs/archive/alfa-features/ALFA_3_TASK_TEMPLATES_CHECKLIST.md

docs/development/ALFA_4_PAYMENTS_CHECKLIST.md
-> docs/archive/alfa-features/ALFA_4_PAYMENTS_CHECKLIST.md

docs/development/BETA_1_DB_AUDIT.md
-> docs/archive/beta-1-database/BETA_1_DB_AUDIT.md

docs/development/BETA_1_MIGRATION_CONSOLIDATION_PLAN.md
-> docs/archive/beta-1-database/BETA_1_MIGRATION_CONSOLIDATION_PLAN.md

docs/development/BETA_1_7_CONSOLIDATED_RESET_REPORT.md
-> docs/archive/beta-1-database/BETA_1_7_CONSOLIDATED_RESET_REPORT.md

docs/development/BETA_1_8_FUNCTIONAL_QA_REPORT.md
-> docs/archive/beta-1-database/BETA_1_8_FUNCTIONAL_QA_REPORT.md

docs/development/BETA_1_CLOSURE_REPORT.md
-> docs/archive/beta-1-database/BETA_1_CLOSURE_REPORT.md

docs/development/BETA_2_CODE_AUDIT.md
-> docs/archive/beta-2-architecture/BETA_2_CODE_AUDIT.md

docs/development/BETA_2_4_SOLICITUDES_AUDIT.md
-> docs/archive/beta-2-architecture/BETA_2_4_SOLICITUDES_AUDIT.md

docs/development/BETA_2_5_CLIENTES_USUARIOS_PERMISOS_AUDIT.md
-> docs/archive/beta-2-architecture/BETA_2_5_CLIENTES_USUARIOS_PERMISOS_AUDIT.md

docs/development/BETA_2_6_STORAGE_AUDIT.md
-> docs/archive/beta-2-architecture/BETA_2_6_STORAGE_AUDIT.md

docs/development/BETA_2_7_DASHBOARD_AUDIT.md
-> docs/archive/beta-2-architecture/BETA_2_7_DASHBOARD_AUDIT.md

docs/development/BETA_2_8_TASK_TEMPLATES_AUDIT.md
-> docs/archive/beta-2-architecture/BETA_2_8_TASK_TEMPLATES_AUDIT.md

docs/development/BETA_2_9_FOCAL_QA_MATRIX.md
-> docs/archive/beta-2-architecture/BETA_2_9_FOCAL_QA_MATRIX.md

docs/development/BETA_2_9_QA_TOOLING_AUDIT.md
-> docs/archive/beta-2-architecture/BETA_2_9_QA_TOOLING_AUDIT.md

docs/development/BETA_2_9_QA_TOOLING_STRATEGY.md
-> docs/archive/beta-2-architecture/BETA_2_9_QA_TOOLING_STRATEGY.md

docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md
-> docs/archive/beta-2-architecture/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md

docs/development/BETA_2_FINAL_CLOSURE.md
-> docs/archive/beta-2-architecture/BETA_2_FINAL_CLOSURE.md

docs/development/BETA_2_TECHNICAL_DEBT.md
-> docs/archive/beta-2-architecture/BETA_2_TECHNICAL_DEBT.md

docs/development/FINAL_DATABASE_MIGRATION_INVENTORY.md
-> docs/archive/database-baseline/FINAL_DATABASE_MIGRATION_INVENTORY.md

docs/development/FINAL_DATABASE_BASELINE_PLAN.md
-> docs/archive/database-baseline/FINAL_DATABASE_BASELINE_PLAN.md

docs/development/PRE_UIUX_TECHNICAL_HARDENING.md
-> docs/archive/ui-ux-redesign/PRE_UIUX_TECHNICAL_HARDENING.md

docs/performance/PERFORMANCE_STAGE_15_PLAN.md
-> docs/archive/performance-stages/PERFORMANCE_STAGE_15_PLAN.md

docs/performance/STAGE_15_CLOSURE.md
-> docs/archive/performance-stages/STAGE_15_CLOSURE.md

docs/ui-ux/ADMIN_CONFIG_STAGE_10_PLAN.md
-> docs/archive/ui-ux-redesign/ADMIN_CONFIG_STAGE_10_PLAN.md

docs/ui-ux/AUDITORIA_POST_BETA_2_PRE_REDISENO.md
-> docs/archive/ui-ux-redesign/AUDITORIA_POST_BETA_2_PRE_REDISENO.md

docs/ui-ux/DASHBOARD_WORKSPACE_STAGE_11_PLAN.md
-> docs/archive/ui-ux-redesign/DASHBOARD_WORKSPACE_STAGE_11_PLAN.md

docs/ui-ux/DASHBOARD_WORKSPACE_STAGE_11_QA_REPORT.md
-> docs/archive/ui-ux-redesign/DASHBOARD_WORKSPACE_STAGE_11_QA_REPORT.md

docs/ui-ux/FASE_14_AUDITORIA_UI_UX.md
-> docs/archive/ui-ux-redesign/FASE_14_AUDITORIA_UI_UX.md

docs/ui-ux/FASE_14_CIERRE_UI_UX.md
-> docs/archive/ui-ux-redesign/FASE_14_CIERRE_UI_UX.md

docs/ui-ux/FASE_14_REVISION_RESPONSIVE.md
-> docs/archive/ui-ux-redesign/FASE_14_REVISION_RESPONSIVE.md

docs/ui-ux/INTERNAL_FORMS_STAGE_12_PLAN.md
-> docs/archive/ui-ux-redesign/INTERNAL_FORMS_STAGE_12_PLAN.md

docs/ui-ux/INTERNAL_SHELL_QA_REPORT.md
-> docs/archive/ui-ux-redesign/INTERNAL_SHELL_QA_REPORT.md

docs/ui-ux/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md
-> docs/archive/ui-ux-redesign/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md

docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md
-> docs/archive/ui-ux-redesign/POST_BETA_2_UI_UX_ROADMAP.md

docs/ui-ux/PUBLIC_AREA_STAGE_13_PLAN.md
-> docs/archive/ui-ux-redesign/PUBLIC_AREA_STAGE_13_PLAN.md

docs/ui-ux/STAGE_12_QA_CLOSURE.md
-> docs/archive/ui-ux-redesign/STAGE_12_QA_CLOSURE.md

docs/ui-ux/STAGE_13_QA_CLOSURE.md
-> docs/archive/ui-ux-redesign/STAGE_13_QA_CLOSURE.md

docs/ui-ux/STAGE_14_QA_CLOSURE.md
-> docs/archive/ui-ux-redesign/STAGE_14_QA_CLOSURE.md

docs/ui-ux/STAGE_16_FINAL_QA_CLOSURE.md
-> docs/archive/ui-ux-redesign/STAGE_16_FINAL_QA_CLOSURE.md

docs/ui-ux/TRANSVERSAL_STATES_STAGE_14_PLAN.md
-> docs/archive/ui-ux-redesign/TRANSVERSAL_STATES_STAGE_14_PLAN.md

docs/development/DOCUMENTATION_REORGANIZATION_INVENTORY.md
-> docs/archive/project-maintenance/DOCUMENTATION_REORGANIZATION_INVENTORY.md

docs/development/DOCUMENTATION_REORGANIZATION_PLAN.md
-> docs/archive/project-maintenance/DOCUMENTATION_REORGANIZATION_PLAN.md
```

Los dos movimientos hacia `docs/archive/project-maintenance/` se realizan al
final de la siguiente fase, después de completar la reorganización, validar
enlaces y confirmar que estos artefactos ya no gobiernan el estado vigente.

## 12. Nuevos indices y README

Crear en fase posterior:

- `docs/archive/README.md`
- `docs/ui-ux/README.md`
- `docs/performance/README.md`

Actualizar en fase posterior:

- `docs/README.md`
- `docs/development/README.md`

Contenido esperado:

- `docs/README.md`: entrada principal; separa documentos funcionales, estado del
  proyecto, reglas permanentes, desarrollo, UI/UX, rendimiento y archivo.
- `docs/development/README.md`: solo guias operativas vivas y deuda técnica.
- `docs/ui-ux/README.md`: contratos visuales vigentes; archivo histórico solo
  como enlace secundario.
- `docs/performance/README.md`: baseline vigente y criterio para nuevas
  mediciones.
- `docs/archive/README.md`: mapa histórico por etapa/dominio, sin presentarlo
  como instrucciones actuales.

## 13. Diseño de `docs/PROJECT_STATUS.md`

No crear todavía. Contenido propuesto:

```text
# Estado del proyecto

Última actualización: 2026-07-31

## Estado general

MVP interno funcional.
Baseline final de base de datos consolidada.
Rediseño UI/UX cerrado.
Documentación vigente separada del archivo histórico.
Siguiente etapa: preparación para preproducción.

## Funcionalidades disponibles

- Solicitud pública.
- Consulta pública `/estado`.
- Login interno y dashboard por rol.
- Clientes.
- Solicitudes internas.
- Pedidos, tareas, asignaciones, archivos, comentarios, historial y pagos.
- Usuarios internos con alta Auth Admin, cambio inicial y reset administrativo.
- Catalogo operativo configurable de tipos de servicio, con `Impresión` y
  `Otro` como servicios iniciales.

No es un catalogo comercial, una tienda online ni un carrito.

## Baseline de base de datos

Estado correcto: seis migraciones consolidadas:

1. `01_core_schema`: enums, tablas, constraints, triggers base, servicios iniciales.
2. `02_security_rls_grants`: RLS, policies y grants.
3. `03_business_rpcs`: RPCs de negocio.
4. `04_storage`: bucket privado, policies Storage y helpers.
5. `05_auth_admin_user_lifecycle`: Auth Admin, auditorias privadas, provisioning y reset.
6. `06_final_hardening`: assertions finales y hardening.

## Servicios iniciales

- `Impresión`.
- `Otro`.

Sus UUID se generan por base de datos. El resto del catalogo se configura desde
la aplicacion.

## UI/UX

Fase de rediseño cerrada; guía principal: `docs/CONVENCIONES_UI_UX_GODEL.md`.

## Pruebas y auditorias

Usar `npm.cmd run verify`, `npm.cmd run diff:check` y auditorias especificas
segun cambio. Los cierres historicos viven en `docs/archive/`.

## Deuda técnica viva

Fuente: `docs/development/TECH_DEBT.md`.

## Documentos estables principales

Lista corta con enlaces a modelos funcionales y reglas permanentes.
```

## 14. Enlaces que deben actualizarse

Búsqueda ejecutada:

```bash
rg -n "\]\([^)]*\.md(?:#[^)]*)?\)" . -g "*.md" -g "!node_modules/**" -g "!.next/**"
rg -n "docs/[A-Za-z0-9_./-]+\.md" . -g "*.md" -g "*.ts" -g "*.tsx" -g "*.js" -g "*.mjs" -g "!node_modules/**" -g "!.next/**"
```

Tabla de cambios requeridos para rutas movidas:

| Ruta actual | Referenciada desde | Nuevo destino | Cambio requerido |
| --- | --- | --- | --- |
| `docs/development/ROADMAP.md` | `docs/DASHBOARD_OPERATIVE_MODEL.md`, `docs/development/TECHNICAL_AUDIT.md`, `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md`, `docs/development/PRE_UIUX_TECHNICAL_HARDENING.md` | `docs/archive/initial-development/ROADMAP.md` | Actualizar rutas; en docs vigentes preferir `PROJECT_STATUS.md` o `TECH_DEBT.md` |
| `docs/development/ALFA_1_WORKFLOW_TYPE_CHECKLIST.md` | `docs/development/ROADMAP.md` | `docs/archive/alfa-features/ALFA_1_WORKFLOW_TYPE_CHECKLIST.md` | Actualizar enlace histórico |
| `docs/development/BETA_1_DB_AUDIT.md` | `docs/development/BETA_1_CLOSURE_REPORT.md` | `docs/archive/beta-1-database/BETA_1_DB_AUDIT.md` | Actualizar enlace histórico |
| `docs/development/BETA_1_MIGRATION_CONSOLIDATION_PLAN.md` | `docs/development/BETA_1_CLOSURE_REPORT.md` | `docs/archive/beta-1-database/BETA_1_MIGRATION_CONSOLIDATION_PLAN.md` | Actualizar enlace histórico |
| `docs/development/BETA_1_7_CONSOLIDATED_RESET_REPORT.md` | `docs/development/BETA_1_CLOSURE_REPORT.md` | `docs/archive/beta-1-database/BETA_1_7_CONSOLIDATED_RESET_REPORT.md` | Actualizar enlace histórico |
| `docs/development/BETA_1_8_FUNCTIONAL_QA_REPORT.md` | `docs/development/BETA_1_CLOSURE_REPORT.md`, autorreferencias internas | `docs/archive/beta-1-database/BETA_1_8_FUNCTIONAL_QA_REPORT.md` | Actualizar enlace histórico |
| `docs/development/BETA_2_CODE_AUDIT.md` | `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md`, `docs/development/BETA_2_FINAL_CLOSURE.md` | `docs/archive/beta-2-architecture/BETA_2_CODE_AUDIT.md` | Actualizar enlaces históricos |
| `docs/development/BETA_2_4_SOLICITUDES_AUDIT.md` | `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md`, `docs/development/BETA_2_FINAL_CLOSURE.md` | `docs/archive/beta-2-architecture/BETA_2_4_SOLICITUDES_AUDIT.md` | Actualizar enlaces históricos |
| `docs/development/BETA_2_5_CLIENTES_USUARIOS_PERMISOS_AUDIT.md` | `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md`, `docs/development/BETA_2_FINAL_CLOSURE.md` | `docs/archive/beta-2-architecture/BETA_2_5_CLIENTES_USUARIOS_PERMISOS_AUDIT.md` | Actualizar enlaces históricos |
| `docs/development/BETA_2_6_STORAGE_AUDIT.md` | `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md`, `docs/development/BETA_2_FINAL_CLOSURE.md`, `src/lib/storage/README.md` | `docs/archive/beta-2-architecture/BETA_2_6_STORAGE_AUDIT.md` | Actualizar enlace desde README de dominio |
| `docs/development/BETA_2_7_DASHBOARD_AUDIT.md` | `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md`, `docs/development/BETA_2_FINAL_CLOSURE.md` | `docs/archive/beta-2-architecture/BETA_2_7_DASHBOARD_AUDIT.md` | Actualizar enlaces históricos |
| `docs/development/BETA_2_8_TASK_TEMPLATES_AUDIT.md` | `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md`, `docs/development/BETA_2_FINAL_CLOSURE.md` | `docs/archive/beta-2-architecture/BETA_2_8_TASK_TEMPLATES_AUDIT.md` | Actualizar enlaces históricos |
| `docs/development/BETA_2_9_QA_TOOLING_AUDIT.md` | `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md`, `docs/development/BETA_2_FINAL_CLOSURE.md`, `docs/development/BETA_2_9_FOCAL_QA_MATRIX.md` | `docs/archive/beta-2-architecture/BETA_2_9_QA_TOOLING_AUDIT.md` | Actualizar enlaces históricos |
| `docs/development/BETA_2_9_FOCAL_QA_MATRIX.md` | `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md`, `docs/development/BETA_2_FINAL_CLOSURE.md` | `docs/archive/beta-2-architecture/BETA_2_9_FOCAL_QA_MATRIX.md` | Actualizar enlaces históricos |
| `docs/development/BETA_2_9_QA_TOOLING_STRATEGY.md` | `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md`, `docs/development/BETA_2_FINAL_CLOSURE.md`, `docs/development/BETA_2_9_FOCAL_QA_MATRIX.md`, `docs/development/BETA_2_9_QA_TOOLING_AUDIT.md` | `docs/archive/beta-2-architecture/BETA_2_9_QA_TOOLING_STRATEGY.md` | Actualizar enlaces históricos |
| `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md` | `docs/development/BETA_2_FINAL_CLOSURE.md` | `docs/archive/beta-2-architecture/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md` | Actualizar enlace histórico |
| `docs/development/BETA_2_FINAL_CLOSURE.md` | `docs/development/ROADMAP.md` | `docs/archive/beta-2-architecture/BETA_2_FINAL_CLOSURE.md` | Actualizar enlace histórico |
| `docs/development/BETA_2_TECHNICAL_DEBT.md` | `docs/development/ROADMAP.md`, `docs/development/BETA_2_FINAL_CLOSURE.md` | `docs/archive/beta-2-architecture/BETA_2_TECHNICAL_DEBT.md` | Fusionar deuda viva antes; actualizar enlace a archivo |
| `docs/development/FINAL_DATABASE_MIGRATION_INVENTORY.md` | `docs/development/FINAL_DATABASE_BASELINE_PLAN.md` y autorreferencias | `docs/archive/database-baseline/FINAL_DATABASE_MIGRATION_INVENTORY.md` | Actualizar enlaces históricos |
| `docs/development/FINAL_DATABASE_BASELINE_PLAN.md` | referencias históricas de fase DB | `docs/archive/database-baseline/FINAL_DATABASE_BASELINE_PLAN.md` | Actualizar enlaces históricos |
| `docs/development/PRE_UIUX_TECHNICAL_HARDENING.md` | referencias históricas propias | `docs/archive/ui-ux-redesign/PRE_UIUX_TECHNICAL_HARDENING.md` | Actualizar enlaces históricos y salientes |
| `docs/performance/PERFORMANCE_STAGE_15_PLAN.md` | `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md` | `docs/archive/performance-stages/PERFORMANCE_STAGE_15_PLAN.md` | Actualizar enlace histórico |
| `docs/performance/STAGE_15_CLOSURE.md` | `docs/performance/PERFORMANCE_BASELINE.md`, `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md` | `docs/archive/performance-stages/STAGE_15_CLOSURE.md` | Actualizar enlace desde baseline |
| `docs/ui-ux/ADMIN_CONFIG_STAGE_10_PLAN.md` | `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md` | `docs/archive/ui-ux-redesign/ADMIN_CONFIG_STAGE_10_PLAN.md` | Actualizar enlace histórico |
| `docs/ui-ux/AUDITORIA_POST_BETA_2_PRE_REDISENO.md` | `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md`, autorreferencia de reporte | `docs/archive/ui-ux-redesign/AUDITORIA_POST_BETA_2_PRE_REDISENO.md` | Actualizar enlace histórico |
| `docs/ui-ux/DASHBOARD_WORKSPACE_STAGE_11_PLAN.md` | `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md` | `docs/archive/ui-ux-redesign/DASHBOARD_WORKSPACE_STAGE_11_PLAN.md` | Actualizar enlace histórico |
| `docs/ui-ux/FASE_14_AUDITORIA_UI_UX.md` | `docs/CONVENCIONES_UI_UX_GODEL.md`, autorreferencias | `docs/archive/ui-ux-redesign/FASE_14_AUDITORIA_UI_UX.md` | Actualizar enlace desde convenciones |
| `docs/ui-ux/FASE_14_CIERRE_UI_UX.md` | `docs/CONVENCIONES_UI_UX_GODEL.md`, `docs/development/ROADMAP.md`, `docs/ui-ux/FASE_14_AUDITORIA_UI_UX.md` | `docs/archive/ui-ux-redesign/FASE_14_CIERRE_UI_UX.md` | Actualizar enlaces |
| `docs/ui-ux/FASE_14_REVISION_RESPONSIVE.md` | `docs/CONVENCIONES_UI_UX_GODEL.md`, `docs/ui-ux/FASE_14_AUDITORIA_UI_UX.md` | `docs/archive/ui-ux-redesign/FASE_14_REVISION_RESPONSIVE.md` | Actualizar enlaces |
| `docs/ui-ux/INTERNAL_FORMS_STAGE_12_PLAN.md` | `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md`, `docs/ui-ux/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md` | `docs/archive/ui-ux-redesign/INTERNAL_FORMS_STAGE_12_PLAN.md` | Actualizar enlaces |
| `docs/ui-ux/INTERNAL_SHELL_QA_REPORT.md` | `docs/ui-ux/INTERNAL_SHELL_SPEC.md` | `docs/archive/ui-ux-redesign/INTERNAL_SHELL_QA_REPORT.md` | Actualizar enlace desde spec |
| `docs/ui-ux/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md` | autorreferencia y roadmap UI/UX | `docs/archive/ui-ux-redesign/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md` | Actualizar enlaces |
| `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md` | `docs/ui-ux/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md` | `docs/archive/ui-ux-redesign/POST_BETA_2_UI_UX_ROADMAP.md` | Actualizar enlace histórico |
| `docs/ui-ux/PUBLIC_AREA_STAGE_13_PLAN.md` | `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md` | `docs/archive/ui-ux-redesign/PUBLIC_AREA_STAGE_13_PLAN.md` | Actualizar enlace histórico |
| `docs/ui-ux/STAGE_12_QA_CLOSURE.md` | `docs/ui-ux/INTERNAL_FORMS_STAGE_12_PLAN.md`, `docs/ui-ux/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md` | `docs/archive/ui-ux-redesign/STAGE_12_QA_CLOSURE.md` | Actualizar enlaces |
| `docs/ui-ux/STAGE_13_QA_CLOSURE.md` | `docs/ui-ux/PUBLIC_AREA_STAGE_13_PLAN.md` | `docs/archive/ui-ux-redesign/STAGE_13_QA_CLOSURE.md` | Actualizar enlace |
| `docs/ui-ux/STAGE_14_QA_CLOSURE.md` | `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md`, `docs/ui-ux/TRANSVERSAL_STATES_DECISION_MATRIX.md`, `docs/ui-ux/TRANSVERSAL_STATES_STAGE_14_PLAN.md` | `docs/archive/ui-ux-redesign/STAGE_14_QA_CLOSURE.md` | Actualizar enlaces |
| `docs/ui-ux/STAGE_16_FINAL_QA_CLOSURE.md` | `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md` | `docs/archive/ui-ux-redesign/STAGE_16_FINAL_QA_CLOSURE.md` | Actualizar enlace |
| `docs/ui-ux/TRANSVERSAL_STATES_STAGE_14_PLAN.md` | `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md` | `docs/archive/ui-ux-redesign/TRANSVERSAL_STATES_STAGE_14_PLAN.md` | Actualizar enlace |

## 15. Contradicciones documentales

| Archivo | Sección | Afirmación actual | Estado correcto | Acción recomendada |
| --- | --- | --- | --- | --- |
| `AGENTS.md` | Reglas obligatorias | `No uses service_role ni SUPABASE_SERVICE_ROLE_KEY`; `No consultes auth.users desde la app` | No usar credenciales administrativas en cliente; no usar cliente administrativo como acceso general a DB o Storage; `SUPABASE_SECRET_KEY` solo en adaptador server-only de Auth Admin; uso limitado al ciclo administrativo de identidad; no consultar directamente `auth.users` desde código normal de aplicación | Aclarar excepción operativa server-only sin debilitar regla |
| `README.md` | Seguridad / Documentación | Seguridad no distingue el adaptador Auth Admin server-only; `docs/development` contiene auditorías, deuda, roadmap histórico y guías locales | Mismas reglas Auth Admin precisas que `AGENTS.md`; tras reorganizar, `docs/development` debe contener guías vivas y deuda, mientras auditorías/roadmaps van a `docs/archive` | Actualizar sección Seguridad y descripción de `docs/development` |
| `docs/project-standards/SECURITY_RULES.md` | Reglas críticas | Prohibiciones absolutas de `service_role`, `SUPABASE_SERVICE_ROLE_KEY` y `auth.users` | Reglas separadas para cliente normal, adaptador Auth Admin, secretos, operaciones permitidas y operaciones prohibidas; no exponer secretos ni usar cliente admin como DB/Storage general | Reemplazar prohibiciones absolutas por contrato preciso |
| `docs/project-standards/ARCHITECTURE_RULES.md` | Servicios de dominio / Seguridad | Servicios no deben usar `service_role`, `SUPABASE_SERVICE_ROLE_KEY` ni consultar `auth.users`; seguridad repite prohibición absoluta | Reconocer adaptador administrativo especializado server-only para Auth Admin sin autorizar uso general; servicios normales siguen con cliente server-side normal y RLS | Actualizar ambas secciones |
| `docs/README.md` | Documentación de desarrollo | Presenta `development/` como lugar de auditorías y roadmap | Esos documentos pasan a archivo histórico | Reescribir índice |
| `docs/development/README.md` | Documentos | Lista parcial y avisa que auditorías pueden quedar obsoletas | Debe separar guias vivas de históricos archivados | Reescribir indice |
| `docs/PERMISSIONS_MODEL.md` | Gestión de Usuarios Internos | Dice que la app no crea credenciales Auth y que la creación usa UUID Auth existente | Estado actual: alta administrativa server-only crea usuario Auth con Auth Admin, trigger provisiona perfil y queda `must_change_password = true` | Actualizar sección usuarios |
| `docs/USERS_MANAGEMENT_MODEL.md` | Modelo actual / historial | Declara legacy retirado y alta Auth Admin vigente | Correcto; no contradice, pero conviene enlazar desde permisos | Mantener; usar como fuente para corregir permisos |
| `docs/DATABASE_MODEL.md` | Operaciones transaccionales | `complete_initial_password_change` reservado a `service_role` | Correcto a nivel DB, pero puede leerse en conflicto con la prohibicion general de app | Aclarar que es grant técnico para RPC, no permiso para cliente general en app |
| `docs/development/AUTH_LOCAL.md` | Clave administrativa local | `SERVICE_ROLE_KEY` queda como alternativa legacy local | El proyecto usa `SUPABASE_SECRET_KEY` exclusivamente en el adaptador Auth Admin server-only. No configurar `SUPABASE_SERVICE_ROLE_KEY` como variable alternativa de la aplicación | Eliminar recomendación de fallback |
| `docs/development/TECH_DEBT.md` | Hallazgos Beta 1 y deuda | Mezcla estado Beta 1 con deuda viva; no absorbe completo Beta 2 | Registro vivo único debe estar actualizado antes de preproducción | Fusionar deuda viva desde `BETA_2_TECHNICAL_DEBT.md` |
| `docs/development/ROADMAP.md` | Fase 12 / resumen final | Dice que la app no crea Auth y que la próxima fase activa es Fase 15 | Estado actual: Auth Admin server-only vigente; siguiente etapa declarada para `PROJECT_STATUS.md` es preproducción | Archivar roadmap y no usarlo como fuente vigente |
| `src/lib/usuarios/README.md` | Seguridad | `createAdminClient` solo en `create-internal-user.ts` para `createUser/deleteUser` | Estado actual también lo usan reset administrativo y cambio inicial obligatorio, siempre server-only | Actualizar regla de usos permitidos |
| `src/lib/service-types/README.md` | workflow_type | Indica `Impresión` única por migración y servicios de encargo desde aplicación | Correcto | Mantener como fuente vigente de servicios |

Contradicciones obligatorias resueltas por evidencia:

- Migraciones: el estado correcto actual es de seis migraciones consolidadas:
  `20260731000100_01_core_schema.sql` a
  `20260731000600_06_final_hardening.sql`. Las referencias a 21 migraciones y a
  cinco migraciones pertenecen a fases históricas.
- Servicios: el estado correcto es `Impresión` y `Otro` como servicios
  iniciales generados por migración con UUID dinámico; el resto del catálogo se
  configura desde la aplicación. No deben documentarse UUID fijos de servicios.
- Auth Admin: uso permitido solo server-only para ciclo administrativo de
  identidad. No usar como cliente general de base de datos o Storage, no exponer
  credenciales al navegador y no consultar `auth.users` desde app code normal.
- Estado del proyecto: los roadmaps Beta/Alfa/UI-UX están cerrados. El estado
  vigente debe vivir en `PROJECT_STATUS.md`.

## 16. Estrategia de ejecución

1. Fusionar y limpiar deuda viva.
2. Crear estructura e indices.
3. Mover documentos históricos.
4. Actualizar enlaces internos de los documentos movidos.
5. Actualizar documentación vigente y reglas Auth Admin.
6. Crear `PROJECT_STATUS.md`.
7. Validar todos los enlaces Markdown.
8. Validar contradicciones y búsquedas legacy.
9. Mover los dos documentos de planificacion a `archive/project-maintenance`.
10. Repetir validación después de moverlos.

## 17. Estrategia de validación

Validaciones para la fase posterior:

```bash
rg -n "\]\([^)]*\.md(?:#[^)]*)?\)" . -g "*.md" -g "!node_modules/**" -g "!.next/**"
rg -n "docs/[A-Za-z0-9_./-]+\.md" . -g "*.md" -g "*.ts" -g "*.tsx" -g "*.js" -g "*.mjs" -g "!node_modules/**" -g "!.next/**"
npm.cmd run diff:check
npm.cmd run verify
git diff --check
git diff --stat
git status --short
```

Validación manual:

- Todo Markdown inventariado tiene categoría.
- Ningun README de `src/lib/**` fue movido.
- Los `SPEC`/`MATRIX` vigentes de UI/UX permanecen visibles.
- El archivo histórico no aparece como fuente prioritaria de implementación.
- Las contradicciones de Auth Admin, migraciones y servicios quedan corregidas.
- La matriz tiene 100 filas documentales.
- La suma de categorías es 100.
- Cada fila tiene categoría.
- Cada documento que será movido tiene destino exacto.
- Los dos artefactos de reorganización están incluidos.

## 18. Decisiones finales

| Tema | Decision final | Acción |
| --- | --- | --- |
| `CLAUDE.md` | RESUELTO: conservar como alias de compatibilidad hacia `AGENTS.md`. | No modificarlo. |
| `docs/ui-ux/FASE_14_DESIGN_SYSTEM.md` | RESUELTO: mantener como especificación detallada vigente. | Actualizar encabezado, estado y lenguaje de etapa; no fusionarlo completamente con `CONVENCIONES_UI_UX_GODEL.md`. |
| `docs/ui-ux/WORKSPACE_INTERACTION_SPEC.md` | RESUELTO: mantener el contrato vigente y reducir el registro histórico a una nota breve con enlace al archivo UI/UX. | No crear un nuevo documento histórico solo para ese apéndice. |
| `docs/development/TECH_DEBT.md` | RESUELTO: mantener únicamente deuda activa y accionable. | Conservar o introducir IDs estables; fusionar selectivamente `BETA_2_TECHNICAL_DEBT.md`; deduplicar Storage, antiabuso y full visual QA; verificar si cada deuda continua activa antes de copiarla; no mantener largas narraciones de elementos resueltos; enlazar al archivo histórico para contexto. |

## 19. Archivos permitidos en la siguiente fase

Permitidos para ejecutar la reorganización:

- `README.md`
- `AGENTS.md`
- `docs/README.md`
- `docs/PROJECT_STATUS.md`
- `docs/development/README.md`
- `docs/development/AUTH_LOCAL.md`
- `docs/development/TECH_DEBT.md`
- `docs/development/DOCUMENTATION_REORGANIZATION_INVENTORY.md`
- `docs/development/DOCUMENTATION_REORGANIZATION_PLAN.md`
- `docs/performance/README.md`
- `docs/performance/PERFORMANCE_BASELINE.md`
- `docs/project-standards/ARCHITECTURE_RULES.md`
- `docs/project-standards/SECURITY_RULES.md`
- `docs/ui-ux/README.md`
- `docs/ui-ux/FASE_14_DESIGN_SYSTEM.md`
- `docs/ui-ux/INTERNAL_LISTINGS_SPEC.md`
- `docs/ui-ux/INTERNAL_SHELL_SPEC.md`
- `docs/ui-ux/TRANSVERSAL_STATES_DECISION_MATRIX.md`
- `docs/ui-ux/WORKSPACE_INTERACTION_SPEC.md`
- `docs/CONVENCIONES_UI_UX_GODEL.md`
- `docs/DASHBOARD_OPERATIVE_MODEL.md`
- `docs/PERMISSIONS_MODEL.md`
- `src/lib/storage/README.md`
- `src/lib/usuarios/README.md`
- `docs/archive/**`
- `docs/archive/project-maintenance/**`

No permitidos salvo instruccion explícita:

- Código de aplicación.
- Migraciones SQL.
- `src/types/database.types.ts`.
- Configuración Supabase.
- Cambios remotos, commits o push.

## 20. Criterios de aceptación

- Todo archivo Markdown relevante queda inventariado.
- Cada documento tiene una categoría principal.
- Cada documento histórico tiene destino exacto.
- Ningun documento vigente se archiva solo por nombre.
- Las guias vivas se separan de auditorías, planes y cierres.
- Las especificaciones UI/UX se revisan individualmente.
- Los documentos de baseline final se archivan como históricos.
- Las contradicciones sobre migraciones, servicios y Auth Admin quedan
  registradas.
- Los enlaces afectados quedan identificados antes de mover archivos.
- `PROJECT_STATUS.md` queda diseñado como documento breve vigente.
- No se mueve ni modifica documentación existente en esta fase.
- No se modifica código ni SQL en esta fase.
- `npm.cmd run diff:check`, `npm.cmd run verify` y `git diff --check` pasan.
