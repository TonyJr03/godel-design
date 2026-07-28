# Dominio Solicitudes

Este directorio contiene la lógica server-side del dominio Solicitudes. Después de Beta 2.4 queda como el mapa operativo para:

- creación pública de solicitudes;
- validación pública;
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
| Entrada pública | `/solicitud` | Recibir solicitudes externas sin cuenta de usuario. |
| Gestion interna | `/dashboard/solicitudes` | Listar, revisar, asociar cliente, comentar, ver historial y convertir solicitudes. |
| Tracking público | `/estado` | Consultar estado público por `public_reference`; pertenece a `src/lib/public-tracking`, no al dominio interno de solicitudes. |

La conversión Solicitud -> Pedido se dispara desde el detalle interno de una solicitud, pero la operación crítica vive en el dominio Pedidos y en la RPC transaccional `public.convertir_solicitud_a_pedido`. No debe reimplementarse en TypeScript ni moverse a una action.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `index.ts` | Punto de export controlado del dominio. |
| `create-public-solicitud.ts` | Crea solicitudes publicas, genera `public_reference`, inserta con cliente normal de Supabase y devuelve resultado seguro. |
| `public-request-validation.ts` | Orquesta la validación pública y delega reglas comunes o por workflow. |
| `public-request-validation-types.ts` | Tipos, opciones y límites del formulario público. |
| `public-request-validation-common.ts` | Normalizacion y validacion comun de contacto y campos compartidos. |
| `public-request-validation-encargo.ts` | Reglas y DTO para solicitudes de encargo personalizado. |
| `public-request-validation-impresion.ts` | Reglas, opciones y descripción server-side para solicitudes de impresión. |
| `types.ts` | DTOs internos del dominio, como `InternalSolicitud` e `InternalSolicitudDetail`. |
| `list-internal-solicitudes.ts` | Listado interno con filtros, búsqueda server-side, permisos y DTO acotado. |
| `get-internal-solicitud-by-id.ts` | Loader server-side del detalle interno con validacion de UUID, perfil activo y permiso. |
| `update-internal-solicitud-status.ts` | Valida cambio de estado y delega la transicion en RPC segura. |
| `ensure-solicitud-review-started.ts` | Garantia idempotente de inicio de revision al abrir el detalle interno real. |
| `associate-solicitud-cliente.ts` | Asocia una solicitud a un cliente existente con permisos internos. |
| `create-cliente-from-solicitud.ts` | Crea cliente basico desde datos ya guardados en la solicitud y asocia mediante RPC transaccional. |
| `create-solicitud-comment.ts` | Crea comentarios internos append-only. |
| `list-solicitud-comments.ts` | Lista comentarios internos mediante RPC con datos minimos del autor. |
| `list-solicitud-history.ts` | Lista historial interno mediante RPC y mapea metadata relacionada para UI interna. |
| `rpc.ts` | Centraliza wrappers tipados/casteados de RPCs del dominio. |
| `labels.ts` | Traduce estados, servicios e historial a textos visibles. |
| `status.ts` | Define estados, estados iniciales, `SolicitudStatusFlow`, transiciones lineales y helpers temporales de compatibilidad. |

## Flujo público `/solicitud`

`/solicitud` renderiza `PublicSolicitudForm` y usa `src/app/(publico)/solicitud/actions.ts` como Server Action pública. El componente cliente solo maneja interacción, tabs, inputs, archivos seleccionados y mensajes; no consulta Supabase.

La página carga server-side el catálogo desde `tipos_servicio` mediante
`listPublicServiceTypes()`. Solo se muestran servicios con
`is_publicly_available = true`: Encargo aparece si existe al menos un servicio
público de flujo `encargo`, e Impresión aparece solo si el servicio único de
flujo `impresion` está público. Si no hay servicios públicos o el catálogo no
puede cargarse, no se renderiza el formulario.

La action pública:

- lee solo campos permitidos desde `FormData`;
- recibe `service_id` como entrada editable;
- pre-valida archivos cuando aplica;
- calcula `hasFiles` desde los archivos recibidos;
- llama `createPublicSolicitud`;
- coordina la subida de archivos públicos de solicitud;
- devuelve mensajes seguros para la UI.

La validacion definitiva ocurre server-side. El formulario no acepta como fuente
de verdad campos tecnicos como `id`, `status`, `cliente_id`, `reviewed_by`,
`converted_order_id`, `workflow_type`, nombre del servicio, `bucket`, `file_path` o
`uploaded_by`.

`createPublicSolicitud` resuelve el servicio mediante
`getPublicServiceTypeById(service_id)` antes de validar el workflow. Un servicio
oculto, inexistente o con UUID invalido se rechaza como error de `service_id`.
Las solicitudes nuevas insertan `service_id` y `workflow_type` derivado del
servicio. El trigger de base de datos vuelve a sincronizar `workflow_type` desde
`service_id` como defensa adicional.

`desired_date` es opcional; si se informa debe ser una fecha valida igual o posterior al dia actual. El `min` del formulario es ayuda de UX, no autoridad. Las pruebas e2e deben usar fechas futuras dinamicas.

## Gestion interna

`/dashboard/solicitudes` y `/dashboard/solicitudes/[id]` cargan datos server-side. Los servicios validan UUID, perfil interno activo y permisos antes de leer o mutar.

El listado interno usa `service_id` como filtro canonico de servicio. Las
opciones del filtro salen de `listInternalServiceTypeOptions()`, un loader
read-only separado de las operaciones de creación o conversión. Si el catálogo
del filtro falla, el listado, la búsqueda y el filtro de estado siguen
disponibles y la UI muestra un aviso parcial reintentable.

La búsqueda por servicio resuelve `tipos_servicio.name` y aplica coincidencias
por `solicitudes.service_id`. Contract eliminó la columna textual legacy; los
listados y detalles internos usan la relación de catálogo como fuente
canónica. `workflow_type` queda como clasificación operativa secundaria y ya no
es filtro del listado.

El detalle interno carga la relación
`tipos_servicio!solicitudes_service_id_fkey`. El panel Informacion se organiza
como Trabajo solicitado y Registro; muestra el servicio canonico, identifica
servicios ocultos, conserva `Referencia pública` e `Identificador interno`, y
no agrega una referencia interna corta. Si la relación canónica está ausente, el
servicio se presenta como `Servicio no disponible`.

Permisos habituales:

- `solicitudes.view` para listado, detalle, comentarios e historial;
- `solicitudes.manage` para estado, asociación, creación de cliente desde solicitud, comentarios y conversión;
- permisos del dominio destino cuando la operacion cruza limites, como `clientes.manage` o `pedidos.manage`.

Las mutaciones internas devuelven estados controlados para formularios, revalidan rutas afectadas y no filtran errores SQL, Postgres o Supabase al usuario.

## Server Actions internas

Las Server Actions del detalle interno están divididas por familia en:

```text
src/app/(interno)/dashboard/solicitudes/[id]/actions/
```

Familias actuales:

- `status-actions.ts`;
- `client-actions.ts`;
- `comment-actions.ts`;
- `conversion-actions.ts`;
- `shared.ts`.

`src/app/(interno)/dashboard/solicitudes/[id]/actions.ts` queda como facade de re-exports para mantener imports estables desde componentes y paginas. Las actions son adaptadores finos: reciben `solicitud_id` enlazado desde el Server Component, leen solo campos editables, llaman servicios de `src/lib` o dominio Pedidos y revalidan rutas.

## Estados y conversión

Las solicitudes publicas se crean como `nueva`. Al abrir por primera vez el
detalle interno real, `ensureSolicitudReviewStarted` intenta iniciar
`nueva -> en_revision` reutilizando `updateInternalSolicitudStatus` y la RPC
`public.actualizar_estado_solicitud`. No escribe tablas directamente ni mueve
reglas al componente cliente.

`status.ts` identifica estados iniciales, estados cerrados y el
`SolicitudStatusFlow` explícito que consumen los adaptadores de UI. Mantiene
helpers antiguos de transiciones mientras existan imports compatibles, pero el
flujo vigente es lineal: `nueva -> en_revision` automático, `contactada` por
acción directa, `aprobada` por acción directa y `convertida` solo por conversión
formal.

`ensureSolicitudReviewStarted` relee `id,status` solo cuando una transicion de
inicio falla por razón recuperable. Si la solicitud ya no está en estado inicial,
la operacion se considera procesada. No oculta errores reales de autenticacion,
permisos, lectura o infraestructura.

La conversión Solicitud -> Pedido:

- requiere solicitud aprobada;
- requiere cliente asociado;
- requiere usuario interno activo y permisos;
- valida título, descripción, prioridad, monto y fecha estimada;
- delega la escritura critica en `public.convertir_solicitud_a_pedido`;
- conserva el `public_reference` para que `/estado` resuelva el pedido con el mismo código público;
- deja que la base genere `order_number`.

No mover esta lógica a TypeScript. TypeScript mejora UX y mensajes; la transacción vive en RPC.

## Reglas de seguridad

Reglas vigentes para este dominio:

- no usar `service_role`;
- no agregar ni leer `SUPABASE_SERVICE_ROLE_KEY`;
- no consultar `auth.users` desde código de aplicación;
- no mover lógica de dominio a Client Components;
- no consultar Supabase desde componentes cliente;
- mantener Server Actions finas;
- validar perfil activo y permisos en servicios;
- usar RPC/RLS como defensa final en operaciones criticas;
- no exponer `file_path`, bucket, rutas privadas ni metadata cruda;
- no exponer datos internos por rutas publicas;
- devolver errores públicos seguros.

## Relacion con Storage

Los archivos públicos de solicitud se guardan en el bucket privado `godel-files`. La metadata vive en `archivos` y se asocia con `solicitud_id`; antes de conversión, `pedido_id` queda en `null`.

Reglas actuales:

- no hay lectura, listado ni descarga pública de archivos;
- los listados internos no devuelven `file_path`;
- la descarga interna usa route handler y signed URL corta;
- las rutas y categorias se derivan server-side;
- la conversión puede asociar metadata de archivos al pedido sin mover objetos;
- un fallo excepcional entre upload y metadata puede dejar objeto huerfano.

La reconciliación de objetos de Storage sin metadata queda como deuda operativa. No se resuelve abriendo borrado anónimo ni descarga pública.

## Relacion con Public Tracking

`/estado` está documentado en:

```text
src/lib/public-tracking/README.md
```

El contrato público debe mantenerse por allowlist. No debe exponer:

- UUIDs internos;
- `order_number`;
- cliente, teléfono o correo;
- descripción, notas o archivos;
- `file_path`;
- bucket o rutas privadas;
- pagos, deuda o estado financiero;
- comentarios;
- historial;
- tareas o personal interno.

Cualquier cambio al DTO público de `/estado` debe pasar por checklist de ruta pública y `npm.cmd run audit:public-tracking`.

## QA Beta 2.4.8

Beta 2.4.8 agrego specs focales para las rutas publicas:

```text
tests/e2e/public-solicitud.spec.ts
tests/e2e/public-tracking.spec.ts
```

Estos specs verifican render basico, validaciones seguras y ausencia visible de detalles tecnicos sensibles en rutas publicas.

`tests/e2e/full-visual-qa.spec.ts` sigue siendo el recorrido general de aceptacion. No debe usarse como unico diagnostico para nuevos cambios de dominio cuando sea razonable agregar specs focales pequenos.

## Pendientes tecnicos conocidos

- fixture o semilla estable para tracking público positivo;
- reconciliacion interna de objetos de Storage sin metadata;
- rate limiting, captcha u honeypot antes de exposición pública real;
- posible división futura de `PublicSolicitudForm` si crece más;
- posible division futura de `full-visual-qa.spec.ts` por dominios adicionales;
- revisar dependencia de red/Google Fonts en build para reproducibilidad.

## Que no hacer

- No cambiar el DTO público de `/estado` sin checklist de ruta pública.
- No exponer `order_number`.
- No exponer `file_path`.
- No abrir descarga pública de archivos.
- No mover conversión a TypeScript.
- No sacar `convertir_solicitud_a_pedido` de la RPC transaccional.
- No mezclar refactor con features.
- No crear `src/services`.
- No aceptar campos tecnicos desde formularios como fuente de verdad.
- No abrir permisos anonimos directos sobre tablas internas.
