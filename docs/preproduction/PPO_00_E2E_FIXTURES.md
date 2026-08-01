# PPO-00.4B1 - Ownership E2E y cleanup local piloto

## Proposito

Este documento registra el contrato implementado para ownership E2E y cleanup
local piloto del dominio `servicios`. El objetivo es que cada corrida pueda
identificar sus propios servicios QA sin depender del primer registro visible y
sin tocar servicios canonicos.

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

Para el scope piloto el prefijo es:

```text
E2E-servicios-<runId>
```

El prefijo es ASCII, no contiene espacios, no incluye correos, UUID, tokens ni
secretos, y permite busquedas exactas por corrida.

## Scope Servicios

El spec de servicios crea mediante la UI productiva un servicio configurable de
tipo `encargo` con nombre y descripciones que incluyen el ownership prefix de
la corrida.

El spec no recibe secretos administrativos, no ejecuta Docker, no ejecuta
`psql` y no realiza cleanup automatico en `afterAll`.

## Cleanup Local

Comando piloto:

```cmd
npm.cmd run qa:e2e:cleanup -- --scope servicios --run-id <RUN_ID>
```

El comando requiere `--scope servicios` y `--run-id <RUN_ID>`. Rechaza scopes
desconocidos, argumentos duplicados, argumentos inesperados, run IDs invalidos,
`--all` y cualquier intento de omitir guardas locales.

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

## Idempotencia

La primera ejecucion elimina los servicios de la corrida indicada si no tienen
relaciones. La segunda ejecucion con el mismo run ID termina con exit code `0`,
elimina cero filas y vuelve a emitir:

```text
E2E_CLEANUP_OK scope=servicios deleted=0
```

Cero candidatos no es error.

## Frontera de Secretos

Los specs y factories normales no reciben `SUPABASE_SECRET_KEY` ni
`SUPABASE_SERVICE_ROLE_KEY`. El cleanup piloto tampoco necesita esas variables.

Las mutaciones normales del spec se hacen por UI productiva con usuario QA
autenticado. La eliminacion piloto se hace por tooling local PostgreSQL, con
guardas de entorno local y sin ampliar grants ni usar `service_role` como
acceso general.

## Limitacion del Piloto

Todavia no existe cleanup general para:

- clientes;
- solicitudes;
- pedidos;
- usuarios Auth;
- perfiles;
- Storage;
- historiales;
- auditorias.

La expansion de ownership y cleanup para otros dominios queda prevista para
PPO-00.4B2 y tareas posteriores, despues de validar este piloto de servicios.
