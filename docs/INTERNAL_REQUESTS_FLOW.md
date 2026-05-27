# Flujo Interno de Solicitudes — Godel Diseño

## Propósito

Este documento describe cómo el equipo interno revisa y gestiona las solicitudes
públicas recibidas desde `/solicitud` dentro del dashboard operativo de Godel
Diseño.

## Relación con el flujo público

Las solicitudes se originan desde el formulario público documentado
conceptualmente en `docs/PUBLIC_REQUEST_FLOW.md`. Al enviarse:

- se guardan inicialmente con estado `nueva`;
- quedan disponibles para revisión interna desde el dashboard;
- no se convierten automáticamente en pedidos.

La conversión a pedido queda reservada para una fase posterior.

## Ruta interna principal

La ruta principal es `/dashboard/solicitudes`.

Requisitos de acceso:

- autenticación activa;
- perfil interno activo;
- permiso `solicitudes.view`;
- rol `admin` o `supervisor`.

El rol `trabajador` no debe acceder a esta sección. Puede ver datos de una solicitud únicamente cuando estén relacionados con un pedido asignado, desde el detalle del pedido.

## Listado interno

| Pieza | Archivo |
| --- | --- |
| Página | `src/app/dashboard/solicitudes/page.tsx` |
| Servicio | `src/lib/solicitudes/list-internal-solicitudes.ts` |
| Componente | `src/components/solicitudes/InternalSolicitudesList.tsx` |

El listado:

- carga server-side;
- consulta hasta 50 solicitudes;
- ordena por `created_at` descendente;
- muestra referencia corta, cliente, teléfono, email, tipo de servicio, estado,
  fecha de creación, fecha deseada y cantidad;
- permite filtrar por estado;
- no consulta Supabase desde componentes cliente.

## Filtro por estado

URLs soportadas:

- `/dashboard/solicitudes`
- `/dashboard/solicitudes?estado=nueva`
- `/dashboard/solicitudes?estado=en_revision`
- `/dashboard/solicitudes?estado=contactada`
- `/dashboard/solicitudes?estado=aprobada`
- `/dashboard/solicitudes?estado=rechazada`
- `/dashboard/solicitudes?estado=convertida`

`convertida` puede aparecer como filtro porque será un estado resultante del
flujo formal de conversión a pedido. En esta fase no puede establecerse
manualmente.

## Detalle interno

| Pieza | Archivo |
| --- | --- |
| Ruta | `/dashboard/solicitudes/[id]` |
| Página | `src/app/dashboard/solicitudes/[id]/page.tsx` |
| Servicio | `src/lib/solicitudes/get-internal-solicitud-by-id.ts` |
| Componente | `src/components/solicitudes/InternalSolicitudDetail.tsx` |

El detalle:

- carga server-side;
- valida que el `id` tenga formato UUID;
- usa `notFound()` para id inválido o solicitud inexistente;
- muestra datos completos de la solicitud;
- muestra archivos privados asociados a la solicitud;
- no permite edición completa;
- no convierte a pedido;
- no permite eliminar archivos.

## Archivos de solicitud

| Pieza | Archivo |
| --- | --- |
| Servicio | `src/lib/storage/list-solicitud-files.ts` |
| Componente | `src/components/storage/SolicitudFilesSection.tsx` |
| Descarga | `/dashboard/solicitudes/[id]/archivos/[fileId]/download` |

El detalle interno muestra archivos enviados desde el formulario público cuando existen. Los archivos siguen siendo privados en el bucket `godel-files`; la UI no recibe `file_path` ni URLs públicas.

La descarga se realiza con una ruta interna que valida la solicitud, el archivo, la pertenencia entre ambos y el bucket antes de generar una URL firmada de corta duración. `admin` y `supervisor` pueden descargar. `trabajador` no accede al módulo general de solicitudes y usuarios anónimos no pueden usar la ruta de descarga.

Si la solicitud se convierte en pedido, estos archivos conservan `solicitud_id` y también reciben `pedido_id` en `archivos`. Siguen apareciendo en el detalle interno de solicitud para `admin` y `supervisor`, y quedan disponibles desde el pedido generado como “Archivo enviado por cliente”.

## Cambio de estado

| Pieza | Archivo |
| --- | --- |
| Server Action | `src/app/dashboard/solicitudes/[id]/actions.ts` |
| Servicio | `src/lib/solicitudes/update-internal-solicitud-status.ts` |
| Componente | `src/components/solicitudes/SolicitudStatusForm.tsx` |
| Helpers | `src/lib/solicitudes/status.ts` |

El cambio de estado:

- requiere permiso `solicitudes.manage`;
- se valida server-side;
- actualiza `estado`;
- actualiza `reviewed_by`;
- revalida `/dashboard/solicitudes` y `/dashboard/solicitudes/[id]`;
- no usa service role key.

## Comentarios e historial de solicitudes

La Fase 11.2 agrega la base de datos y RLS para comentarios internos e historial operativo de solicitudes:

- `solicitud_comentarios`;
- `solicitud_historial`;
- `solicitud_historial_action`.

Estas tablas son internas y quedan reservadas para `admin` y `supervisor`. El rol `trabajador` no accede a comentarios ni historial de solicitudes, y usuarios anónimos tampoco acceden.

Los comentarios son append-only inicialmente: no hay actualización ni eliminación. El historial también es append-only.

La Fase 11.4 implementa comentarios internos en `/dashboard/solicitudes/[id]`. `admin` y `supervisor` pueden ver y agregar comentarios; el autor se toma del usuario autenticado en servidor mediante `solicitud_comentarios.autor_id`. El formulario solo envía `solicitud_id` y `contenido`, no acepta autor ni fecha, y no hay edición ni eliminación.

La Fase 11.6 implementa historial visible en `/dashboard/solicitudes/[id]`. `admin` y `supervisor` pueden ver los eventos existentes en `solicitud_historial`; el rol `trabajador` no accede al módulo de solicitudes. La sección muestra tipo de evento, resumen, actor, rol y fecha, sin edición ni eliminación.

No se registran eventos automáticos de historial en esta subfase y no hay comentarios públicos de clientes.

## Estados de solicitud

| Estado | Significado recomendado |
| --- | --- |
| `nueva` | Solicitud recibida y aún no revisada. |
| `en_revision` | El equipo interno está evaluando la solicitud. |
| `contactada` | El cliente fue contactado o se intentó contactar. |
| `aprobada` | Solicitud aceptada para avanzar hacia pedido. |
| `rechazada` | Solicitud no aceptada o descartada. |
| `convertida` | Solicitud ya convertida en pedido interno. |

## Estados manuales permitidos

En Fase 6.3 solo se pueden establecer manualmente:

- `nueva`
- `en_revision`
- `contactada`
- `aprobada`
- `rechazada`

`convertida` no puede establecerse manualmente. Ese estado queda reservado para
el flujo formal de conversión a pedido, que será implementado en una fase
posterior.

## Permisos

| Rol | Acceso |
| --- | --- |
| `admin` | Puede ver y gestionar solicitudes. |
| `supervisor` | Puede ver y gestionar solicitudes. |
| `trabajador` | No puede acceder al módulo general de solicitudes. Puede ver datos de solicitudes relacionadas con pedidos asignados desde el detalle del pedido. |

Permisos usados:

- `solicitudes.view`: lectura de listado y detalle.
- `solicitudes.manage`: cambio manual de estado.

El modelo completo de permisos se documenta conceptualmente en
`docs/PERMISSIONS_MODEL.md`.

## Seguridad

El flujo usa varias capas de protección:

1. Proxy de rutas por rol.
2. Validación server-side de perfil y permisos.
3. RLS en Supabase.
4. Errores controlados sin exponer detalles técnicos.

Aclaraciones:

- no se usa service role key;
- los componentes cliente no consultan Supabase directamente;
- la UI no es la única capa de seguridad;
- no hay lectura pública ni URLs públicas para archivos;
- RLS sigue siendo la defensa final.

## RLS

Las policies existentes permiten:

- lectura de solicitudes a `admin` y `supervisor`;
- lectura de solicitudes a `trabajador` solo cuando la solicitud está relacionada con un pedido asignado;
- actualización de solicitudes a `admin` y `supervisor`;
- bloqueo de acceso del `trabajador` al módulo general de solicitudes y bloqueo de actualización;
- bloqueo de lectura pública anónima;
- inserción pública limitada solo para crear solicitudes nuevas desde el
  formulario público.
- lectura e inserción de `solicitud_comentarios` solo a `admin` y `supervisor`;
- lectura e inserción de `solicitud_historial` solo a `admin` y `supervisor`;
- sin policies de actualización ni eliminación para comentarios o historial de solicitudes.

## Qué NO incluye esta fase

- Conversión de solicitud a pedido.
- Gestión real de clientes.
- Eliminación de archivos adjuntos.
- Historial avanzado de cambios.
- Comentarios internos.
- Notificaciones.
- Reglas estrictas de transición de estados.
- Asignación de personal a pedidos.
- Generación de presupuestos.

## Consideraciones futuras

Más adelante se podrá:

- restringir transiciones de estado;
- registrar historial detallado;
- agregar comentarios internos;
- asociar solicitud a cliente existente;
- convertir solicitud aprobada en pedido;
- permitir eliminación controlada de archivos privados si se define;
- notificar al equipo interno;
- generar códigos humanos de referencia.

El diseño técnico de comentarios internos e historial para la Fase 11 se documenta en `docs/COMMENTS_AND_HISTORY_MODEL.md`.

## Pruebas manuales recomendadas

- Admin ve el listado de solicitudes.
- Supervisor ve el listado de solicitudes.
- Trabajador no puede entrar a `/dashboard/solicitudes`.
- Admin abre el detalle de una solicitud.
- Supervisor abre el detalle de una solicitud.
- Admin descarga un archivo de solicitud.
- Supervisor descarga un archivo de solicitud.
- Verificar que no se muestra `file_path`.
- Verificar que un archivo de otra solicitud no descarga desde este detalle.
- Un id inválido muestra 404.
- Admin cambia el estado de una solicitud.
- Supervisor cambia el estado de una solicitud.
- `convertida` no aparece en el selector.
- Un intento manipulado de enviar `convertida` falla server-side.
- En Supabase Studio, `reviewed_by` se actualiza al cambiar estado.
- `converted_order_id` no se modifica durante cambios manuales de estado.

## Cierre

Con este flujo, Fase 6 queda documentada para revisión final antes de avanzar a
la gestión de clientes o a la fase correspondiente del roadmap.
