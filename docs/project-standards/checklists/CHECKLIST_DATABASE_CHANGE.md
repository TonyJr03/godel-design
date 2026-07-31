# Checklist de cambios de base de datos

Usar cuando la tarea toque migraciones, RLS, RPCs, triggers, constraints, grants, enums, tablas o tipos.

## Migración

- [ ] Cree una migración nueva.
- [ ] No edite migraciones históricas salvo instruccion explícita.
- [ ] El nombre de la migración sigue el patrón existente.
- [ ] La migración es reproducible desde cero.

## Modelo

- [ ] Defini constraints necesarias.
- [ ] Definí índices solo si aportan valor real.
- [ ] Defini defaults seguros.
- [ ] Considere backfill si hay datos existentes.
- [ ] Actualice `src/types/database.types.ts` si cambio schema, enum o RPC.

## RLS y grants

- [ ] RLS está activado en tablas sensibles.
- [ ] `anon` no tiene acceso innecesario.
- [ ] `authenticated` solo tiene lo necesario.
- [ ] Las policies respetan roles y acceso real.
- [ ] Los grants de RPC son mínimos.

## RPC

- [ ] Valida usuario autenticado cuando aplica.
- [ ] Valida perfil interno activo cuando aplica.
- [ ] Valida permisos.
- [ ] Valida estado del recurso.
- [ ] Es transaccional para operaciones críticas.
- [ ] No deja datos parciales en caso de error.

## Pruebas

- [ ] Probe casos validos.
- [ ] Probe casos inválidos.
- [ ] Probe RLS/grants.
- [ ] Probe RPCs críticas.
- [ ] Use `BEGIN`/`ROLLBACK` cuando correspondía.
- [ ] No deje datos basura persistidos.

## Documentación

- [ ] Actualice `docs/DATABASE_MODEL.md` si cambio el modelo.
- [ ] Actualice documentos de flujo si cambio comportamiento.
- [ ] Registre deuda técnica si quedó algo pendiente.
