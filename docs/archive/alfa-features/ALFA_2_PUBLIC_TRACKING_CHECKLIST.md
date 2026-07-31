# Alfa 2 - Checklist de Seguimiento Público

## Alcance cerrado

- `public_reference` usa formato `GD-XXXX-XXXX` para solicitudes y pedidos.
- Las solicitudes públicas muestran el código al cliente al finalizar el envío.
- La Home permite enviar rápidamente a `/estado?ref=...`.
- `/estado` consulta mediante la capa server-side de seguimiento público.
- Las solicitudes convertidas y sus pedidos comparten el mismo `public_reference`.
- Los pedidos manuales generan su propio `public_reference`.
- El detalle interno de solicitud muestra el código público con opción de copiar.
- El detalle interno de pedido muestra el código público con opción de copiar.

## Separación de referencias

- `public_reference` es el único código pensado para compartir con clientes.
- `order_number` sigue siendo referencia operativa interna del pedido.
- El UUID interno y sus referencias cortas no deben usarse como código público.
- La consulta pública no usa `order_number` como entrada de seguimiento.
- `/estado` no muestra `order_number`.

## Seguridad

- La lectura anónima directa de `solicitudes` y `pedidos` sigue cerrada.
- La consulta pública se limita a `public.consultar_estado_publico(text)`.
- El DTO público no expone cliente, contacto, descripción completa, archivos,
  comentarios, historial, usuarios internos, UUIDs ni `order_number`.
- Los detalles internos siguen protegidos por autenticación, permisos y RLS.
- No se cambio la matriz de permisos, RLS, Storage ni las reglas de estados.

## Validación técnica

- Ejecutar `rg "slice\(0, 8\)"` y confirmar que solo queda para referencias
  internas.
- Ejecutar `rg "order_number"` y confirmar que no se usa como código público.
- Confirmar que el DTO camelCase de seguimiento público no expone el número
  operativo interno.
- Ejecutar `rg "public_reference"` y revisar que la capa de seguimiento usa ese
  campo.
- Ejecutar `rg "publicReference"` y revisar conversiones de DTO o UI.
- Ejecutar `npm.cmd run lint`.
- Ejecutar `npm.cmd run build`.

## Pendiente antes de producción

- Agregar rate limiting para `/solicitud` y `/estado`.
- Evaluar captcha o desafío liviano si aparece abuso.
- Definir si algún trabajo requiere verificación adicional por teléfono u otro
  dato acordado.
- Agregar auditoría o métricas agregadas de intentos fallidos de consulta.
- Hacer inspección visual en escritorio y móvil de Home, `/solicitud`,
  `/estado`, detalle interno de solicitud y detalle interno de pedido.
