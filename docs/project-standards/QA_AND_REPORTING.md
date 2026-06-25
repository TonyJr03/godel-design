# QA y reporte

## Antes de implementar

- Revisa el alcance.
- Revisa archivos existentes.
- Identifica patrones actuales.
- Identifica que no se debe tocar.

## Durante la implementacion

- Haz cambios pequeños y coherentes.
- No mezcles refactors grandes con funcionalidad nueva.
- No agregues dependencias sin aprobacion.
- Mantén documentacion sincronizada.

## Verificacion

Segun el tipo de tarea, considera:

- `npm run lint`
- `npm run build`
- `git diff --check`

Para tareas solo documentales:

- `git diff --check` puede ser suficiente.
- `npm run lint` y `npm run build` son opcionales si no se toco codigo.

Para tareas de base de datos:

- Pruebas SQL locales.
- `BEGIN`/`ROLLBACK`.
- RLS, RPC y constraints si aplica.

Para tareas de UI:

- Revision desktop.
- Revision mobile.
- Formularios.
- Estados de error.
- Estados vacios.
- Overflow.

## Reporte final obligatorio

Codex debe reportar siempre:

- Resumen de lo implementado.
- Archivos creados.
- Archivos modificados.
- Migraciones creadas, si aplica.
- Componentes, actions o services modificados, si aplica.
- Documentacion actualizada.
- Pruebas realizadas.
- Resultado de lint, build o diff-check.
- Restricciones respetadas.
- Advertencias tecnicas.
