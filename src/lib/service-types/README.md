# Dominio service-types

## Rol del dominio

`src/lib/service-types` concentra la logica server-side del catalogo transversal
`tipos_servicio`. El catalogo describe servicios concretos que pueden quedar
asociados tanto a `solicitudes` como a `pedidos`.

Esta etapa implementa el estado expand: `solicitudes.service_id` y
`pedidos.service_id` existen como columnas nullable, mientras
`solicitudes.service_type` sigue presente temporalmente y continua siendo el
campo usado por la aplicacion vigente.

## Disponibilidad publica y uso interno

`is_publicly_available` solo decide si un servicio aparece en experiencias
publicas. Un servicio con `is_publicly_available = false` sigue siendo valido
para uso interno, historico y operativo.

El listado publico filtra explicitamente por `is_publicly_available = true` para
no depender solo de RLS cuando una persona interna visita una ruta publica con
sesion activa.

## workflow_type

`workflow_type` permanece materializado en Solicitudes y Pedidos como
discriminador operativo. Cuando una fila recibe `service_id`, la base de datos
sincroniza `workflow_type` desde `tipos_servicio` mediante trigger.

Crear servicios desde el dominio siempre usa `workflow_type = encargo`. La fila
de `Impresión` es unica, se crea por migracion y su flujo no puede editarse.

## Ausencia de eliminacion

El catalogo no expone delete. La retirada de un servicio del formulario publico
se modela con `is_publicly_available = false`, no eliminando la fila.

## API

- `listPublicServiceTypes()`: devuelve servicios publicamente disponibles sin
  requerir autenticacion.
- `listInternalServiceTypes()`: requiere perfil interno activo y
  `configuracion.view`; devuelve servicios publicos y ocultos.
- `createServiceType()`: requiere `configuracion.manage`, valida nombre,
  descripcion y disponibilidad publica, y crea servicios de flujo `encargo`.
- `updateServiceType()`: requiere `configuracion.manage`, valida UUID e input, y
  actualiza nombre, descripcion y disponibilidad publica.

Las UI todavia no consumen este dominio en la etapa actual.
