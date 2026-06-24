# Alfa 2 - Checklist de Seguimiento Publico

## Alcance cerrado

- `public_reference` usa formato `GD-XXXX-XXXX` para solicitudes y pedidos.
- Las solicitudes publicas muestran el codigo al cliente al finalizar el envio.
- La Home permite enviar rapidamente a `/estado?ref=...`.
- `/estado` consulta mediante la capa server-side de seguimiento publico.
- Las solicitudes convertidas y sus pedidos comparten el mismo `public_reference`.
- Los pedidos manuales generan su propio `public_reference`.
- El detalle interno de solicitud muestra el codigo publico con opcion de copiar.
- El detalle interno de pedido muestra el codigo publico con opcion de copiar.

## Separacion de referencias

- `public_reference` es el unico codigo pensado para compartir con clientes.
- `order_number` sigue siendo referencia operativa interna del pedido.
- El UUID interno y sus referencias cortas no deben usarse como codigo publico.
- La consulta publica no usa `order_number` como entrada de seguimiento.
- `/estado` no muestra `order_number`.

## Seguridad

- La lectura anonima directa de `solicitudes` y `pedidos` sigue cerrada.
- La consulta publica se limita a `public.consultar_estado_publico(text)`.
- El DTO publico no expone cliente, contacto, descripcion completa, archivos,
  comentarios, historial, usuarios internos, UUIDs ni `order_number`.
- Los detalles internos siguen protegidos por autenticacion, permisos y RLS.
- No se cambio la matriz de permisos, RLS, Storage ni las reglas de estados.

## Validacion tecnica

- Ejecutar `rg "slice\(0, 8\)"` y confirmar que solo queda para referencias
  internas.
- Ejecutar `rg "order_number"` y confirmar que no se usa como codigo publico.
- Confirmar que el DTO camelCase de seguimiento publico no expone el numero
  operativo interno.
- Ejecutar `rg "public_reference"` y revisar que la capa de seguimiento usa ese
  campo.
- Ejecutar `rg "publicReference"` y revisar conversiones de DTO o UI.
- Ejecutar `npm.cmd run lint`.
- Ejecutar `npm.cmd run build`.

## Pendiente antes de produccion

- Agregar rate limiting para `/solicitud` y `/estado`.
- Evaluar captcha o desafio liviano si aparece abuso.
- Definir si algun trabajo requiere verificacion adicional por telefono u otro
  dato acordado.
- Agregar auditoria o metricas agregadas de intentos fallidos de consulta.
- Hacer inspeccion visual en escritorio y movil de Home, `/solicitud`,
  `/estado`, detalle interno de solicitud y detalle interno de pedido.
