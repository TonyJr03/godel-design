# Modelo de Comentarios Internos e Historial

## Propósito

Este documento define el diagnóstico y el diseño técnico recomendado para la Fase 11 de Godel Diseño: comentarios internos e historial operativo visible.

La intención es separar claramente dos necesidades distintas:

- comentarios internos escritos por usuarios del equipo;
- historial automático de eventos relevantes generados por acciones del sistema.

Este documento registra el diseño y el estado de avance de las subfases de comentarios e historial. La implementación funcional debe mantenerse alineada con este modelo.

## Alcance

La Fase 11 debe cubrir:

- comentarios internos en pedidos;
- comentarios internos en solicitudes;
- texto del comentario, autor, fecha y entidad relacionada;
- visibilidad interna controlada por rol y por asignación cuando aplique;
- historial automático de eventos relevantes en pedidos;
- historial automático de eventos relevantes en solicitudes;
- usuario que ejecutó la acción cuando aplique;
- fecha del evento;
- entidad afectada;
- tipo de evento;
- resumen visible;
- datos mínimos antes/después cuando sean necesarios para entender el cambio.

## Fuera de Alcance

Quedan fuera del alcance inicial:

- comentarios públicos de clientes;
- menciones;
- notificaciones;
- edición o eliminación de comentarios;
- historial exhaustivo de cada campo;
- reportes avanzados;
- auditoría legal completa;
- exportación de logs.

## Diagnóstico del Estado Actual

### Base de datos

El proyecto no parte de cero. La migración inicial creó estructuras relacionadas con comentarios e historial para pedidos, la subfase 11.1B normalizó sus nombres y la subfase 11.2 agregó la base de solicitudes:

- existe la tabla `pedido_comentarios`, renombrada desde `comentarios`;
- existe la tabla `pedido_historial`, renombrada desde `historial_pedidos`;
- existe el enum `pedido_historial_action`, renombrado desde `historial_pedido_action`;
- existe la tabla `solicitud_comentarios`;
- existe la tabla `solicitud_historial`;
- existe el enum `solicitud_historial_action`;
- existe la RPC `public.actualizar_estado_pedido`;
- existe RLS para `pedido_comentarios`;
- existe RLS para `pedido_historial`;
- existe RLS para `solicitud_comentarios`;
- existe RLS para `solicitud_historial`;
- existen triggers genéricos de `updated_at` en varias tablas, incluido `pedido_comentarios`.

La tabla `pedido_comentarios` está asociada solo a pedidos mediante `pedido_id`. No existe relación con solicitudes.

La tabla `pedido_historial` está asociada solo a pedidos mediante `pedido_id`.

La tabla `solicitud_comentarios` está asociada solo a solicitudes mediante `solicitud_id`.

La tabla `solicitud_historial` está asociada solo a solicitudes mediante `solicitud_id`.

No existe una tabla de historial general para múltiples entidades. Tampoco existe una tabla de comentarios interna que pueda apuntar indistintamente a pedidos o solicitudes; la decisión vigente es mantener tablas separadas por entidad.

### Triggers y Automatización

Existen triggers técnicos de actualización de fecha:

- `set_profiles_updated_at`;
- `set_clientes_updated_at`;
- `set_solicitudes_updated_at`;
- `set_pedidos_updated_at`;
- `set_pedido_comentarios_updated_at`.

No se encontraron triggers de negocio que registren automáticamente eventos de historial por creación, asignación, subida de archivos, conversión de solicitud o asociación de cliente.

### RPC `actualizar_estado_pedido`

La RPC `public.actualizar_estado_pedido` sí registra historial en `pedido_historial` cuando el estado cambia.

Eventos que puede registrar:

- `estado_cambiado`;
- `pedido_entregado`;
- `pedido_cancelado`.

También guarda:

- `user_id = auth.uid()`;
- `old_value` con el estado anterior;
- `new_value` con el estado nuevo;
- `metadata.source = "actualizar_estado_pedido"`.

Si el estado enviado es igual al estado actual, la RPC retorna el pedido sin insertar evento.

### Acciones y Servicios Actuales

Las acciones y servicios actuales no registran historial de forma directa.

El único registro de historial operativo detectado ocurre indirectamente cuando `updateInternalPedidoStatus` llama a la RPC `actualizar_estado_pedido`.

No registran historial actualmente:

- creación manual de pedido;
- conversión de solicitud a pedido;
- asignación de personal;
- remoción de personal;
- subida de archivo de pedido;
- creación pública de solicitud;
- subida pública de archivos de solicitud;
- cambio de estado de solicitud;
- asociación de cliente a solicitud;
- creación de cliente desde solicitud;
- herencia de archivos al convertir solicitud en pedido.

### Comentarios de Pedidos

La Fase 11.3 implementa comentarios internos en el detalle de pedido.

El módulo actual:

- lista comentarios de `pedido_comentarios` en `/dashboard/pedidos/[id]`;
- permite agregar comentarios a usuarios con acceso al pedido;
- usa `user_id = profile.id` como autor;
- guarda `contenido`;
- muestra autor, rol, fecha y contenido;
- no acepta `user_id`, `created_at` ni `updated_at` desde formularios;
- no implementa edición ni eliminación.

El RLS permite lectura e inserción según acceso al pedido. La subfase 11.2 eliminó las policies de actualización y eliminación para mantener comentarios append-only en el alcance inicial.

### Solicitudes

Existen las tablas base `solicitud_comentarios` y `solicitud_historial`, reservadas por RLS a `admin` y `supervisor`.

Los cambios actuales en solicitudes se reflejan en campos como:

- `estado`;
- `reviewed_by`;
- `cliente_id`;
- `converted_order_id`;
- `updated_at`.

Pero esos cambios todavía no se registran automáticamente en la bitácora operativa. El registro automático queda para subfases posteriores.

### Archivos

La tabla `archivos` guarda metadatos y trazabilidad básica:

- `pedido_id`;
- `solicitud_id`;
- `uploaded_by`;
- `file_name`;
- `file_path`;
- `file_type`;
- `file_size`;
- `bucket`;
- `visibility`;
- `created_at`.

No existe registro automático de historial cuando se sube un archivo o cuando se heredan archivos de una solicitud a un pedido.

### Asignaciones

La tabla `pedido_trabajadores` guarda:

- pedido asignado;
- perfil asignado;
- usuario que asignó;
- fecha de asignación.

No existe registro automático en historial cuando se asigna o remueve personal.

## Necesidades Funcionales

### Comentarios Internos

Los comentarios internos deben permitir que el equipo deje contexto operativo sin modificar la entidad principal.

Requisitos iniciales:

- comentario en pedido;
- comentario en solicitud;
- texto obligatorio;
- autor obligatorio;
- fecha de creación;
- relación con pedido o solicitud;
- visibilidad interna;
- sin comentarios públicos de clientes;
- sin edición ni eliminación en la primera versión funcional.

### Historial Automático

El historial debe registrar eventos relevantes sin depender de que el usuario escriba manualmente una nota.

Requisitos iniciales:

- registro automático desde acciones controladas;
- usuario ejecutor cuando aplique;
- fecha del evento;
- entidad afectada;
- tipo de evento;
- resumen visible;
- valores antes/después solo cuando aporten contexto;
- metadatos mínimos y seguros.

El historial no debe usarse como auditoría legal completa ni como copia de todos los cambios de cada campo.

## Opciones de Modelo de Datos

### Opción A: Tablas Únicas por Concepto

Estructura:

- `comentarios_internos`;
- `historial_eventos`.

Campos de relación:

- `pedido_id uuid nullable`;
- `solicitud_id uuid nullable`;

Cada fila debe apuntar a una sola entidad. Esto requeriría una restricción para asegurar que exactamente uno de los dos campos sea distinto de `null`.

Ventajas:

- un solo servicio de comentarios;
- un solo servicio de historial;
- una UI reutilizable por entidad;
- permite agregar nuevas entidades en el futuro con menos tablas.

Desventajas:

- RLS más delicada porque cada policy debe evaluar varias entidades posibles;
- restricciones más complejas para evitar filas ambiguas;
- consultas con más condiciones condicionales;
- mayor probabilidad de mezclar reglas de pedidos y solicitudes;
- implica migrar o convivir con tablas específicas por entidad.

### Opción B: Tablas Separadas por Entidad

Estructura conceptual:

- `pedido_comentarios`;
- `solicitud_comentarios`;
- `pedido_historial`;
- `solicitud_historial`.

Ventajas:

- RLS más simple;
- consultas más explícitas;
- relaciones más claras;
- permisos más fáciles de razonar;
- evita condicionales por entidad;
- encaja mejor con la separación actual entre pedidos y solicitudes.

Desventajas:

- más tablas;
- servicios separados o helpers compartidos;
- algo más de duplicación controlada;
- si en el futuro aparecen muchas entidades comentables, puede crecer el número de tablas.

## Decisión Recomendada

Se recomienda la Opción B, ajustada al estado real del proyecto.

La subfase 11.1B formaliza esta decisión al normalizar las tablas de pedidos:

- `pedido_comentarios`;
- `pedido_historial`;
- `pedido_historial_action`.

Las tablas de solicitudes creadas en Fase 11.2 son:

- `solicitud_comentarios`;
- `solicitud_historial`;
- `solicitud_historial_action`.

La recomendación práctica es mantener servicios separados para pedidos y solicitudes, con validaciones compartidas cuando sea útil.

Esta opción prioriza simplicidad, claridad, RLS sencilla, mantenimiento y escalabilidad razonable sin sobreingeniería.

## Tablas Propuestas

### Comentarios de Pedidos

Tabla existente: `pedido_comentarios`.

Uso recomendado: comentarios internos asociados a pedidos.

Campos existentes:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del comentario. |
| `pedido_id` | `uuid` | Pedido comentado. |
| `user_id` | `uuid` | Autor interno. |
| `contenido` | `text` | Texto del comentario. |
| `created_at` | `timestamptz` | Fecha de creación. |
| `updated_at` | `timestamptz` | Fecha de última actualización. |

Consideración para Fase 11.2:

- no exponer edición ni eliminación en UI;
- evaluar si conviene restringir RLS de `update` y `delete` para alinearlo con el alcance inicial.

### Comentarios de Solicitudes

Tabla existente: `solicitud_comentarios`.

Campos propuestos:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del comentario. |
| `solicitud_id` | `uuid` | Solicitud comentada. |
| `autor_id` | `uuid` | Autor interno. |
| `contenido` | `text` | Texto del comentario. |
| `created_at` | `timestamptz` | Fecha de creación. |

Reglas recomendadas:

- `contenido` obligatorio y no vacío;
- longitud máxima de `contenido` de 2000 caracteres;
- `solicitud_id` obligatorio;
- `autor_id` obligatorio y debe corresponder al usuario autenticado;
- sin `updated_at` si no habrá edición inicial;
- sin edición ni eliminación en la primera versión funcional.

### Historial de Pedidos

Tabla existente: `pedido_historial`.

Campos existentes:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del evento. |
| `pedido_id` | `uuid` | Pedido relacionado. |
| `user_id` | `uuid nullable` | Usuario que ejecutó la acción, si aplica. |
| `action` | `pedido_historial_action` | Tipo de evento. |
| `old_value` | `text nullable` | Valor anterior cuando aplique. |
| `new_value` | `text nullable` | Valor nuevo cuando aplique. |
| `metadata` | `jsonb nullable` | Datos adicionales mínimos. |
| `created_at` | `timestamptz` | Fecha del evento. |

Estado desde Fase 11.2:

- conservar la tabla;
- mantener lectura según acceso al pedido;
- permitir comentarios de pedidos accesibles;
- no permitir actualización ni eliminación desde la aplicación;
- mantener la escritura de historial controlada por RPC o flujos internos.

### Historial de Solicitudes

Tabla existente: `solicitud_historial`.

Campos propuestos:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | `uuid` | Identificador del evento. |
| `solicitud_id` | `uuid` | Solicitud relacionada. |
| `actor_id` | `uuid nullable` | Usuario ejecutor si aplica. |
| `action` | `solicitud_historial_action` | Tipo de evento. |
| `resumen` | `text` | Texto breve visible para la UI. |
| `metadata` | `jsonb` | Datos adicionales mínimos, como objeto JSON. |
| `created_at` | `timestamptz` | Fecha del evento. |

Enum existente: `solicitud_historial_action`.

Valores iniciales:

- `solicitud_creada`;
- `archivos_adjuntados`;
- `estado_cambiado`;
- `cliente_asociado`;
- `cliente_creado_desde_solicitud`;
- `convertida_a_pedido`.

## Eventos Iniciales Propuestos

### Pedidos

Eventos mínimos:

| Evento | Cuándo registrar | Datos mínimos |
| --- | --- | --- |
| `pedido_creado` | Pedido creado manualmente. | `pedido_id`, `user_id`, resumen, origen manual. |
| `pedido_creado` | Pedido creado desde solicitud. | `pedido_id`, `solicitud_id`, `user_id`, origen solicitud. |
| `estado_cambiado` | Cambio de estado normal. | estado anterior, estado nuevo, usuario. |
| `pedido_entregado` | Cambio a `entregado`. | estado anterior, estado nuevo, usuario. |
| `pedido_cancelado` | Cambio a `cancelado`. | estado anterior, estado nuevo, usuario. |
| `trabajador_asignado` | Se asigna personal al pedido. | perfil asignado, usuario que asignó. |
| `trabajador_removido` | Se remueve personal del pedido. | perfil removido, usuario que removió. |
| `archivo_subido` | Se sube archivo de pedido. | archivo, categoría, usuario. |
| `nota_agregada` | Se crea comentario interno de pedido. | comentario, autor. |

La RPC actual ya cubre cambios de estado de pedido. Los demás eventos todavía no están conectados a acciones o servicios.

### Solicitudes

Eventos mínimos:

| Evento | Cuándo registrar | Datos mínimos |
| --- | --- | --- |
| `solicitud_creada` | Solicitud pública creada. | `solicitud_id`, origen público. |
| `archivos_adjuntados` | Cliente adjunta uno o varios archivos a la solicitud. | archivos, nombres seguros, solicitud. |
| `estado_cambiado` | Admin o supervisor cambia estado. | estado anterior, estado nuevo, usuario. |
| `cliente_asociado` | Se asocia cliente existente. | cliente, usuario. |
| `cliente_creado_desde_solicitud` | Se crea cliente desde solicitud. | cliente creado, usuario. |
| `convertida_a_pedido` | Se convierte solicitud a pedido. | pedido generado, usuario. |

## Permisos Propuestos

### Comentarios de Pedidos

| Rol | Regla |
| --- | --- |
| `admin` | Puede ver y comentar en cualquier pedido. |
| `supervisor` | Puede ver y comentar en cualquier pedido. |
| `trabajador` | Puede ver y comentar solo en pedidos asignados. |
| Anónimo | No accede. |

### Comentarios de Solicitudes

| Rol | Regla |
| --- | --- |
| `admin` | Puede ver y comentar. |
| `supervisor` | Puede ver y comentar. |
| `trabajador` | No accede a solicitudes internas. |
| Anónimo | No accede. |

### Historial de Pedidos

| Rol | Regla |
| --- | --- |
| `admin` | Ve historial de cualquier pedido. |
| `supervisor` | Ve historial de cualquier pedido. |
| `trabajador` | Ve historial solo de pedidos asignados. |
| Anónimo | No accede. |

### Historial de Solicitudes

| Rol | Regla |
| --- | --- |
| `admin` | Ve historial de solicitudes. |
| `supervisor` | Ve historial de solicitudes. |
| `trabajador` | No accede. |
| Anónimo | No accede. |

## Estrategia de Implementación

Subfases recomendadas después de este diagnóstico:

1. Migraciones y RLS.
2. Servicios base.
3. UI de comentarios en pedidos.
4. UI de comentarios en solicitudes.
5. Registro automático de historial en acciones existentes.
6. Documentación y cierre.

### Fase 11.2: Migraciones y RLS

Objetivos:

- crear `solicitud_comentarios`;
- crear `solicitud_historial`;
- crear enum `solicitud_historial_action`;
- dejar `pedido_comentarios` sin `update` y `delete` para el alcance append-only inicial;
- dejar `pedido_historial` sin inserción directa, actualización ni eliminación desde tabla;
- mantener RLS simple por entidad;
- no crear UI ni servicios funcionales todavía.

No debería usarse service role key.

### Fase 11.3: Servicios Base

Estado:

- implementado para comentarios internos de pedidos;
- `listPedidoComments` lista comentarios por pedido en orden ascendente;
- `createPedidoComment` valida UUID, permiso, acceso al pedido y contenido;
- la action del detalle solo lee `pedido_id` y `contenido`;
- no se acepta autor desde el formulario;
- no se implementan comentarios de solicitudes;
- no se implementa historial visible;
- no se registra historial automático adicional.

### Fase 11.4: UI de Comentarios en Pedidos

Estado:

- implementado en `PedidoCommentsSection`;
- lista comentarios internos de pedido;
- permite crear comentario si el usuario tiene acceso;
- muestra autor, rol, fecha y contenido;
- no implementar edición ni eliminación.

### Fase 11.5: UI de Comentarios en Solicitudes

Objetivos:

- listar comentarios internos de solicitud;
- permitir comentar solo a `admin` y `supervisor`;
- mostrar autor y fecha;
- no exponer a trabajadores ni anónimos.

### Fase 11.6: Registro Automático de Historial

Objetivos:

- conectar creación manual de pedido;
- conectar conversión de solicitud a pedido;
- conectar asignación y remoción de personal;
- conectar subida de archivos de pedido;
- conectar creación pública de solicitud;
- conectar archivos de solicitud;
- conectar cambio de estado de solicitud;
- conectar asociación y creación de cliente desde solicitud;
- mantener eventos mínimos y útiles.

### Fase 11.7: Documentación y Cierre

Objetivos:

- actualizar documentación funcional;
- documentar pruebas manuales recomendadas;
- confirmar que RLS y servicios cumplen la matriz definida.

## Riesgos

- Las tablas actuales ya existen, por lo que un rediseño hacia tablas únicas implicaría migraciones de datos y mayor riesgo.
- `pedido_comentarios` queda append-only desde la base, pero una futura edición controlada requeriría policies nuevas y diseño específico.
- `pedido_historial` queda sin inserción directa por tabla; los eventos futuros deben escribirse mediante RPC o flujos internos controlados.
- Registrar historial desde muchas acciones puede dejar eventos duplicados si no se define una estrategia clara.
- La conversión de solicitud a pedido afecta varias entidades y debe evitar inconsistencias si una parte del flujo falla.
- Los eventos de archivos deben registrar metadatos seguros, no rutas privadas ni URLs firmadas.
- El historial debe ser útil para operación, sin convertirse en auditoría exhaustiva difícil de mantener.

## Consideraciones Futuras

Más adelante se podría evaluar:

- menciones a usuarios internos;
- notificaciones por comentario o evento;
- edición controlada de comentarios con historial de edición;
- eliminación lógica de comentarios;
- filtros de historial por tipo de evento;
- historial unificado de cliente;
- exportación administrativa de eventos;
- auditoría legal completa si el negocio la requiere;
- vistas agregadas de actividad reciente.

## Conclusión

La decisión recomendada es mantener un modelo separado por entidad, compatible con las tablas ya existentes para pedidos y extendido con tablas específicas para solicitudes.

Esto permite avanzar en Fase 11 con bajo riesgo, RLS comprensible y una separación clara entre conversación interna e historial automático.
