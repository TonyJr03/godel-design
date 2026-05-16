# Solicitudes publicas

Esta carpeta contiene la logica server-side del flujo publico de solicitudes
para `/solicitud`.

## Flujo actual

En Fase 5.1 el cliente externo puede enviar datos basicos de contacto y del
trabajo solicitado sin tener cuenta de usuario. La solicitud se valida en el
servidor y se inserta en Supabase con `estado = "nueva"`.

En Fase 5.2, `PublicSolicitudForm` consume la Server Action
`submitPublicSolicitudAction` desde `/solicitud`. El componente cliente solo
captura campos publicos y muestra estado de envio, errores y confirmacion.

Por seguridad, el flujo publico no usa service role key. La insercion se hace
con el cliente normal de Supabase y depende de RLS.

## Campos validados

- `cliente_nombre`
- `cliente_telefono`
- `cliente_email`
- `tipo_servicio`
- `descripcion`
- `cantidad`
- `fecha_deseada`
- `observaciones`

Los campos se recortan, los opcionales vacios se convierten a `null`, y se
validan longitudes razonables, formato basico de correo, cantidad positiva y
fecha valida. `fecha_deseada` es opcional, pero si se informa debe ser igual o
posterior al dia actual. La validacion definitiva ocurre en servidor.

El formulario no acepta campos sensibles como `id`, `estado`, `cliente_id`,
`reviewed_by` ni `converted_order_id`. La validacion definitiva sigue estando
en servidor.

La referencia mostrada al cliente es una version corta del UUID de la solicitud
y sirve solo como ayuda de seguimiento. No permite leer ni modificar
solicitudes; RLS impide la lectura publica de `solicitudes`.

## Alcance excluido

- No hay subida real de archivos todavia.
- No se crean buckets ni policies de Storage desde este modulo.
- No se convierte automaticamente la solicitud en pedido.
- No se hace deduplicacion avanzada ni asociacion inteligente de clientes;
  queda para Fase 7.

## Consultas internas

`listInternalSolicitudes` carga el listado server-side para
`/dashboard/solicitudes`. Requiere un usuario interno activo con permiso
`solicitudes.view`, valida el rol con los helpers de permisos existentes y usa
el cliente normal de Supabase, sin service role key.

La consulta respeta RLS: `admin` y `supervisor` pueden leer solicitudes, pero
`trabajador` y usuarios anonimos no deben acceder. El filtro opcional `estado`
solo acepta los estados definidos en `solicitud_estado`; valores invalidos se
ignoran de forma controlada.

## Detalle interno

`getInternalSolicitudById` carga server-side el detalle para
`/dashboard/solicitudes/[id]`. Valida que el identificador tenga formato UUID,
requiere permiso `solicitudes.view` y consulta Supabase con el cliente normal,
sin service role key.

La ruta de detalle respeta RLS y no consulta pedidos ni archivos. Tampoco
permite editar solicitudes, cambiar estado, eliminar datos ni convertir a
pedido; esas acciones quedan para subfases posteriores.

## Decision sobre clientes

La tabla `solicitudes` guarda una copia de los datos de contacto publicos. En
esta fase se deja `cliente_id = null` y no se inserta en `clientes`, porque la
politica RLS publica actual permite crear solicitudes nuevas sin exponer ni
modificar la tabla de clientes. La asociacion con clientes se resolvera en una
fase posterior.
