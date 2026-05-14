# Flujo de Solicitudes Publicas — Godel Design

## Proposito

Este documento describe como un cliente externo envia una solicitud publica de
trabajo desde `/solicitud` dentro del sistema web de gestion operativa de Godel
Design.

El objetivo es dejar documentado el flujo actual, los datos que se guardan, las
validaciones aplicadas, las decisiones tecnicas tomadas y lo que queda pendiente
para fases posteriores.

## Alcance actual

El flujo actual permite:

- Mostrar un formulario publico en `/solicitud`.
- Validar los datos enviados por el cliente.
- Crear una solicitud en Supabase.
- Guardar la solicitud con estado `nueva`.
- Mostrar un mensaje de exito y una referencia corta.

Todavia no incluye:

- Subida real de archivos.
- Captcha.
- Gestion interna de solicitudes.
- Conversion de solicitud a pedido.
- Asociacion inteligente con clientes.
- Notificaciones automaticas.

## Ruta publica

- Ruta: `/solicitud`.
- No requiere autenticacion.
- Esta disponible para clientes externos.
- No pertenece al dashboard interno.

## Campos del formulario

| Campo | Requerido | Descripcion |
|---|---|---|
| `cliente_nombre` | Si | Nombre del cliente o negocio |
| `cliente_telefono` | Si | Telefono de contacto |
| `cliente_email` | No | Correo opcional |
| `tipo_servicio` | Si | Tipo de trabajo solicitado |
| `descripcion` | Si | Descripcion del encargo |
| `cantidad` | No | Cantidad solicitada |
| `fecha_deseada` | No | Fecha deseada de entrega |
| `observaciones` | No | Notas adicionales |

## Campos que No Acepta la UI

El formulario publico no envia:

- `id`
- `estado`
- `cliente_id`
- `reviewed_by`
- `converted_order_id`

Estos campos son controlados por el servidor, por la base de datos o por flujos
internos posteriores. La UI publica no debe aceptar valores para ellos.

## Validacion Server-Side

La validacion definitiva esta en:

- `src/lib/solicitudes/public-request-validation.ts`

Reglas generales:

- `cliente_nombre` es requerido.
- `cliente_telefono` es requerido.
- `cliente_email` es opcional, pero si existe debe tener formato basico valido.
- `tipo_servicio` es requerido.
- `descripcion` es requerida.
- `cantidad` es opcional, pero debe ser positiva si existe.
- `fecha_deseada` es opcional, pero debe ser valida si existe.
- `observaciones` es opcional.
- Los campos opcionales vacios se convierten a `null`.
- Los espacios sobrantes se recortan antes de insertar.

No se usan dependencias externas para esta validacion.

## Server Action

El formulario usa:

- `src/app/solicitud/actions.ts`

La Server Action:

- Recibe `FormData`.
- Convierte los campos del formulario en input controlado.
- Llama al servicio de creacion.
- Devuelve errores controlados para la UI.
- No expone errores tecnicos de Supabase al cliente.
- No usa service role key.

## Servicio de Creacion

El servicio esta en:

- `src/lib/solicitudes/create-public-solicitud.ts`

Responsabilidades:

- Validar el input recibido.
- Crear la solicitud en Supabase.
- Establecer siempre `estado = "nueva"`.
- Establecer `cliente_id = null`.
- Establecer `reviewed_by = null`.
- Establecer `converted_order_id = null`.
- Generar un UUID controlado server-side para poder mostrar una referencia sin
  hacer lectura publica.
- Evitar un `.select()` publico innecesario despues del insert.

## Decision Sobre Clientes

En esta fase no se crea ni se asocia un registro en `clientes`.

La decision actual es:

- Guardar los datos del cliente desnormalizados en la tabla `solicitudes`.
- Dejar `cliente_id = null`.
- Posponer la asociacion y deduplicacion de clientes para Fase 7.
- Evitar abrir insercion publica en `clientes` para este flujo.

Esto mantiene el flujo publico mas pequeno y reduce la superficie de exposicion
de datos de clientes.

## Referencia de Solicitud

Despues de enviar una solicitud valida, la UI muestra una referencia corta:

`Referencia de solicitud: 8b7f3c10`

Esta referencia:

- Se deriva del UUID real de la solicitud.
- Sirve solo como ayuda de seguimiento.
- No permite leer, modificar ni eliminar solicitudes.
- No sustituye un codigo humano definitivo.
- Podria reemplazarse en el futuro por un codigo como `GD-2026-000123`.

## Seguridad y RLS

El flujo depende de Row Level Security en Supabase.

Estado esperado:

- Usuarios anonimos pueden insertar solicitudes publicas.
- Usuarios anonimos no pueden leer solicitudes.
- Usuarios anonimos no pueden actualizar solicitudes.
- Usuarios anonimos no pueden eliminar solicitudes.
- No hay lectura publica de clientes.
- No se usa service role key.
- RLS protege la base de datos.
- Los errores tecnicos no se exponen al cliente.

La UI publica no debe considerarse una frontera de seguridad. La validacion
server-side y RLS son la fuente de verdad.

## Relacion con Archivos

La subida de archivos no esta implementada en esta fase.

Referencia conceptual:

- `docs/STORAGE_MODEL.md`
- Fase 10 — Archivos privados

Cuando se implemente:

- Los archivos seran privados.
- No habra URLs publicas permanentes.
- Se guardaran metadatos en la tabla `archivos`.
- Se usaran rutas controladas y URLs firmadas.

## Flujo Funcional Actual

1. Cliente entra a `/solicitud`.
2. Completa el formulario.
3. El componente cliente llama a la Server Action.
4. La action convierte `FormData` en input.
5. El servicio valida datos.
6. El servicio inserta la solicitud con estado `nueva`.
7. La UI muestra exito y referencia corta.
8. El equipo interno revisara la solicitud en una fase posterior.

## Flujo Interno Pendiente

En Fase 6 se implementara:

- Listado interno de solicitudes.
- Revision por admin o supervisor.
- Actualizacion de estado.
- Preparacion para convertir solicitud en pedido.

La conversion real a pedido pertenece a una fase posterior del flujo interno.

## Pruebas Manuales Recomendadas

- Enviar solicitud valida.
- Enviar formulario vacio.
- Enviar email invalido.
- Enviar cantidad negativa.
- Enviar sin email.
- Verificar en Supabase Studio que la solicitud quedo con `estado = nueva`.
- Verificar que `cliente_id`, `reviewed_by` y `converted_order_id` quedan en
  `null`.
- Verificar que un usuario anonimo no puede leer solicitudes desde API/UI.

## Problemas Conocidos o Limitaciones

- No hay captcha todavia.
- No hay control avanzado anti-spam.
- No hay archivos.
- No hay notificaciones.
- No hay codigo humano de solicitud.
- No hay asociacion automatica con clientes.
- No hay seguimiento publico por referencia.

## Cierre

La siguiente subfase sera la revision final de Fase 5 antes de pasar a la
gestion interna de solicitudes.
