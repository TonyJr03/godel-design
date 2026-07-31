# Checklist de seguridad para rutas públicas

Usar cuando se toque `/solicitud`, `/estado` o cualquier ruta pública futura.

## Exposicion de datos

- [ ] No se exponen UUIDs internos innecesarios.
- [ ] No se expone `order_number` interno en tracking público.
- [ ] No se expone `file_path`.
- [ ] No se exponen rutas internas de Storage.
- [ ] No se expone información de pagos en `/estado`.
- [ ] No se expone metadata sensible.

## Acceso a datos

- [ ] No hay SELECT anónimo directo sobre tablas internas.
- [ ] La ruta usa DTO público controlado.
- [ ] Si usa RPC pública, la RPC devuelve solo datos seguros.
- [ ] Errores públicos no revelan detalles internos.

## Solicitudes públicas

- [ ] La creación pública está limitada al flujo necesario.
- [ ] Se validan datos server-side.
- [ ] Se validan archivos si aplica.
- [ ] No se habilita eliminación anónima.

## Tracking público

- [ ] Usa `public_reference`.
- [ ] No usa UUID interno como código público.
- [ ] No muestra datos financieros salvo decisión explícita futura.
- [ ] No muestra datos internos de producción que no sean necesarios.
