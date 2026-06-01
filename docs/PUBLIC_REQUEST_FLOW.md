# Flujo de Solicitudes Públicas — Godel Diseño

## Propósito

Este documento describe cómo un cliente externo envía una solicitud pública de
trabajo desde `/solicitud` dentro del sistema web de gestión operativa de Godel
Diseño.

El objetivo es dejar documentado el flujo actual, los datos que se guardan, las
validaciones aplicadas, las decisiones técnicas tomadas y lo que queda pendiente
para fases posteriores.

## Alcance actual

El flujo actual permite:

- Mostrar un formulario público en `/solicitud`.
- Validar los datos enviados por el cliente.
- Crear una solicitud en Supabase.
- Adjuntar archivos opcionales de referencia.
- Guardar la solicitud con estado `nueva`.
- Mostrar un mensaje de éxito y una referencia corta.

Todavía no incluye:

- Captcha.
- Gestión interna de solicitudes.
- Conversión de solicitud a pedido.
- Asociación inteligente con clientes.
- Notificaciones automáticas.
- Descarga pública de archivos.

## Ruta pública

- Ruta: `/solicitud`.
- No requiere autenticación.
- Está disponible para clientes externos.
- No pertenece al dashboard interno.

## Campos del formulario

| Campo | Requerido | Descripción |
|---|---|---|
| `client_name` | Sí | Nombre del cliente o negocio |
| `client_phone` | Sí | Teléfono de contacto |
| `client_email` | No | Correo opcional |
| `service_type` | Sí | Tipo de trabajo solicitado |
| `description` | Sí | Descripción del encargo |
| `quantity` | No | Cantidad solicitada |
| `desired_date` | No | Fecha deseada de entrega; si se informa debe ser igual o posterior al día actual |
| `notes` | No | Notas adicionales |
| `files` | No | Archivos de referencia opcionales |

## Campos que no acepta la UI

El formulario público no envía:

- `id`
- `status`
- `cliente_id`
- `reviewed_by`
- `converted_order_id`

Estos campos son controlados por el servidor, por la base de datos o por flujos
internos posteriores. La UI pública no debe aceptar valores para ellos.

## Validación Server-Side

La validación definitiva está en:

- `src/lib/solicitudes/public-request-validation.ts`

Reglas generales:

- `client_name` es requerido.
- `client_phone` es requerido.
- `client_email` es opcional, pero si existe debe tener formato básico válido.
- `service_type` es requerido.
- `description` es requerida.
- `quantity` es opcional, pero debe ser positiva si existe.
- `desired_date` es opcional, pero debe ser válida e igual o posterior al día
  actual si existe.
- `notes` es opcional.
- Los campos opcionales vacíos se convierten a `null`.
- Los espacios sobrantes se recortan antes de insertar.

No se usan dependencias externas para esta validación.

## Server Action

El formulario usa:

- `src/app/solicitud/actions.ts`

La Server Action:

- Recibe `FormData`.
- Convierte los campos del formulario en input controlado.
- Llama al servicio de creación.
- Devuelve errores controlados para la UI.
- No expone errores técnicos de Supabase al cliente.
- No usa service role key.
- Procesa archivos opcionales después de crear la solicitud.
- No genera URLs públicas ni URLs firmadas para el cliente.

## Servicio de Creación

El servicio está en:

- `src/lib/solicitudes/create-public-solicitud.ts`

Responsabilidades:

- Validar el input recibido.
- Crear la solicitud en Supabase.
- Establecer siempre `status = "nueva"`.
- Establecer `cliente_id = null`.
- Establecer `reviewed_by = null`.
- Establecer `converted_order_id = null`.
- Generar un UUID controlado server-side para poder mostrar una referencia sin
  hacer lectura pública.
- Evitar un `.select()` público innecesario después del insert.

Desde Fase 11.7B, la inserción de la solicitud registra automáticamente el evento `solicitud_creada` en `solicitud_historial`. Como el flujo es público, normalmente queda con `actor_id = null` y metadata mínima no sensible.

## Decisión sobre clientes

En esta fase no se crea ni se asocia un registro en `clientes`.

La decisión actual es:

- Guardar los datos del cliente desnormalizados en la tabla `solicitudes`.
- Dejar `cliente_id = null`.
- Posponer la asociación y deduplicación de clientes para Fase 7.
- Evitar abrir inserción pública en `clientes` para este flujo.

Esto mantiene el flujo público más pequeño y reduce la superficie de exposición
de datos de clientes.

## Referencia de Solicitud

Después de enviar una solicitud válida, la UI muestra una referencia corta:

`Referencia de solicitud: 8b7f3c10`

Esta referencia:

- Se deriva del UUID real de la solicitud.
- Sirve solo como ayuda de seguimiento.
- No permite leer, modificar ni eliminar solicitudes.
- No sustituye un código humano definitivo.
- Podría reemplazarse en el futuro por un código como `GD-2026-000123`.

## Seguridad y RLS

El flujo depende de Row Level Security en Supabase.

Estado esperado:

- Usuarios anónimos pueden insertar solicitudes públicas.
- Usuarios anónimos no pueden leer solicitudes.
- Usuarios anónimos no pueden actualizar solicitudes.
- Usuarios anónimos no pueden eliminar solicitudes.
- No hay lectura pública de clientes.
- No se usa service role key.
- RLS protege la base de datos.
- Los errores técnicos no se exponen al cliente.

La UI pública no debe considerarse una frontera de seguridad. La validación
server-side y RLS son la fuente de verdad.

## Relación con archivos

El cliente puede adjuntar archivos de referencia opcionales al enviar la solicitud.

Límites actuales:

- máximo 5 archivos por solicitud;
- máximo 20 MB por archivo;
- formatos permitidos: PDF, JPG, PNG, WEBP, DOC, DOCX y ZIP.

Los archivos:

- se guardan en el bucket privado `godel-files`;
- usan rutas `solicitudes/{solicitud_id}/originales/{timestamp}-{filename}`;
- quedan asociados a la solicitud creada mediante `archivos.solicitud_id`;
- se registran con `visibility = cliente_solicitud`;
- no generan URLs públicas ni URLs firmadas para el cliente.

Desde Fase 11.7B, cada archivo público registrado en `archivos` con `visibility = cliente_solicitud` genera un evento `archivos_adjuntados` en `solicitud_historial`. El evento no incluye `file_path` ni datos personales completos.

La gestión interna permite que `admin` y `supervisor` vean y descarguen estos archivos desde el detalle interno de solicitud mediante URLs firmadas de corta duración. Esa descarga no está disponible para clientes públicos.

Si la solicitud se convierte en pedido, los archivos se heredan por metadatos: se conserva la ruta física original y se completa `archivos.pedido_id` con el pedido generado. No se mueve ni se copia el objeto en Storage.

## Flujo Funcional Actual

1. Cliente entra a `/solicitud`.
2. Completa el formulario.
3. El componente cliente llama a la Server Action.
4. La action convierte `FormData` en input.
5. El servicio valida datos.
6. El servicio inserta la solicitud con estado `nueva`.
7. La base de datos registra `solicitud_creada` en el historial interno.
8. Si hay archivos, la action los valida, sube al bucket privado y registra metadatos.
9. La base de datos registra `archivos_adjuntados` por cada archivo aceptado.
10. La UI muestra éxito, referencia corta y cantidad de archivos recibidos.
11. El equipo interno revisará la solicitud en una fase posterior.

## Flujo Interno Pendiente

En Fase 6 se implementará:

- Listado interno de solicitudes.
- Revisión por admin o supervisor.
- Actualización de estado.
- Preparación para convertir solicitud en pedido.

La conversión real a pedido pertenece a una fase posterior del flujo interno.

## Pruebas Manuales Recomendadas

- Enviar solicitud válida.
- Enviar formulario vacío.
- Enviar email inválido.
- Enviar cantidad negativa.
- Enviar sin email.
- Enviar solicitud sin archivos.
- Enviar solicitud con 1 archivo válido.
- Intentar enviar más de 5 archivos.
- Intentar enviar archivo no permitido.
- Intentar enviar archivo mayor de 20 MB.
- Verificar en Supabase Studio que la solicitud quedó con `status = nueva`.
- Verificar que `cliente_id`, `reviewed_by` y `converted_order_id` quedan en
  `null`.
- Verificar que los archivos quedan bajo `solicitudes/{id}/originales/`.
- Verificar que `pedido_id` y `uploaded_by` quedan en `null` en `archivos`.
- Verificar que no hay lectura pública ni URL pública del archivo.
- Verificar que un usuario anónimo no puede leer solicitudes desde API/UI.

## Problemas Conocidos o Limitaciones

- No hay captcha todavía.
- No hay control avanzado anti-spam.
- No hay lectura ni descarga pública de archivos.
- No hay visualización interna de archivos de solicitudes todavía.
- No hay notificaciones.
- No hay código humano de solicitud.
- No hay asociación automática con clientes.
- No hay seguimiento público por referencia.

## Cierre

La siguiente subfase será la revisión final de Fase 5 antes de pasar a la
gestión interna de solicitudes.
