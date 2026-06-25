# Checklist de QA para UI interna

Usar cuando se toquen pantallas del dashboard, formularios internos o rutas protegidas.

## Acceso

- [ ] Probe con rol correcto.
- [ ] Probe restricciones si aplica.
- [ ] Trabajador no ve acciones indebidas.
- [ ] Admin/supervisor ven lo que corresponde.

## Visual

- [ ] Revise desktop.
- [ ] Revise mobile.
- [ ] No hay overflow horizontal.
- [ ] Tablas y cards se ven correctamente.
- [ ] Badges y estados son legibles.
- [ ] Botones principales estan visibles.
- [ ] Estados vacios son claros.

## Formularios

- [ ] Campos requeridos funcionan.
- [ ] Validaciones se muestran claras.
- [ ] Errores server-side se muestran de forma segura.
- [ ] No se muestran errores crudos de PostgreSQL/Supabase.
- [ ] Mensajes de exito son claros.

## Datos sensibles

- [ ] No se muestran UUIDs innecesarios.
- [ ] No se muestra `file_path`.
- [ ] No se muestran passwords o secretos.
- [ ] No se muestran metadatos internos sensibles.

## Navegacion

- [ ] Links principales funcionan.
- [ ] Redirecciones esperadas funcionan.
- [ ] No hay pantallas protegidas con contenido sensible para roles incorrectos.
