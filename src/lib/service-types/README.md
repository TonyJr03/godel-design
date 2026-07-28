# Dominio service-types

## Rol del dominio

`src/lib/service-types` concentra la lógica server-side del catálogo transversal
`tipos_servicio`. El catálogo describe servicios concretos que pueden quedar
asociados tanto a `solicitudes` como a `pedidos`.

Esta etapa implementa el estado expand: `solicitudes.service_id` y
`pedidos.service_id` existen como columnas nullable, mientras
`solicitudes.service_type` sigue presente temporalmente para compatibilidad
expand. Las solicitudes públicas nuevas ya envían `service_id`; el servidor
resuelve nombre y `workflow_type` desde `tipos_servicio`.

## Disponibilidad pública y uso interno

`is_publicly_available` solo decide si un servicio aparece en experiencias
públicas. Un servicio con `is_publicly_available = false` sigue siendo válido
para uso interno, histórico y operativo.

El listado público filtra explícitamente por `is_publicly_available = true` para
no depender solo de RLS cuando una persona interna visita una ruta pública con
sesión activa.

La matriz vigente es:

- `anon`: lee solo servicios públicos.
- `authenticated` sin perfil interno activo: lee solo servicios públicos.
- `authenticated` con perfil interno activo: lee servicios públicos por la
  política pública y todos los servicios por la política interna.

## workflow_type

`workflow_type` permanece materializado en Solicitudes y Pedidos como
discriminador operativo. Cuando una fila recibe `service_id`, la base de datos
sincroniza `workflow_type` desde `tipos_servicio` mediante trigger.

Crear servicios desde el dominio siempre usa `workflow_type = encargo`. La fila
de `Impresión` es única, se crea por migración y su flujo no puede editarse.

## Ausencia de eliminación

El catálogo no expone delete. La retirada de un servicio del formulario público
se modela con `is_publicly_available = false`, no eliminando la fila.

## API

- `listPublicServiceTypes()`: devuelve servicios públicamente disponibles sin
  requerir autenticación.
- `getPublicServiceTypeById()`: resuelve server-side un servicio público por
  UUID, filtrando `is_publicly_available = true`; se usa para crear solicitudes
  públicas sin confiar en datos enviados por el cliente.
- `listOperationalServiceTypes()`: requiere perfil interno activo y permiso
  operativo de pedidos o solicitudes; devuelve servicios públicos y ocultos
  para creación manual y conversión interna.
- `getOperationalServiceTypeById()`: resuelve server-side un servicio por UUID
  para operaciones internas, sin filtrar por disponibilidad pública. Se usa
  antes de crear, editar o convertir pedidos para enviar `service_id` a las RPCs.
- `listInternalServiceTypeOptions()`: requiere solo perfil interno activo y
  devuelve opciones read-only seguras para filtros internos. No concede
  capacidades de gestión, no página, incluye servicios públicos y ocultos, y
  ordena por `workflow_type`, nombre e ID.
- `listInternalServiceTypes()`: requiere perfil interno activo y
  `configuracion.view`; devuelve servicios públicos y ocultos con búsqueda,
  filtro de disponibilidad pública, paginación interna y conteo global de
  encargos disponibles públicamente.
- `createServiceType()`: requiere `configuracion.manage`, valida nombre,
  descripción y disponibilidad pública, y crea servicios de flujo `encargo`.
- `updateServiceType()`: requiere `configuracion.manage`, valida UUID e input, y
  actualiza nombre, descripción y disponibilidad pública.

## UI interna

La administración del catálogo vive en
`/dashboard/configuracion/servicios`. La ruta exige acceso interno y delega las
mutaciones en server actions finas que revalidan el hub de configuración y el
listado de servicios.

La UI no permite cambiar `workflow_type`: los nuevos servicios se crean como
`encargo` y `Impresión` se representa como servicio de sistema. Ocultar un
servicio solo cambia su disponibilidad pública; no elimina filas ni altera
solicitudes o pedidos existentes.

## Lecturas internas y presentación

Las lecturas internas de Pedidos y Solicitudes usan la referencia segura
`InternalServiceReference` para mostrar el servicio canónico desde
`service_id -> tipos_servicio.name`. El texto `Oculto públicamente` se
centraliza en `labels.ts` y se muestra como información textual, no solo por
color.

Durante el estado expand, `solicitudes.service_type` permanece físicamente para
compatibilidad de escritura hasta la etapa contract, pero las lecturas internas
nuevas de listados y detalles usan `service_id` como fuente canónica. Si una
relación canónica falta, se presenta como `Servicio no disponible`; no se
infiere el servicio a partir de `workflow_type` ni de `service_type`.
