# Checklist de seguridad para rutas publicas

Usar cuando se toque `/solicitud`, `/estado` o cualquier ruta publica futura.

## Exposicion de datos

- [ ] No se exponen UUIDs internos innecesarios.
- [ ] No se expone `order_number` interno en tracking publico.
- [ ] No se expone `file_path`.
- [ ] No se exponen rutas internas de Storage.
- [ ] No se expone informacion de pagos en `/estado`.
- [ ] No se expone metadata sensible.

## Acceso a datos

- [ ] No hay SELECT anonimo directo sobre tablas internas.
- [ ] La ruta usa DTO publico controlado.
- [ ] Si usa RPC publica, la RPC devuelve solo datos seguros.
- [ ] Errores publicos no revelan detalles internos.

## Solicitudes publicas

- [ ] La creacion publica esta limitada al flujo necesario.
- [ ] Se validan datos server-side.
- [ ] Se validan archivos si aplica.
- [ ] No se habilita eliminacion anonima.

## Tracking publico

- [ ] Usa `public_reference`.
- [ ] No usa UUID interno como codigo publico.
- [ ] No muestra datos financieros salvo decision explicita futura.
- [ ] No muestra datos internos de produccion que no sean necesarios.
