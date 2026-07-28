# Dominio service-types

## Rol del dominio

`src/lib/service-types` concentra la logica server-side del catalogo transversal
`tipos_servicio`. El catalogo describe servicios concretos que pueden quedar
asociados tanto a `solicitudes` como a `pedidos`.

Esta etapa implementa el estado expand: `solicitudes.service_id` y
`pedidos.service_id` existen como columnas nullable, mientras
`solicitudes.service_type` sigue presente temporalmente para compatibilidad
expand. Las solicitudes publicas nuevas ya envian `service_id`; el servidor
resuelve nombre y `workflow_type` desde `tipos_servicio`.

## Disponibilidad publica y uso interno

`is_publicly_available` solo decide si un servicio aparece en experiencias
publicas. Un servicio con `is_publicly_available = false` sigue siendo valido
para uso interno, historico y operativo.

El listado publico filtra explicitamente por `is_publicly_available = true` para
no depender solo de RLS cuando una persona interna visita una ruta publica con
sesion activa.

La matriz vigente es:

- `anon`: lee solo servicios publicos.
- `authenticated` sin perfil interno activo: lee solo servicios publicos.
- `authenticated` con perfil interno activo: lee servicios publicos por la
  politica publica y todos los servicios por la politica interna.

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
- `getPublicServiceTypeById()`: resuelve server-side un servicio publico por
  UUID, filtrando `is_publicly_available = true`; se usa para crear solicitudes
  publicas sin confiar en datos enviados por el cliente.
- `listOperationalServiceTypes()`: requiere perfil interno activo y permiso
  operativo de pedidos o solicitudes; devuelve servicios publicos y ocultos
  para creacion manual y conversion interna.
- `getOperationalServiceTypeById()`: resuelve server-side un servicio por UUID
  para operaciones internas, sin filtrar por disponibilidad publica. Se usa
  antes de crear o convertir pedidos para enviar `service_id` a las RPCs.
- `listInternalServiceTypes()`: requiere perfil interno activo y
  `configuracion.view`; devuelve servicios publicos y ocultos con busqueda,
  filtro de disponibilidad publica, paginacion interna y conteo global de
  encargos disponibles publicamente.
- `createServiceType()`: requiere `configuracion.manage`, valida nombre,
  descripcion y disponibilidad publica, y crea servicios de flujo `encargo`.
- `updateServiceType()`: requiere `configuracion.manage`, valida UUID e input, y
  actualiza nombre, descripcion y disponibilidad publica.

## UI interna

La administracion del catalogo vive en
`/dashboard/configuracion/servicios`. La ruta exige acceso interno y delega las
mutaciones en server actions finas que revalidan el hub de configuracion y el
listado de servicios.

La UI no permite cambiar `workflow_type`: los nuevos servicios se crean como
`encargo` y `Impresion` se representa como servicio de sistema. Ocultar un
servicio solo cambia su disponibilidad publica; no elimina filas ni altera
solicitudes o pedidos existentes.
