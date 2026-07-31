# Checklist de cierre de fase

Usar al cerrar una fase Alfa, Beta, Gamma o cualquier bloque grande.

## Funcionalidad

- [ ] Todas las subfases planeadas están completadas.
- [ ] No quedan tareas funcionales críticas pendientes.
- [ ] Los flujos principales fueron probados.
- [ ] Los permisos fueron probados.
- [ ] Los casos límite principales fueron revisados.

## Seguridad

- [ ] RLS/grants revisados si hubo cambios DB.
- [ ] Rutas públicas revisadas si fueron afectadas.
- [ ] No se expusieron datos sensibles.
- [ ] No se agregó `service_role`.
- [ ] No se consultó `auth.users` desde app code.

## QA

- [ ] `npm run verify` paso.
- [ ] `npm run lint` paso.
- [ ] `npm run build` paso.
- [ ] `npm run diff:check` paso.
- [ ] `git diff --check` paso.
- [ ] Scripts de auditoría relevantes ejecutados.
- [ ] QA visual ejecutada si hubo cambios UI.
- [ ] QA DB ejecutada si hubo cambios DB.

## Documentación

- [ ] Documentación funcional actualizada.
- [ ] Modelo de datos actualizado si aplica.
- [ ] Permisos actualizados si aplica.
- [ ] Deuda técnica registrada.
- [ ] Checklist de fase creada si corresponde.

## Cierre

- [ ] Reporte final preparado.
- [ ] Commit recomendado definido.
- [ ] Riesgos pendientes identificados.
- [ ] Proxima fase clara.
