# Checklist antes de commit o entrega

## Estado del repo

- [ ] Revise `git status --short`.
- [ ] Revise que no haya archivos temporales.
- [ ] Revise que no haya credenciales.
- [ ] Revise que no haya scripts de prueba accidentales.
- [ ] Inclui archivos nuevos necesarios.

## Verificacion

- [ ] Ejecute `git diff --check`.
- [ ] Ejecute `npm run lint` si se toco codigo.
- [ ] Ejecute `npm run build` si se toco codigo.
- [ ] Si no ejecute lint/build, explique por que.

## Seguridad

- [ ] No agregue `service_role`.
- [ ] No agregue `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] No consulte `auth.users` desde app code.
- [ ] No agregue Supabase directo en Client Components.
- [ ] No expuse `file_path` ni metadata sensible.

## Documentacion

- [ ] Actualice documentacion si cambio arquitectura, DB, permisos, flujos o deuda tecnica.
- [ ] No documente como terminado algo que no esta implementado.

## Reporte final

- [ ] Resumi archivos creados.
- [ ] Resumi archivos modificados.
- [ ] Resumi pruebas ejecutadas.
- [ ] Reporte advertencias tecnicas.
