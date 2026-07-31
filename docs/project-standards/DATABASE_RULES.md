# Reglas de base de datos

## Migraciones

- Toda modificación de schema debe ir en una migración nueva.
- No edites migraciones históricas salvo instruccion explícita.
- Las migraciones deben ser reproducibles desde cero.
- Los nombres deben seguir el orden y estilo existente.

## RLS

- Activa RLS en tablas sensibles.
- No abras `anon` salvo casos públicos controlados.
- Valida acceso interno por perfil activo y permisos.
- Usa helpers existentes si existen.

## RPC

- Usa RPC para operaciones transaccionales críticas.
- Valida `auth.uid()`.
- Valida perfil interno activo.
- Valida permisos.
- Valida estado del recurso.
- Evita inconsistencias parciales.
- Concede `execute` solo a roles necesarios.

## Tipos

- Actualiza `src/types/database.types.ts` cuando cambie schema, enum o RPC.

## Pruebas SQL

- Prueba migraciones localmente.
- Usa `BEGIN`/`ROLLBACK` cuando hagas pruebas destructivas.
- Prueba constraints.
- Prueba casos validos e inválidos.
- Prueba permisos cuando aplique.

## QA de migraciones

El procedimiento detallado de QA de migraciones está definido en la skill local:

- `.codex/skills/godel-supabase-migration-qa/SKILL.md`

Usa esa skill cuando la tarea toque migraciones, tablas, enums, constraints, triggers, RLS, policies, grants, RPCs, backfills, estado de Supabase Storage o `src/types/database.types.ts`.
