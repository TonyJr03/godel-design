# Dominio Solicitudes

Este directorio contiene la logica server-side del dominio Solicitudes. Despues de Beta 2.4 queda como el mapa operativo para:

- creacion publica de solicitudes;
- validacion publica;
- listado interno;
- detalle interno;
- cambio de estado;
- asociacion de cliente;
- creacion de cliente desde solicitud;
- comentarios internos;
- historial interno;
- wrappers RPC del dominio.

`src/lib/solicitudes` es capa de dominio. Las rutas App Router y Server Actions adaptan formularios y navegacion, pero las reglas de validacion, permisos, DTOs seguros y mutaciones viven aqui o en RPCs cuando la operacion es critica.

## Separacion de flujos

Hay tres superficies relacionadas, pero no equivalentes:

| Superficie | Ubicacion | Responsabilidad |
|---|---|---|
| Entrada publica | `/solicitud` | Recibir solicitudes externas sin cuenta de usuario. |
| Gestion interna | `/dashboard/solicitudes` | Listar, revisar, asociar cliente, comentar, ver historial y convertir solicitudes. |
| Tracking publico | `/estado` | Consultar estado publico por `public_reference`; pertenece a `src/lib/public-tracking`, no al dominio interno de solicitudes. |

La conversion Solicitud -> Pedido se dispara desde el detalle interno de una solicitud, pero la operacion critica vive en el dominio Pedidos y en la RPC transaccional `public.convertir_solicitud_a_pedido`. No debe reimplementarse en TypeScript ni moverse a una action.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `index.ts` | Punto de export controlado del dominio. |
| `create-public-solicitud.ts` | Crea solicitudes publicas, genera `public_reference`, inserta con cliente normal de Supabase y devuelve resultado seguro. |
| `public-request-validation.ts` | Orquesta la validacion publica y delega reglas comunes o por workflow. |
| `public-request-validation-types.ts` | Tipos, opciones y limites del formulario publico. |
| `public-request-validation-common.ts` | Normalizacion y validacion comun de contacto, workflow y campos compartidos. |
| `public-request-validation-encargo.ts` | Reglas y DTO para solicitudes de encargo personalizado. |
| `public-request-validation-impresion.ts` | Reglas, opciones y descripcion server-side para solicitudes de impresion. |
| `list-internal-solicitudes.ts` | Listado interno con filtros, busqueda server-side, permisos y DTO acotado. |
| `get-internal-solicitud-by-id.ts` | Loader server-side del detalle interno con validacion de UUID, perfil activo y permiso. |
| `update-internal-solicitud-status.ts` | Valida cambio de estado y delega la transicion en RPC segura. |
| `associate-solicitud-cliente.ts` | Asocia una solicitud a un cliente existente con permisos internos. |
| `create-cliente-from-solicitud.ts` | Crea cliente basico desde datos ya guardados en la solicitud y asocia mediante RPC transaccional. |
| `create-solicitud-comment.ts` | Crea comentarios internos append-only. |
| `list-solicitud-comments.ts` | Lista comentarios internos mediante RPC con datos minimos del autor. |
| `list-solicitud-history.ts` | Lista historial interno mediante RPC y mapea metadata relacionada para UI interna. |
| `rpc.ts` | Centraliza wrappers tipados/casteados de RPCs del dominio. |
| `labels.ts` | Traduce estados, servicios e historial a textos visibles. |
| `status.ts` | Define estados, transiciones manuales y estados cerrados del dominio. |

## Flujo publico `/solicitud`

`/solicitud` renderiza `PublicSolicitudForm` y usa `src/app/solicitud/actions.ts` como Server Action publica. El componente cliente solo maneja interaccion, tabs, inputs, archivos seleccionados y mensajes; no consulta Supabase.

La action publica:

- lee solo campos permitidos desde `FormData`;
- pre-valida archivos cuando aplica;
- llama `createPublicSolicitud`;
- coordina la subida de archivos publicos de solicitud;
- devuelve mensajes seguros para la UI.

La validacion definitiva ocurre server-side. El formulario no acepta como fuente de verdad campos tecnicos como `id`, `status`, `cliente_id`, `reviewed_by`, `converted_order_id`, `bucket`, `file_path` o `uploaded_by`.

`desired_date` es opcional; si se informa debe ser una fecha valida igual o posterior al dia actual. El `min` del formulario es ayuda de UX, no autoridad. Las pruebas e2e deben usar fechas futuras dinamicas.

## Gestion interna

`/dashboard/solicitudes` y `/dashboard/solicitudes/[id]` cargan datos server-side. Los servicios validan UUID, perfil interno activo y permisos antes de leer o mutar.

Permisos habituales:

- `solicitudes.view` para listado, detalle, comentarios e historial;
- `solicitudes.manage` para estado, asociacion, creacion de cliente desde solicitud, comentarios y conversion;
- permisos del dominio destino cuando la operacion cruza limites, como `clientes.manage` o `pedidos.manage`.

Las mutaciones internas devuelven estados controlados para formularios, revalidan rutas afectadas y no filtran errores SQL, Postgres o Supabase al usuario.

## Server Actions internas

Las Server Actions del detalle interno estan divididas por familia en:

```text
src/app/dashboard/solicitudes/[id]/actions/
```

Familias actuales:

- `status-actions.ts`;
- `client-actions.ts`;
- `comment-actions.ts`;
- `conversion-actions.ts`;
- `shared.ts`.

`src/app/dashboard/solicitudes/[id]/actions.ts` queda como facade de re-exports para mantener imports estables desde componentes y paginas. Las actions son adaptadores finos: reciben `solicitud_id` enlazado desde el Server Component, leen solo campos editables, llaman servicios de `src/lib` o dominio Pedidos y revalidan rutas.

## Estados y conversion

Los cambios manuales de estado se validan en `status.ts` y `update-internal-solicitud-status.ts`. El estado `convertida` no se asigna manualmente desde UI; queda reservado para la conversion formal a pedido.

La conversion Solicitud -> Pedido:

- requiere solicitud aprobada;
- requiere cliente asociado;
- requiere usuario interno activo y permisos;
- valida titulo, descripcion, prioridad, monto y fecha estimada;
- delega la escritura critica en `public.convertir_solicitud_a_pedido`;
- conserva el `public_reference` para que `/estado` resuelva el pedido con el mismo codigo publico;
- deja que la base genere `order_number`.

No mover esta logica a TypeScript. TypeScript mejora UX y mensajes; la transaccion vive en RPC.

## Reglas de seguridad

Reglas vigentes para este dominio:

- no usar `service_role`;
- no agregar ni leer `SUPABASE_SERVICE_ROLE_KEY`;
- no consultar `auth.users` desde codigo de aplicacion;
- no mover logica de dominio a Client Components;
- no consultar Supabase desde componentes cliente;
- mantener Server Actions finas;
- validar perfil activo y permisos en servicios;
- usar RPC/RLS como defensa final en operaciones criticas;
- no exponer `file_path`, bucket, rutas privadas ni metadata cruda;
- no exponer datos internos por rutas publicas;
- devolver errores publicos seguros.

## Relacion con Storage

Los archivos publicos de solicitud se guardan en el bucket privado `godel-files`. La metadata vive en `archivos` y se asocia con `solicitud_id`; antes de conversion, `pedido_id` queda en `null`.

Reglas actuales:

- no hay lectura, listado ni descarga publica de archivos;
- los listados internos no devuelven `file_path`;
- la descarga interna usa route handler y signed URL corta;
- las rutas y categorias se derivan server-side;
- la conversion puede asociar metadata de archivos al pedido sin mover objetos;
- un fallo excepcional entre upload y metadata puede dejar objeto huerfano.

La reconciliacion de objetos de Storage sin metadata queda como deuda operativa. No se resuelve abriendo borrado anonimo ni descarga publica.

## Relacion con Public Tracking

`/estado` esta documentado en:

```text
src/lib/public-tracking/README.md
```

El contrato publico debe mantenerse por allowlist. No debe exponer:

- UUIDs internos;
- `order_number`;
- cliente, telefono o correo;
- descripcion, notas o archivos;
- `file_path`;
- bucket o rutas privadas;
- pagos, deuda o estado financiero;
- comentarios;
- historial;
- tareas o personal interno.

Cualquier cambio al DTO publico de `/estado` debe pasar por checklist de ruta publica y `npm.cmd run audit:public-tracking`.

## QA Beta 2.4.8

Beta 2.4.8 agrego specs focales para las rutas publicas:

```text
tests/e2e/public-solicitud.spec.ts
tests/e2e/public-tracking.spec.ts
```

Estos specs verifican render basico, validaciones seguras y ausencia visible de detalles tecnicos sensibles en rutas publicas.

`tests/e2e/full-visual-qa.spec.ts` sigue siendo el recorrido general de aceptacion. No debe usarse como unico diagnostico para nuevos cambios de dominio cuando sea razonable agregar specs focales pequenos.

## Pendientes tecnicos conocidos

- fixture o semilla estable para tracking publico positivo;
- reconciliacion interna de objetos de Storage sin metadata;
- rate limiting, captcha u honeypot antes de exposicion publica real;
- posible division futura de `PublicSolicitudForm` si crece mas;
- posible division futura de `full-visual-qa.spec.ts` por dominios adicionales;
- revisar dependencia de red/Google Fonts en build para reproducibilidad.

## Que no hacer

- No cambiar el DTO publico de `/estado` sin checklist de ruta publica.
- No exponer `order_number`.
- No exponer `file_path`.
- No abrir descarga publica de archivos.
- No mover conversion a TypeScript.
- No sacar `convertir_solicitud_a_pedido` de la RPC transaccional.
- No mezclar refactor con features.
- No crear `src/services`.
- No aceptar campos tecnicos desde formularios como fuente de verdad.
- No abrir permisos anonimos directos sobre tablas internas.
