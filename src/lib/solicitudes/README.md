# Solicitudes públicas

Esta carpeta contiene la lógica server-side del flujo público e interno de solicitudes.

## Flujo público

El cliente externo puede enviar datos básicos de contacto y del trabajo solicitado sin tener cuenta de usuario. La solicitud se valida en el servidor y se inserta en Supabase con `estado = "nueva"`.

`PublicSolicitudForm` consume la Server Action `submitPublicSolicitudAction` desde `/solicitud`. El componente cliente captura campos públicos, archivos opcionales y muestra estado de envío, errores y confirmación. No consulta Supabase directamente.

Por seguridad, el flujo público no usa service role key. La inserción se hace con el cliente normal de Supabase y depende de RLS.

## Campos validados

- `cliente_nombre`
- `cliente_telefono`
- `cliente_email`
- `tipo_servicio`
- `descripcion`
- `cantidad`
- `fecha_deseada`
- `observaciones`
- `files`

Los campos se recortan, los opcionales vacíos se convierten a `null`, y se validan longitudes razonables, formato básico de correo, cantidad positiva y fecha válida. `fecha_deseada` es opcional, pero si se informa debe ser igual o posterior al día actual. La validación definitiva ocurre en servidor.

El formulario no acepta campos sensibles como `id`, `estado`, `cliente_id`, `reviewed_by` ni `converted_order_id`.

## Archivos opcionales

El formulario público puede recibir hasta 5 archivos opcionales de referencia. Los archivos se procesan server-side después de crear la solicitud y se asocian a esa solicitud mediante `archivos.solicitud_id`.

Reglas principales:

- la solicitud puede enviarse sin archivos;
- la categoría se fuerza a `cliente_solicitud`;
- los archivos se guardan en el bucket privado `godel-files`;
- la ruta se construye como `solicitudes/{solicitud_id}/originales/{timestamp}-{filename}`;
- `pedido_id` queda en `null`;
- `uploaded_by` queda en `null`;
- no hay lectura pública, listado público ni URLs públicas;
- los archivos se consultarán internamente en una fase posterior.

La solicitud se crea antes de asociar archivos. Si la solicitud se registra correctamente pero algún archivo falla durante la subida, la solicitud se conserva y la UI muestra una advertencia segura.

## Consultas internas

`listInternalSolicitudes` carga el listado server-side para `/dashboard/solicitudes`. Requiere un usuario interno activo con permiso `solicitudes.view`, valida el rol con los helpers de permisos existentes y usa el cliente normal de Supabase, sin service role key.

`getInternalSolicitudById` carga server-side el detalle para `/dashboard/solicitudes/[id]`. Valida que el identificador tenga formato UUID, requiere permiso `solicitudes.view` y consulta Supabase con el cliente normal, sin service role key.

## Cambio de estado

`updateInternalSolicitudStatus` cambia server-side el estado operativo de una solicitud desde la action de `/dashboard/solicitudes/[id]`. Requiere usuario interno activo con permiso `solicitudes.manage`, valida el UUID y solo acepta estados manuales permitidos.

Estados manuales permitidos:

- `nueva`
- `en_revision`
- `contactada`
- `aprobada`
- `rechazada`

`convertida` no aparece en el formulario ni se acepta en servidor; queda reservada para el flujo formal de conversión a pedido.

## Conversión a pedido

Una solicitud aprobada con cliente asociado puede convertirse en pedido desde el detalle interno de la solicitud.

El estado `convertida` no se establece manualmente desde el selector de estado. Se establece mediante el flujo formal de conversión, que crea un pedido, relaciona `pedidos.solicitud_id`, actualiza `solicitudes.converted_order_id` y deja la solicitud en estado `convertida`.

## Asociación solicitud-cliente

`associateSolicitudWithCliente` asocia una solicitud con un cliente existente. Requiere `solicitudes.manage` y `clientes.view`, valida UUID de solicitud y cliente, verifica que ambos registros existan y actualiza únicamente `solicitudes.cliente_id`.

`createClienteFromSolicitudAndAssociate` crea un cliente básico desde los datos ya guardados en la solicitud (`cliente_nombre`, `cliente_telefono`, `cliente_email`) y lo asocia automáticamente. Requiere `solicitudes.manage` y `clientes.manage`.

Las actions del detalle de solicitud son:

- `associateSolicitudClienteAction`
- `createClienteFromSolicitudAction`

No se usa service role key y no se implementa deduplicación avanzada.

## Alcance excluido

- No hay lectura ni descarga pública de archivos.
- No hay visualización interna de archivos de solicitudes todavía.
- No se convierte automáticamente la solicitud en pedido fuera del flujo formal.
- No se implementa deduplicación inteligente de clientes.
