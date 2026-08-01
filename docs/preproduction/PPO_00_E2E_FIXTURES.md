# PPO-00.4B - Ownership E2E y cleanup local

## Proposito

Este documento registra el contrato implementado para ownership E2E y cleanup
local de los scopes iniciales `servicios`, `clientes`, `solicitudes` y
`pedidos`. El objetivo es que cada corrida pueda identificar sus propios datos
QA sin depender del primer registro visible y sin tocar datos canonicos u
operativos relacionados.

## Run ID

El formato del run ID es:

```text
YYYYMMDDHHMMSS-xxxxxxxx
```

`xxxxxxxx` son ocho caracteres hexadecimales en minusculas generados
criptograficamente. Para ejecuciones reproducibles puede definirse:

```text
GODEL_E2E_RUN_ID
```

Si la variable existe debe respetar exactamente el formato anterior. Un valor
invalido falla de forma explicita y no se reemplaza por otro ID.

## Ownership Prefix

El prefijo depende del scope:

```text
E2E-<scope>-<runId>
```

El prefijo es ASCII, no contiene espacios, no incluye correos, UUID, tokens ni
secretos, y permite busquedas exactas por corrida.

El contexto de corrida usado por los specs esta tipado por scope para que los
helpers reciban solo el ownership que pueden crear. Las guardas runtime
mantienen la misma frontera cuando un helper se invoca fuera del tipo esperado.

Scopes registrados:

- `servicios`: `E2E-servicios-<runId>`
- `clientes`: `E2E-clientes-<runId>`
- `solicitudes`: `E2E-solicitudes-<runId>`
- `pedidos`: `E2E-pedidos-<runId>`

## Scope Servicios

El spec de servicios crea mediante la UI productiva un servicio configurable de
tipo `encargo` con nombre y descripciones que incluyen el ownership prefix de
la corrida.

El spec no recibe secretos administrativos, no ejecuta Docker, no ejecuta
`psql` y no realiza cleanup automatico en `afterAll`.

## Scope Clientes

El spec de clientes crea mediante la UI productiva un cliente focal con estos
campos de ownership:

- `name`: `E2E-clientes-<runId> Cliente focal`
- `email`: `e2e-clientes-<runId>@example.com`
- `notes`: `E2E-clientes-<runId> creado por Playwright`
- `phone`: solo digitos derivados del timestamp numerico del run ID

El spec no recibe secretos administrativos, no ejecuta Docker, no ejecuta
`psql` y no realiza cleanup automatico en `afterAll`.

## Scope Solicitudes

El spec de tracking publico crea mediante la UI productiva una solicitud
publica de tipo `encargo`, seleccionando el servicio canonico `Otro`, sin
iniciar sesion y sin adjuntar archivos. El helper compartido solo devuelve el
codigo publico de seguimiento para que `/estado` pueda validar el recorrido
positivo.

Campos de ownership:

- `client_name`: `E2E-solicitudes-<runId> Cliente público`
- `client_phone`: los primeros 14 digitos del run ID
- `client_email`: `e2e-solicitudes-<runId>@example.com`
- `description`: `E2E-solicitudes-<runId> Encargo público`
- `notes`: `E2E-solicitudes-<runId> sin archivos`

El tracking positivo confirma que la referencia corresponde a una solicitud en
estado publico inicial `Solicitud recibida` y que la pagina no expone UUIDs,
campos internos, rutas privadas, buckets, pagos, metadata ni errores de
Supabase o PostgreSQL.

## Scope Pedidos

El spec focal de pedido manual crea mediante la UI productiva un pedido interno
como administrador. El pedido usa el flujo `encargo`, selecciona el servicio
canonico `Otro`, no selecciona cliente, no proviene de una solicitud y no
adjunta archivos, tareas, comentarios ni personal asignado.

Campos de ownership:

- `title`: `E2E-pedidos-<runId> Pedido manual`
- `description`: `E2E-pedidos-<runId> Encargo manual aislado`

El pedido debe quedar en `status = creado`, `priority = normal`, sin fecha
estimada ni fecha real de entrega, con `cliente_id` y `solicitud_id` en `null`.
El servicio asociado debe seguir siendo `Otro` con `workflow_type = encargo`.

El pago inicial permitido es exactamente una fila en `pedido_pagos` con
`total_amount = 100.00`, pagos en efectivo y transferencia en cero,
`payment_status = sin_pago`, `paid_at` en `null` y `created_by`/`updated_by`
iguales al perfil administrador que creo el pedido.

La baseline genera automaticamente un unico historial inicial `pedido_creado`
al insertar el pedido. Ese evento se permite solo con el contrato exacto del
trigger consolidado: actor administrador, resumen del numero real del pedido,
`old_value` en `null`, `new_value` igual al numero de pedido y metadata con
`order_number`, `title`, `solicitud_id: null` y `origen: manual`. Puede
eliminarse junto con el padre porque `pedido_historial.pedido_id` tiene
`ON DELETE CASCADE`. Cualquier historial adicional se rechaza.

## Cleanup Local

Comando:

```cmd
npm.cmd run qa:e2e:cleanup -- --scope <scope> --run-id <RUN_ID>
```

El comando requiere `--scope` y `--run-id <RUN_ID>`. Rechaza scopes
desconocidos, argumentos duplicados, argumentos inesperados, run IDs invalidos,
`--all` y cualquier intento de omitir guardas locales.

Los scopes permitidos se definen en un registro cerrado dentro del tooling. El
CLI no acepta paths SQL. Cada scope declara explicitamente su archivo SQL y su
marcador esperado:

- `scripts/sql/cleanup-local-e2e-servicios.sql`
- `scripts/sql/cleanup-local-e2e-clientes.sql`
- `scripts/sql/cleanup-local-e2e-solicitudes.sql`
- `scripts/sql/cleanup-local-e2e-pedidos.sql`

## Guardas Locales

Antes de mutar datos, el tooling valida:

- `NEXT_PUBLIC_SUPABASE_URL` existe.
- La URL apunta exactamente a `localhost` o `127.0.0.1`.
- La URL tiene un puerto valido.
- `project_id` se resuelve desde `supabase/config.toml`.
- `project_id` usa caracteres seguros.
- El contexto Docker efectivo usa endpoint local `npipe://` o `unix://`.
- Se rechazan endpoints `tcp://`, `ssh://`, `http://`, `https://` y esquemas
  desconocidos.
- El mismo contexto validado se pasa mediante `--context` a `docker inspect` y
  `docker exec`.
- El contenedor `supabase_db_<project_id>` existe y esta ejecutandose.

El tooling usa `spawn`, argumentos separados, `shell: false`, salida capturada
por separado y `windowsHide: true`.

## Servicios Canonicos

Los servicios canonicos son:

- `Impresión`
- `Otro`

No deben eliminarse durante cleanup. El SQL confirma que sigue existiendo
exactamente un servicio `workflow_type = impresion` y que los servicios
canonicos permanecen presentes.

El cleanup nunca crea servicios, nunca modifica disponibilidad, nunca renombra
servicios, nunca repara el seed y nunca borra servicios de impresion.

## Servicios QA Dinamicos

El piloto solo permite borrar servicios cuyo nombre comienza exactamente por:

```text
E2E-servicios-<runId>
```

Todos los candidatos deben ser `workflow_type = encargo`. Si algun candidato
tiene solicitudes, pedidos u otra relacion dependiente detectada, el cleanup
aborta y no borra nada.

## Clientes QA Dinamicos

El cleanup de clientes solo selecciona filas cuyo `name` comienza exactamente
por:

```text
E2E-clientes-<runId>
```

Cada candidato debe cumplir el contrato completo de ownership: nombre con el
prefijo de la corrida, correo exacto `e2e-clientes-<runId>@example.com`, notas
con el mismo prefijo y telefono compuesto solo por digitos.

Aunque la base define `ON DELETE SET NULL` para relaciones operativas, el
cleanup E2E no permite desvinculacion silenciosa. Si un cliente candidato esta
relacionado con una solicitud o un pedido, la transaccion aborta y no borra
nada.

El SQL tambien inspecciona las FKs actuales hacia `public.clientes` y rechaza
la ejecucion si aparece una relacion no contemplada. Las relaciones conocidas
son:

- `solicitudes.cliente_id`
- `pedidos.cliente_id`

## Solicitudes QA Aisladas

El cleanup de solicitudes solo selecciona filas cuyo `client_name` comienza
exactamente por:

```text
E2E-solicitudes-<runId>
```

Cada candidato debe cumplir el contrato completo de ownership, mantenerse como
`workflow_type = encargo`, `status = nueva`, servicio `Otro`, sin cliente
asociado, sin pedido convertido, sin revisor y sin fecha deseada.

El SQL inspecciona las FKs entrantes actuales hacia `public.solicitudes` y
rechaza la ejecucion si aparece una relacion no contemplada. Las relaciones
conocidas son:

- `pedidos.solicitud_id`
- `archivos.solicitud_id`
- `solicitud_comentarios.solicitud_id`
- `solicitud_historial.solicitud_id`

`solicitudes.converted_order_id` es una FK saliente hacia `public.pedidos`; por
eso se valida como parte del estado del candidato y debe permanecer en `null`.

Aunque algunas relaciones tienen cascada o `ON DELETE SET NULL`, el cleanup no
permite borrar o desvincular grafos operativos. Aborta si detecta cliente,
pedido asociado, conversion, archivos o comentarios.

La baseline genera automaticamente un unico evento inicial
`solicitud_creada` en `solicitud_historial` al insertar la solicitud publica.
Ese evento se permite solo con el contrato exacto de la solicitud recien creada
y puede eliminarse junto con el padre porque `solicitud_historial.solicitud_id`
tiene `ON DELETE CASCADE`. Cualquier historial operativo posterior se rechaza.

Antes de borrar, el SQL revisa directamente `storage.objects` en el bucket
`godel-files` y aborta si existe algun objeto bajo
`solicitudes/<solicitud_id>/originales/`. Esta comprobacion protege contra
objetos huerfanos aunque no exista fila en `public.archivos`; el scope no borra
objetos Storage.

## Pedidos QA Aislados

El cleanup de pedidos solo selecciona filas cuyo `title` coincide exactamente
con:

```text
E2E-pedidos-<runId> Pedido manual
```

Cada candidato debe cumplir el contrato completo de ownership, mantenerse como
pedido manual aislado y haber sido creado por un perfil activo con rol `admin`.
No se selecciona por numero de pedido, referencia publica, fecha, UUID ni texto
generico `E2E`.

El SQL inspecciona las FKs entrantes actuales hacia `public.pedidos` y rechaza
la ejecucion si aparece una relacion no contemplada. Las relaciones conocidas
son:

- `solicitudes.converted_order_id`
- `pedido_trabajadores.pedido_id`
- `pedido_tareas.pedido_id`
- `archivos.pedido_id`
- `pedido_comentarios.pedido_id`
- `pedido_historial.pedido_id`
- `pedido_pagos.pedido_id`

`pedidos.cliente_id`, `pedidos.solicitud_id`, `pedidos.service_id` y
`pedidos.created_by` son FKs salientes del pedido; se validan como parte del
estado del candidato. Para este scope, `cliente_id` y `solicitud_id` deben
permanecer en `null`.

El cleanup permite eliminar por cascade solo el pago inicial exacto y el
historial inicial exacto. Aborta si detecta solicitud convertida, personal
asignado, tareas, metadata en `archivos`, comentarios, pago alterado o
historial operativo.

Antes de borrar, el SQL revisa directamente `storage.objects` en el bucket
`godel-files` y aborta si existe cualquier objeto bajo `pedidos/<pedido_id>/`.
Esta tarea no borra objetos Storage.

`pedido_contadores` no se rebobina. Los numeros de pedido consumidos durante QA
son monotónicos y su consumo es esperado.

## Idempotencia

La primera ejecucion elimina los registros del scope y corrida indicada si no
tienen relaciones bloqueantes. La segunda ejecucion con el mismo run ID termina
con exit code `0`, elimina cero filas y vuelve a emitir el marcador del scope:

```text
E2E_CLEANUP_OK scope=servicios deleted=0
E2E_CLEANUP_OK scope=clientes deleted=0
E2E_CLEANUP_OK scope=solicitudes deleted=0
E2E_CLEANUP_OK scope=pedidos deleted=0
```

Cero candidatos no es error.

## Frontera de Secretos

Los specs y factories normales no reciben `SUPABASE_SECRET_KEY` ni
`SUPABASE_SERVICE_ROLE_KEY`. El cleanup local tampoco necesita esas variables.

Las mutaciones normales del spec se hacen por UI productiva con usuario QA
autenticado. La eliminacion piloto se hace por tooling local PostgreSQL, con
guardas de entorno local y sin ampliar grants ni usar `service_role` como
acceso general.

## Limitacion del Piloto

Todavia no existe cleanup general para:

- pedidos evolucionados;
- pedidos con cliente;
- pedidos convertidos desde solicitudes;
- tareas;
- asignaciones;
- comentarios;
- archivos;
- solicitudes convertidas;
- solicitudes con archivos;
- objetos Storage;
- usuarios Auth;
- perfiles;
- historiales operativos;
- auditorias.

La expansion de ownership y cleanup para otros dominios queda prevista para
tareas posteriores, despues de validar estos scopes aislados.
