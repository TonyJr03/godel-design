# Checklist de cierre de fase

Usar al cerrar una fase Alfa, Beta, Gamma o cualquier bloque grande.

## Funcionalidad

- [ ] Todas las subfases planeadas estan completadas.
- [ ] No quedan tareas funcionales criticas pendientes.
- [ ] Los flujos principales fueron probados.
- [ ] Los permisos fueron probados.
- [ ] Los casos limite principales fueron revisados.

## Seguridad

- [ ] RLS/grants revisados si hubo cambios DB.
- [ ] Rutas publicas revisadas si fueron afectadas.
- [ ] No se expusieron datos sensibles.
- [ ] No se agrego `service_role`.
- [ ] No se consulto `auth.users` desde app code.

## QA

- [ ] `npm run lint` paso.
- [ ] `npm run build` paso.
- [ ] `git diff --check` paso.
- [ ] QA visual ejecutada si hubo cambios UI.
- [ ] QA DB ejecutada si hubo cambios DB.

## Documentacion

- [ ] Documentacion funcional actualizada.
- [ ] Modelo de datos actualizado si aplica.
- [ ] Permisos actualizados si aplica.
- [ ] Deuda tecnica registrada.
- [ ] Checklist de fase creada si corresponde.

## Cierre

- [ ] Reporte final preparado.
- [ ] Commit recomendado definido.
- [ ] Riesgos pendientes identificados.
- [ ] Proxima fase clara.
