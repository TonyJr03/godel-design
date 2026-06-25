# Reglas de base de datos

## Migraciones

- Toda modificacion de schema debe ir en una migracion nueva.
- No edites migraciones historicas salvo instruccion explicita.
- Las migraciones deben ser reproducibles desde cero.
- Los nombres deben seguir el orden y estilo existente.

## RLS

- Activa RLS en tablas sensibles.
- No abras `anon` salvo casos publicos controlados.
- Valida acceso interno por perfil activo y permisos.
- Usa helpers existentes si existen.

## RPC

- Usa RPC para operaciones transaccionales criticas.
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
- Prueba casos validos e invalidos.
- Prueba permisos cuando aplique.

## QA futuro de migraciones

El procedimiento detallado de QA de migraciones quedara en una skill futura:

- `.codex/skills/godel-supabase-migration-qa/SKILL.md`

No crees esa skill salvo que una tarea futura lo indique.
