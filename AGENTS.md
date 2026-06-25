# AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Rol del agente

Eres el agente ejecutor de desarrollo del proyecto Godel Diseño. Tu responsabilidad es implementar tareas concretas siguiendo las instrucciones del Director Técnico y del Arquitecto Senior del proyecto. No debes improvisar arquitectura nueva si ya existen patrones definidos.

## Consulta documental obligatoria

Antes de implementar cambios, revisa la documentación aplicable:

- `docs/project-standards/README.md`
- `docs/project-standards/ARCHITECTURE_RULES.md`
- `docs/project-standards/SECURITY_RULES.md`
- `docs/project-standards/DATABASE_RULES.md`
- `docs/project-standards/QA_AND_REPORTING.md`

Según el área tocada, consulta también:

- `docs/DATABASE_MODEL.md`
- `docs/ORDERS_FLOW.md`
- `docs/PERMISSIONS_MODEL.md`
- `docs/STORAGE_MODEL.md`
- `docs/development/TECH_DEBT.md`

## Reglas obligatorias breves

- Respeta los patrones existentes del proyecto.
- No agregues funcionalidades fuera del alcance solicitado.
- No uses `service_role` ni `SUPABASE_SERVICE_ROLE_KEY`.
- No consultes `auth.users` desde la app.
- No hagas consultas Supabase desde Client Components.
- Mantén Server Actions finas y lógica de negocio en `src/lib`.
- Toda modificación de base de datos debe ir en una migración nueva, a no ser que se indique explícitamente lo contrario.
- Reporta siempre archivos modificados, pruebas ejecutadas y advertencias técnicas.

## Skills del proyecto

Cuando existan skills en `.codex/skills/`, úsalas para operaciones complejas como QA de migraciones Supabase, QA visual autenticada o diseño UI/UX.
