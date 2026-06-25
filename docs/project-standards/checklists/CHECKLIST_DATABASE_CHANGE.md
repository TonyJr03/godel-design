# Checklist de cambios de base de datos

Usar cuando la tarea toque migraciones, RLS, RPCs, triggers, constraints, grants, enums, tablas o tipos.

## Migracion

- [ ] Cree una migracion nueva.
- [ ] No edite migraciones historicas salvo instruccion explicita.
- [ ] El nombre de la migracion sigue el patron existente.
- [ ] La migracion es reproducible desde cero.

## Modelo

- [ ] Defini constraints necesarias.
- [ ] Defini indices solo si aportan valor real.
- [ ] Defini defaults seguros.
- [ ] Considere backfill si hay datos existentes.
- [ ] Actualice `src/types/database.types.ts` si cambio schema, enum o RPC.

## RLS y grants

- [ ] RLS esta activado en tablas sensibles.
- [ ] `anon` no tiene acceso innecesario.
- [ ] `authenticated` solo tiene lo necesario.
- [ ] Las policies respetan roles y acceso real.
- [ ] Los grants de RPC son minimos.

## RPC

- [ ] Valida usuario autenticado cuando aplica.
- [ ] Valida perfil interno activo cuando aplica.
- [ ] Valida permisos.
- [ ] Valida estado del recurso.
- [ ] Es transaccional para operaciones criticas.
- [ ] No deja datos parciales en caso de error.

## Pruebas

- [ ] Probe casos validos.
- [ ] Probe casos invalidos.
- [ ] Probe RLS/grants.
- [ ] Probe RPCs criticas.
- [ ] Use `BEGIN`/`ROLLBACK` cuando correspondia.
- [ ] No deje datos basura persistidos.

## Documentacion

- [ ] Actualice `docs/DATABASE_MODEL.md` si cambio el modelo.
- [ ] Actualice documentos de flujo si cambio comportamiento.
- [ ] Registre deuda tecnica si quedo algo pendiente.
