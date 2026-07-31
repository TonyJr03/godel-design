# QA y reporte

## Antes de implementar

- Revisa el alcance.
- Revisa archivos existentes.
- Identifica patrones actuales.
- Identifica que no se debe tocar.

## Durante la implementación

- Haz cambios pequeños y coherentes.
- No mezcles refactors grandes con funcionalidad nueva.
- No agregues dependencias sin aprobación.
- Mantén documentación sincronizada.

## Verificación

Según el tipo de tarea, considera:

- `npm run lint`
- `npm run build`
- `git diff --check`
- `npm run verify`
- `npm run diff:check`

Para tareas solo documentales:

- `npm run diff:check` puede ser suficiente.
- `npm run lint` y `npm run build` son opcionales si no se toco código.

Para tareas de base de datos:

- Pruebas SQL locales.
- `BEGIN`/`ROLLBACK`.
- RLS, RPC y constraints si aplica.

Para tareas de UI:

- Revisión desktop.
- Revisión mobile.
- Formularios.
- Estados de error.
- Estados vacíos.
- Overflow.

## Scripts utiles

- `npm run verify`: ejecuta lint y build.
- `npm run diff:check`: revisa whitespace y conflictos visibles en el diff.
- `npm run audit:security`: busca referencias a `service_role`, `SUPABASE_SERVICE_ROLE_KEY` y `auth.users`.
- `npm run audit:client-supabase`: busca posibles usos de Supabase o `createClient()` en `src/components`.
- `npm run audit:public-tracking`: busca campos sensibles para tracking público en las rutas y librerías de estado público.

Los scripts de auditoría son informativos. Sus coincidencias pueden ser falsos positivos o referencias documentales esperadas; deben interpretarse junto con revisión manual, RLS/grants y QA funcional según aplique.

## Checklists de apoyo

Antes de iniciar una tarea, revisa `docs/project-standards/checklists/CHECKLIST_BEFORE_IMPLEMENTATION.md`.

Antes de entregar o preparar commit, revisa `docs/project-standards/checklists/CHECKLIST_BEFORE_COMMIT.md`.

Para cambios de base de datos, rutas públicas, UI interna o cierre de fase, usa la checklist correspondiente en `docs/project-standards/checklists/`.

## Reporte final obligatorio

Codex debe reportar siempre:

- Resumen de lo implementado.
- Archivos creados.
- Archivos modificados.
- Migraciones creadas, si aplica.
- Componentes, actions o services modificados, si aplica.
- Documentación actualizada.
- Pruebas realizadas.
- Resultado de lint, build o diff-check.
- Restricciones respetadas.
- Advertencias técnicas.
