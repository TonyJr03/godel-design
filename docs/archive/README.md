# Archivo histórico

Este archivo conserva planes, auditorías, reportes, cierres e inventarios de
fases pasadas. No es fuente primaria para implementar cambios actuales. Cuando
un documento histórico contradiga documentación vigente, prevalecen el
[estado del proyecto](../PROJECT_STATUS.md), el [índice principal](../README.md),
los modelos funcionales actuales y la [deuda técnica activa](../development/TECH_DEBT.md).

| Carpeta | Etapa o dominio | Contenido | Cierre principal | Fuente vigente |
| --- | --- | --- | --- | --- |
| [initial-development/](initial-development/) | Desarrollo inicial | Roadmap y auditoría técnica inicial | Sin cierre único | [Estado](../PROJECT_STATUS.md), [documentación vigente](../README.md) |
| [alfa-features/](alfa-features/) | Funcionalidades Alfa | Checklists de workflow, tracking, plantillas y pagos | Checklists individuales | [Modelos funcionales](../README.md#modelos-funcionales-actuales) |
| [beta-1-database/](beta-1-database/) | Consolidación DB Beta 1 | Auditoría, plan de consolidación, reset y QA funcional | [BETA_1_CLOSURE_REPORT.md](beta-1-database/BETA_1_CLOSURE_REPORT.md) | [DATABASE_MODEL.md](../DATABASE_MODEL.md) |
| [beta-2-architecture/](beta-2-architecture/) | Arquitectura Beta 2 | Auditorías de dominio, QA tooling, cierre y deuda aceptada de fase | [BETA_2_FINAL_CLOSURE.md](beta-2-architecture/BETA_2_FINAL_CLOSURE.md) | [Reglas permanentes](../project-standards/README.md), [deuda activa](../development/TECH_DEBT.md) |
| [database-baseline/](database-baseline/) | Baseline final DB | Inventario y plan usados para diseñar las seis migraciones finales | Sin cierre único | [DATABASE_MODEL.md](../DATABASE_MODEL.md), [estado](../PROJECT_STATUS.md) |
| [ui-ux-redesign/](ui-ux-redesign/) | Rediseño UI/UX | Auditorías, planes y cierres de Etapas 10 a 16 | [STAGE_16_FINAL_QA_CLOSURE.md](ui-ux-redesign/STAGE_16_FINAL_QA_CLOSURE.md) | [Convenciones UI/UX](../CONVENCIONES_UI_UX_GODEL.md), [índice UI/UX](../ui-ux/README.md) |
| [performance-stages/](performance-stages/) | Rendimiento | Plan y cierre de Etapa 15 | [STAGE_15_CLOSURE.md](performance-stages/STAGE_15_CLOSURE.md) | [PERFORMANCE_BASELINE.md](../performance/PERFORMANCE_BASELINE.md) |
| [project-maintenance/](project-maintenance/) | Mantenimiento documental | Inventarios y planes transversales ya ejecutados | Sin cierre único | [Documentación vigente](../README.md), [estado](../PROJECT_STATUS.md) |

La deuda técnica activa vive en [../development/TECH_DEBT.md](../development/TECH_DEBT.md);
los registros de deuda archivados solo explican el origen histórico de decisiones
ya absorbidas o cerradas.

## Mantenimiento documental archivado

- [DOCUMENTATION_REORGANIZATION_INVENTORY.md](project-maintenance/DOCUMENTATION_REORGANIZATION_INVENTORY.md)
- [DOCUMENTATION_REORGANIZATION_PLAN.md](project-maintenance/DOCUMENTATION_REORGANIZATION_PLAN.md)
