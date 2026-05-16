# Flujo Interno de Solicitudes — Godel Design

## Proposito

Este documento describe como el equipo interno revisa y gestiona las solicitudes
publicas recibidas desde `/solicitud` dentro del dashboard operativo de Godel
Design.

## Relacion con el flujo publico

Las solicitudes se originan desde el formulario publico documentado
conceptualmente en `docs/PUBLIC_REQUEST_FLOW.md`. Al enviarse:

- se guardan inicialmente con estado `nueva`;
- quedan disponibles para revision interna desde el dashboard;
- no se convierten automaticamente en pedidos.

La conversion a pedido queda reservada para una fase posterior.

## Ruta interna principal

La ruta principal es `/dashboard/solicitudes`.

Requisitos de acceso:

- autenticacion activa;
- perfil interno activo;
- permiso `solicitudes.view`;
- rol `admin` o `supervisor`.

El rol `trabajador` no debe acceder a esta seccion.

## Listado interno

| Pieza | Archivo |
| --- | --- |
| Pagina | `src/app/dashboard/solicitudes/page.tsx` |
| Servicio | `src/lib/solicitudes/list-internal-solicitudes.ts` |
| Componente | `src/components/solicitudes/InternalSolicitudesList.tsx` |

El listado:

- carga server-side;
- consulta hasta 50 solicitudes;
- ordena por `created_at` descendente;
- muestra referencia corta, cliente, telefono, email, tipo de servicio, estado,
  fecha de creacion, fecha deseada y cantidad;
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

`convertida` puede aparecer como filtro porque sera un estado resultante del
flujo formal de conversion a pedido. En esta fase no puede establecerse
manualmente.

## Detalle interno

| Pieza | Archivo |
| --- | --- |
| Ruta | `/dashboard/solicitudes/[id]` |
| Pagina | `src/app/dashboard/solicitudes/[id]/page.tsx` |
| Servicio | `src/lib/solicitudes/get-internal-solicitud-by-id.ts` |
| Componente | `src/components/solicitudes/InternalSolicitudDetail.tsx` |

El detalle:

- carga server-side;
- valida que el `id` tenga formato UUID;
- usa `notFound()` para id invalido o solicitud inexistente;
- muestra datos completos de la solicitud;
- no permite edicion completa;
- no convierte a pedido;
- no gestiona archivos.

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

## Estados de solicitud

| Estado | Significado recomendado |
| --- | --- |
| `nueva` | Solicitud recibida y aun no revisada. |
| `en_revision` | El equipo interno esta evaluando la solicitud. |
| `contactada` | El cliente fue contactado o se intento contactar. |
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
el flujo formal de conversion a pedido, que sera implementado en una fase
posterior.

## Permisos

| Rol | Acceso |
| --- | --- |
| `admin` | Puede ver y gestionar solicitudes. |
| `supervisor` | Puede ver y gestionar solicitudes. |
| `trabajador` | No puede acceder a solicitudes. |

Permisos usados:

- `solicitudes.view`: lectura de listado y detalle.
- `solicitudes.manage`: cambio manual de estado.

El modelo completo de permisos se documenta conceptualmente en
`docs/PERMISSIONS_MODEL.md`.

## Seguridad

El flujo usa varias capas de proteccion:

1. Proxy de rutas por rol.
2. Validacion server-side de perfil y permisos.
3. RLS en Supabase.
4. Errores controlados sin exponer detalles tecnicos.

Aclaraciones:

- no se usa service role key;
- los componentes cliente no consultan Supabase directamente;
- la UI no es la unica capa de seguridad;
- RLS sigue siendo la defensa final.

## RLS

Las policies existentes permiten:

- lectura de solicitudes a `admin` y `supervisor`;
- actualizacion de solicitudes a `admin` y `supervisor`;
- bloqueo de lectura y actualizacion a `trabajador`;
- bloqueo de lectura publica anonima;
- insercion publica limitada solo para crear solicitudes nuevas desde el
  formulario publico.

## Que NO incluye esta fase

- Conversion de solicitud a pedido.
- Gestion real de clientes.
- Archivos adjuntos.
- Historial avanzado de cambios.
- Comentarios internos.
- Notificaciones.
- Reglas estrictas de transicion de estados.
- Asignacion de trabajadores.
- Generacion de presupuestos.

## Consideraciones futuras

Mas adelante se podra:

- restringir transiciones de estado;
- registrar historial detallado;
- asociar solicitud a cliente existente;
- convertir solicitud aprobada en pedido;
- adjuntar archivos privados;
- notificar al equipo interno;
- generar codigos humanos de referencia.

## Pruebas manuales recomendadas

- Admin ve el listado de solicitudes.
- Supervisor ve el listado de solicitudes.
- Trabajador no puede entrar a `/dashboard/solicitudes`.
- Admin abre el detalle de una solicitud.
- Supervisor abre el detalle de una solicitud.
- Un id invalido muestra 404.
- Admin cambia el estado de una solicitud.
- Supervisor cambia el estado de una solicitud.
- `convertida` no aparece en el selector.
- Un intento manipulado de enviar `convertida` falla server-side.
- En Supabase Studio, `reviewed_by` se actualiza al cambiar estado.
- `converted_order_id` no se modifica durante cambios manuales de estado.

## Cierre

Con este flujo, Fase 6 queda documentada para revision final antes de avanzar a
la gestion de clientes o a la fase correspondiente del roadmap.
