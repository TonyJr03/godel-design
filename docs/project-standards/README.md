# Reglas permanentes del proyecto

Esta carpeta contiene reglas permanentes del proyecto que deben ser consultadas por Codex y por cualquier desarrollador antes de implementar cambios.

## Documentos

- `ARCHITECTURE_RULES.md`: reglas de arquitectura, separacion de responsabilidades y organizacion de codigo.
- `SECURITY_RULES.md`: reglas de permisos, rutas publicas, secretos, archivos privados y exposicion de datos.
- `DATABASE_RULES.md`: reglas para Supabase PostgreSQL, migraciones, RLS, RPC, triggers y tipos.
- `QA_AND_REPORTING.md`: reglas para verificar tareas y reportar resultados.

## Diferencia entre carpetas

- `docs/project-standards/`: reglas permanentes que guian la implementacion del proyecto.
- `docs/development/`: documentacion evolutiva, deuda tecnica, checklists de fases y notas de desarrollo.

No uses `docs/development/` para reglas permanentes nuevas salvo instruccion explicita.

## Cuando consultar cada archivo

- Arquitectura, componentes, Server Actions o `src/lib`: consulta `ARCHITECTURE_RULES.md`.
- Permisos, rutas publicas, archivos, secretos o exposicion de datos: consulta `SECURITY_RULES.md`.
- Migraciones, RLS, RPC, triggers, constraints o tipos generados: consulta `DATABASE_RULES.md`.
- Cierre de tareas, pruebas, reportes o advertencias tecnicas: consulta `QA_AND_REPORTING.md`.

## Skills operativas

- Para migraciones, RLS, RPC, constraints y triggers usa `godel-supabase-migration-qa`.
- Para QA visual autenticada usa `godel-authenticated-visual-qa`.
- Para trabajo UI/UX usa `ui-ux-pro-max` cuando aplique.
