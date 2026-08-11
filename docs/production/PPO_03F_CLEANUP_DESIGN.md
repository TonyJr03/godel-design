# PPO-03F.0 — Diseño de expiración, reconciliación y cleanup

## Metadatos

- Fecha: 2026-08-11.
- Estado: PPO-03F.0 — diseñada / pendiente de revisión arquitectónica.
- Fase: PPO-03F activa.
- Alcance: auditoría y diseño; no implementa SQL, migraciones, tipos, código,
  UI, Server Actions, infraestructura ni scheduling.

## Estado previo y problema

PPO-03D.1 y PPO-03E cerraron y aprobaron la transferencia directa Browser → TUS
→ Storage y el finalize idempotente. La ruta vigente continúa:

~~~text
PPO-03F → SH-02 → SH-03 → PPO-03G → cierre PPO-03 → SH-04 → SH-05
~~~

La baseline activa es la serie consolidada 01–06. La autorización de reserva
vence a las cuatro horas, pero una sesión vencida puede seguir materializada como
open y sus items como reserved. Los staged conocidos no tienen todavía una
transición ni cleanup materializado.

## Auditoría del modelo existente

### Estados y constraints

| Entidad | Estados existentes | Transiciones hoy |
| --- | --- | --- |
| Sesión | open, completed, partial, expired, cancelled | Solo open → completed al completar todos los items; el helper actual reasigna open en cualquier otro caso. |
| Item | reserved, committed, expired, cancelled | Solo reserved → committed mediante finalize. |

archivo_carga_sesiones exige exactamente un contexto público o interno,
expires_at mayor que created_at, y completed_at solo para completed o partial.
archivo_carga_items exige committed_at y archivo_id solo para committed. El
modelo propuesto respeta esos constraints: expired no tiene completed_at;
partial sí tiene completed_at; los committed nunca se regresan ni se borran.

private.refresh_upload_session_completion(session_id) solo determina si todos
los items están committed y escribe completed u open. No materializa partial,
expired ni cancelled. En F.1 debe ajustarse para que nunca reabra un estado
terminal y quede limitado al caso de finalize.

### TTL, autorización e índices

Las reservas pública e interna establecen expires_at = now() + interval
'4 hours'. La firma pública, la policy de firma, la policy TUS interna y ambos
finalize requieren status open y/o expires_at > now(). Por tanto:

~~~text
authorization expiry = expires_at: rechazo inmediato de sign, TUS y finalize
materialized lifecycle status = reconciliador: transición posterior
~~~

Una sesión persistida como open tras el TTL no es autorizable.

Los índices existentes bastan:

- archivo_carga_sesiones(status, expires_at): localiza sesiones open vencidas.
- archivo_carga_items(session_id, status): cuenta y transiciona items de las
  sesiones bloqueadas.
- object_path único: identifica un objeto sin ambigüedad.
- Los índices de plataforma de storage.objects resuelven bucket_id y name.

No se recomienda tabla, enum, columna ni índice nuevo.

## Invariantes

1. Un candidato nace exclusivamente de archivo_carga_items.object_path. Se
   prohíben listado recursivo del bucket, borrado por prefijo cargas/v1 y
   deducción por nombre/fecha.
2. public.archivos representa solo committed. Cleanup no toca metadata
   committed ni items committed.
3. No hay DELETE anónimo, paths en UI ni secretos administrativos para Storage.
4. El borrado físico usa solo Storage API. Está prohibido DELETE SQL sobre
   storage.objects y el acceso directo al filesystem.
5. Maintenance exige admin activo, JWT normal y RLS/policy; no usa
   SUPABASE_SECRET_KEY, service_role ni cliente admin genérico.
6. El browser recibe solo counts seguros, nunca path, session_id, item_id,
   signed URL ni locator Storage.
7. No se añade cleanup_status, cleanup_attempted_at, cleaned_at ni
   cleanup_error; estado DB más existencia de Storage da la idempotencia.

## Lifecycle propuesto

| Situación vencida | Acción | Resultado |
| --- | --- | --- |
| Cero committed; uno o más reserved | Todos los reserved pasan a expired. | Sesión expired; completed_at nulo. |
| Algunos committed y algunos reserved | Solo reserved pasa a expired. | Sesión partial; completed_at = now(). |
| Todos committed (defensivo) | No expira objetos. | Sesión completed. |
| Cancelled | No se implementa transición/UI. | Sin cambio. |

No existe caso de producto que justifique cancelación explícita. El enum se
conserva para una decisión futura.

## TTL y grace period

Se adopta cleanup_grace = 1 hora como constante de contrato simple, sin tabla
de configuración global:

~~~text
expires_at             → termina autorización inmediatamente
expires_at + 1 hora    → staged conocido elegible para borrado físico
~~~

Una hora permite reintentos breves de TUS/finalize sin dejar abandonados de modo
indefinido.

## Reconciliación y cleanup

El candidato exacto es:

~~~text
session.status IN (expired, partial)
session.expires_at <= now() - cleanup_grace
item.status = expired
item.archivo_id IS NULL
storage.objects.bucket_id = godel-files
storage.objects.name = item.object_path
NO existe public.archivos con ese bucket y file_path
~~~

La ausencia explícita de metadata es una defensa adicional. Si Storage delete
tiene éxito, storage.objects desaparece y el item deja de ser candidato. Si
falla, el objeto persiste y reaparece en la ejecución siguiente. Esto obtiene
reintento idempotente sin columnas adicionales.

## Frontera DB, Storage y autoridad

### RPC DB propuesta

Se propone una RPC pública semántica:

~~~text
public.reconciliar_cargas_expiradas(p_batch_limit integer default 100)
returns table (
  expired_sessions integer,
  partial_sessions integer,
  completed_sessions integer,
  expired_items integer,
  candidate_item_id uuid,
  candidate_object_path text
)
~~~

La firma final puede ajustar los counts, pero F.1 conserva estas reglas:

- SECURITY DEFINER y search_path = ''.
- EXECUTE para authenticated; exige auth.uid(), perfil activo y private.is_admin().
- batch entre 1 y 100: no existe ejecución ilimitada.
- FOR UPDATE SKIP LOCKED sobre sesiones vencidas antes de materializar estados.
- Entrega paths exactos solo al servicio server-only; la Action no los serializa
  al browser.
- No borra binarios ni filas storage.objects.

SKIP LOCKED evita que dos invocaciones materialicen simultáneamente la misma
sesión. Un lock PostgreSQL no puede mantenerse durante HTTP hacia Storage. Si
dos ejecuciones alcanzan el mismo path tras liberar la transacción, exact-path
hace seguro el caso: una elimina y la otra observa ausencia o respuesta
equivalente. Una respuesta perdida converge igual: la siguiente consulta ya no
propondrá un objeto ausente.

### Executor Storage

F.2 implementará un servicio server-only con el cliente normal ligado a la
sesión del admin:

~~~text
candidatos exactos DB
→ supabase.storage.from("godel-files").remove(paths)
→ counts seguros
~~~

No se usa SQL para borrar storage.objects, ni cliente admin. El servicio retorna
sesiones materializadas, items vencidos, candidatos, borrados, omitidos/ausentes
y fallos seguros, pero nunca locators.

La policy actual godel_files_delete_managed permite admin o supervisor sobre
cualquier item conocido, incluso committed. No cumple maintenance. F.1 debe
redefinir private.can_manage_upload_storage_object y su policy DELETE/SELECT
auxiliar para exigir:

~~~text
admin activo
+ item.status = expired
+ item.archivo_id IS NULL
+ session.status IN (expired, partial)
+ session.expires_at <= now() - cleanup_grace
+ object_path exacto de item conocido
~~~

Así se conserva JWT normal y RLS, pero no se permite a supervisor borrar staged
ni a ningún maintenance eliminar committed. No existe consumidor activo que
necesite conservar el borrado amplio.

## Operación manual y scheduling

F.2 expondrá una operación manual admin-only:

~~~text
Dashboard → Configuración → Mantenimiento → Limpiar cargas expiradas
~~~

El hub actual de Configuración contiene Usuarios, Servicios y Plantillas, por lo
que Mantenimiento es la ubicación coherente. La implementación posterior será
una página mínima protegida, Server Action fina y servicio server-only; no
necesita UI compleja ni ejecución desde Client Component.

Quedan fuera de PPO-03F: cron productivo, Edge scheduler, Windows Task
Scheduler, contenedor cron, worker permanente y job queue. SH-04 programará esta
operación determinista, idempotente y testeable sin rediseñar el lifecycle.

## Decisión de amendment de baseline

**Se recomienda amendment excepcional, pendiente de aprobación arquitectónica.**
No requiere schema nuevo: completa transiciones, autoridad y hardening del
contrato consolidado.

| Migración | Decisión F.1 | Razón |
| --- | --- | --- |
| 01_core_schema.sql | Sin cambio | Estados, constraints e índices actuales bastan. |
| 02_security_rls_grants.sql | Sin cambio | No se requiere CRUD ni policy RLS nueva en control plane. |
| 03_business_rpcs.sql | Cambio | RPC de reconciliación y helper de completion que no reabre estados terminales. |
| 04_storage.sql | Cambio | DELETE queda limitado a admin y candidatos expired exactos. |
| 05_auth_admin_user_lifecycle.sql | Sin cambio | No interviene Auth Admin. |
| 06_final_hardening.sql | Cambio | Firma, grants y assertions de RPC/policy de cleanup. |

No se crearán tablas, enums, columnas ni índices. Si se aprueba, F.1 exige
fresh rebuild 01–06, QA SQL/Storage, tipos regenerados y validación de
aplicación.

PPO-03F.0 es el último punto para decidir el amendment. Tras cerrar PPO-03F:

~~~text
BASELINE 01–06 = FROZEN
future DB work = migration 07+
~~~

No habrá otra excepción sin decisión extraordinaria explícita de Dirección
Técnica.

## Subfases

| Subfase | Nombre | Responsabilidad |
| --- | --- | --- |
| PPO-03F.0 | Diseño y auditoría | Este documento y decisión pendiente de revisión. |
| PPO-03F.1 | Lifecycle DB y amendment final | RPC, policy estrecha, hardening, fresh rebuild y QA DB/Storage. |
| PPO-03F.2 | Executor y operación manual admin | Servicio, Action fina y superficie mínima de Configuración. |
| PPO-03F.3 | QA, freeze y handoff | Expiración, cleanup, idempotencia, concurrencia, freeze y handoff SH-02. |

## Riesgos y criterios de aceptación

Riesgos: drift DB/Storage, policy demasiado amplia, ejecuciones solapadas,
exposición de paths, amendment incompleto y automatización prematura. Se mitigan
con item conocido, verificación exacta de Storage, retry idempotente, admin-only,
counts seguros, fresh rebuild/QA y scheduling diferido a SH-04.

F.1–F.3 estarán aceptadas cuando:

- TTL bloquee sign, TUS y finalize antes y después de materializar estados.
- Cero commits termine expired; un conjunto mixto termine partial; todos
  committed permanezcan completed.
- Solo reserved vencido pase a expired; committed no se borre.
- No se enumere Storage ni se borren paths desconocidos.
- Solo Storage API con sesión de admin activo borre candidatos.
- Supervisor, trabajador, anon y perfil inactivo no puedan ejecutar maintenance.
- Reintentos tras éxito, fallo o respuesta perdida converjan sin metadata nueva.
- UI devuelva solo counts seguros.
- F.1 complete fresh rebuild y QA; F.3 congele la baseline y entregue SH-02.

