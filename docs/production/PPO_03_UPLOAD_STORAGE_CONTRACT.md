# PPO-03A.1 — Contrato de cargas y almacenamiento

## Metadatos

- Estado: Activa — contrato arquitectónico formalizado.
- Fase: PPO-03A.1.
- Fecha: 2026-08-08.
- Alcance: documental y arquitectónico; no implementa código, migraciones, RLS,
  policies de Storage ni cambios de infraestructura.

## Propósito y frontera de responsabilidad

Este documento formaliza la arquitectura aprobada para PPO-03 — Rediseño de
cargas y almacenamiento. Es el contrato de sus subfases y no declara ejecutadas
decisiones que todavía requieren implementación o validación.

Los archivos permanecerán privados. Next.js controlará el control plane:
autorización, reserva, metadata, permisos, ciclo de vida, finalización,
expiración y reconciliación. Supabase Storage será el data plane: los bytes
viajarán directamente entre navegador y Storage. En el diseño final, los
archivos pesados no atravesarán Server Actions ni Route Handlers de Next.js.

PPO-03A.1 no introduce antivirus, inspección profunda, workers externos,
colas, Redis, RabbitMQ, microservicios ni cron complejo. La protección pública
completa contra abuso corresponde a PPO-05. No se usan secretos ni se modifica
el backend administrado.

## Estado actual comprobado

El bucket <code>godel-files</code> es privado. <code>public.archivos</code>
representa los metadatos de archivos operativos y las descargas internas
mantienen el patrón vigente: Route Handler, consulta de
<code>public.archivos</code> con RLS, <code>file_path</code> solo server-side,
signed URL breve y redirección. DTOs y listados no exponen bucket,
<code>file_path</code> ni signed URLs.

Las subidas actuales son transitorias y todavía envían bytes a Next.js:

- La solicitud pública crea primero la solicitud y después sube mediante Server
  Action. Admite hasta cinco archivos opcionales de 20 MiB; <code>impresion</code>
  exige al menos un descriptor de archivo válido.
- La subida interna de pedido usa una Server Action por archivo, valida el
  perfil y el pedido, deriva categoría por estado y sube el objeto antes de
  insertar metadata.
- Ambas validan extensión, MIME declarado y tamaño en TypeScript; usan
  <code>upsert: false</code> y paths ligados al dominio.
- Los paths históricos continúan soportados para lectura:

    solicitudes/{solicitud_id}/originales/{timestamp}-{uuid}-{filename}
    pedidos/{pedido_id}/internos/{timestamp}-{filename}
    pedidos/{pedido_id}/avances/{timestamp}-{filename}
    pedidos/{pedido_id}/finales/{timestamp}-{filename}

- <code>next.config.ts</code> conserva transitoriamente
  <code>experimental.proxyClientMaxBodySize = "110mb"</code> y
  <code>experimental.serverActions.bodySizeLimit = "110mb"</code>; Nginx
  mantiene un límite equivalente para no romper el MVP.

Las deudas <code>TD-UPLOAD-001</code>, <code>TD-STORAGE-001</code> y
<code>TD-STORAGE-002</code> siguen activas. El conteo actual de objetos Storage
no garantiza concurrencia y una falla entre objeto y metadata puede dejar un
objeto sin metadata. La herencia solicitud → pedido seguirá sin mover ni copiar
objetos: se actualizará únicamente la metadata necesaria y
<code>cliente_solicitud</code> conservará su visibilidad autorizada.

## Arquitectura objetivo aprobada

### Transferencia, autorización y límites

La transferencia será directa a Supabase Storage mediante TUS resumible. El
servidor emitirá la autorización con <code>createSignedUploadUrl()</code>; el
cliente usará el token con TUS mediante <code>x-signature</code>. Los paths
serán únicos y usarán <code>upsert = false</code>; el cliente gestionará
progreso, reintentos y reanudación cuando la API lo permita.

La autorización de Storage se emitirá con clientes Supabase normales y
policies/RLS adecuadas. Quedan prohibidos <code>SUPABASE_SERVICE_ROLE_KEY</code>,
cliente administrativo genérico y <code>SUPABASE_SECRET_KEY</code> para Storage.
Esta última clave permanece exclusivamente en el adaptador Auth Admin
server-only existente y nunca llegará al navegador.

El límite funcional será de 10 archivos por operación/sesión y 20 MiB por
archivo (<code>20 * 1024 * 1024 = 20971520</code> bytes). Es por creación pública
de solicitud o sesión interna de pedido, no por el historial completo de un
pedido.

Las extensiones objetivo son PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, ZIP, RAR y
CDR. El servidor validará nombre/extensión y tamaño esperado, derivará el MIME
canónico y lo devolverá al controlador de transferencia; el MIME declarado por
el navegador no será autoridad.

| Extensión | MIME canónico |
| --- | --- |
| .pdf | <code>application/pdf</code> |
| .jpg, .jpeg | <code>image/jpeg</code> |
| .png | <code>image/png</code> |
| .webp | <code>image/webp</code> |
| .doc | <code>application/msword</code> |
| .docx | <code>application/vnd.openxmlformats-officedocument.wordprocessingml.document</code> |
| .zip | <code>application/zip</code> |
| .rar | <code>application/vnd.rar</code> |
| .cdr | <code>application/vnd.corel-draw</code> |

Si RAR o CDR llegan con MIME vacío, legacy o
<code>application/octet-stream</code>, no se abrirá este último globalmente.
Toda tolerancia será explícita y limitada a la extensión correspondiente; el
objeto se almacenará con MIME normalizado. ZIP, RAR y CDR son opacos: no se
extraen, ejecutan, interpretan ni renderizan server-side.

### Sesiones, items y paths

PPO-03B introducirá conceptualmente <code>archivo_carga_sesiones</code> y
<code>archivo_carga_items</code>, con nombres definitivos acordes al esquema
español. No se crean tablas en PPO-03A.1. <code>public.archivos</code> seguirá
representando solo archivos incorporados (committed), nunca cargas en curso.

| Entidad | Campos conceptuales |
| --- | --- |
| Sesión | <code>id</code>, <code>solicitud_id</code> nullable, <code>pedido_id</code> nullable, <code>created_by</code> nullable, <code>public_token_hash</code> nullable, <code>status</code>, <code>expires_at</code>, <code>created_at</code>, <code>completed_at</code> nullable. Debe existir exactamente un contexto válido: solicitud o pedido. |
| Item | <code>id</code>, <code>session_id</code>, <code>object_path</code>, <code>original_name</code>, <code>normalized_mime</code>, <code>expected_size</code>, <code>visibility</code>, <code>status</code>, <code>archivo_id</code> nullable, <code>created_at</code>, <code>committed_at</code> nullable y datos mínimos de cleanup/reconciliación. |

No se persistirán signed upload tokens, porcentaje ni estados efímeros como
<code>uploading</code> o <code>retrying</code>.

| Entidad | Estados autorizados |
| --- | --- |
| Sesión | <code>open</code>, <code>completed</code>, <code>partial</code>, <code>expired</code>, <code>cancelled</code> |
| Item | <code>reserved</code>, <code>committed</code>, <code>expired</code>, <code>cancelled</code> |

No se agregarán estados sin necesidad demostrada. Para sesiones públicas, un
token de capacidad aleatorio se generará server-side, se entregará solo al crear
la sesión y se persistirá únicamente como hash seguro. Autoriza exclusivamente
el control de esa sesión: no concede <code>SELECT</code>, listado, acceso general
a la solicitud ni sustituye <code>public_reference</code>; no se registra ni
persiste en claro. En sesiones internas, la autoridad principal sigue siendo
<code>auth.uid()</code>.

Los objetos nuevos usarán esta raíz versionada y desacoplada del dominio:

    cargas/v1/{session_id}/{item_id}-{safe_filename}

Los UUID serán generados server-side y el nombre será sanitizado. El path no
incluirá <code>solicitud_id</code>, <code>pedido_id</code> ni categoría operativa;
el contexto vivirá en PostgreSQL. Será único, inmutable tras commit y no
sobrescribible. Los objetos históricos no se moverán ni renombrarán.

### Staging, finalización y atomicidad lógica

La cuarentena aprobada es lógica y no incorpora antivirus ni nuevos servicios:

    reserved → objeto subido → finalize → committed

Antes de <code>committed</code>, un item no tiene fila operativa en
<code>public.archivos</code>, no aparece en listados ni es descargable por rutas
internas normales. Un staged conocido no es un archivo operativo.

Después de TUS, el navegador llamará a <code>finalize</code>. Esta operación
autorizará sesión e item, será idempotente y comprobará objeto, bucket, path,
tamaño, MIME normalizado cuando sea verificable y que el contexto aún admita
incorporación. Solo entonces insertará <code>public.archivos</code>, enlazará
<code>archivo_id</code> y marcará el item <code>committed</code>. Si se repite
tras éxito, devolverá una semántica equivalente a
<code>already_committed</code> sin crear otra fila.

Storage y PostgreSQL no constituyen una única transacción ACID:

| Situación | Resultado esperado |
| --- | --- |
| Storage falla | El item continúa reservado, no se crea <code>public.archivos</code>, puede reintentarse y finalmente expira. |
| Storage funciona y falla finalize antes del commit | Existe un staged conocido asociado al item; no es operativo y puede reintentarse o limpiarse al expirar. |
| El commit DB funciona y se pierde la respuesta HTTP | Repetir finalize es idempotente y no duplica metadata. |

### Flujos público e interno

En el flujo público, el formulario recopilará datos y archivos localmente y
enviará a Next.js solo datos normales y descriptores, nunca bytes. El servidor
validará descriptores, creará solicitud, sesión pública e items y devolverá las
capacidades necesarias. El navegador transferirá por TUS y finalizará cada
item. La UI comunicará éxito total o parcial. Una solicitud válida sobrevivirá
a una transferencia posterior fallida; <code>impresion</code> seguirá exigiendo
un descriptor válido al crearla y una falla posterior advertirá sin borrarla.

En el flujo interno, el servidor validará perfil activo, acceso al pedido y
estado actual, derivará categoría, reservará hasta 10 items y emitirá las
autorizaciones. El navegador transferirá por TUS y finalizará. La categoría no
será elegida por el navegador:

| Estado | Categoría |
| --- | --- |
| <code>creado</code>, <code>solicitud_recibida</code>, <code>en_revision</code> | <code>interno_pedido</code> |
| <code>en_produccion</code> | <code>avance</code> |
| <code>listo_entrega</code> | <code>final_entrega</code> |
| <code>entregado</code>, <code>cancelado</code> | subida bloqueada |

El cupo se reservará en PostgreSQL antes de cargar y una sesión no superará 10
items. La UI comenzará con máximo dos transferencias simultáneas y cola local;
este guardrail puede ajustarse tras pruebas sin alterar el límite funcional.

### Expiración, cleanup y descargas

Se separarán expiración de autorización de upload, vida de transferencia TUS,
expiración de sesión de negocio y período de gracia antes de cleanup. Los TTL
concretos se decidirán tras PPO-03A.2 y no se inventan aquí.

PPO-03F diseñará reconciliación interna segura: detectará sesiones/items
expirados, comprobará staged, los eliminará mediante usuario interno autorizado
y policies adecuadas y registrará cleanup mínimo. Nunca abrirá
<code>DELETE</code> anónimo general. Supabase administrado Free sigue siendo
provisional; su espacio limitado convierte los staged abandonados en impacto
operativo real.

Las descargas conservarán Route Handler interno, <code>public.archivos</code>
con RLS, <code>file_path</code> server-side, signed URL breve y redirección. Los
objetos bajo <code>cargas/v1/...</code> no serán legibles sin metadata committed.
Bucket, path y signed URL no formarán parte de DTOs ni listados cliente.

## Hipótesis de PPO-03A.2

PPO-03A.2 hará un spike reversible —no ejecutado por esta tarea— contra
Supabase local y Supabase administrado. Debe probar TUS +
<code>createSignedUploadUrl()</code> + <code>x-signature</code> +
<code>upsert = false</code>, con clientes normales y policies/RLS adecuadas.
Verificará RAR y CDR en Chrome/Windows, incluidos MIME vacío, legacy y
<code>application/octet-stream</code>, sin abrir este último globalmente.
También deberá comprobar reintentos, reanudación disponible, progreso cliente y
la separación efectiva de TTL. No define aún TTL, tablas, policies, cleanup ni
flujos completos.

## QA futuro mínimo

Las subfases posteriores validarán, en local y Supabase administrado:

- upload público e interno reales para admin, supervisor, trabajador asignado y
  trabajador no asignado;
- 10 archivos aceptados, 11 rechazados, 20 MiB aceptados y un tamaño superior
  rechazado;
- PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, ZIP, RAR y CDR; MIME incompatible y
  ejecutables/SVG bloqueados;
- progreso, retry, interrupción, reanudación aplicable y concurrencia;
- <code>finalize</code> idempotente; Storage correcto con fallo DB y DB sin
  objeto;
- expiración, cleanup, lectura anónima bloqueada y descargas sin regresión;
- herencia solicitud → pedido, verificación de que Next.js no recibe bytes y
  retirada final de los límites transitorios de 110 MB.

## Secuencia oficial

| Subfase | Alcance | Estado actual |
| --- | --- | --- |
| PPO-03A.1 | Formalización del contrato | Ejecutada documentalmente |
| PPO-03A.2 | Spike TUS + signed upload token | Pendiente |
| PPO-03B | Modelo DB de sesiones/items, RLS y policies | Pendiente |
| PPO-03C | Reserva, firma, transferencia y finalize comunes | Pendiente |
| PPO-03D | Migración del upload interno de Pedidos | Pendiente |
| PPO-03E | Migración del upload público de Solicitudes | Pendiente |
| PPO-03F | Expiración, reconciliación y cleanup | Pendiente |
| PPO-03G | QA integral, retirada de 110 MB y cierre documental | Pendiente |

PPO-03G retirará los bypass de 110 MB solo tras demostrar que ningún upload
funcional envía bytes a Next.js. Entonces definirá límites normales para
formularios y metadata conforme a la documentación local de Next.js 16.2.6 y
confirmará que un archivo de 20 MiB funciona sin ellos.

## Restricciones de continuidad

- PPO-03A.1 no crea migraciones ni cambia RLS, policies, bucket, código ni
  paths históricos.
- TUS, sesiones, paths nuevos, límite de 10, RAR, CDR, cleanup y nuevas policies
  siguen siendo arquitectura objetivo, no implementación.
- No se abren lectura, listado ni descarga anónimos; <code>public_reference</code>
  no es token de Storage.
- No se declara resuelto el antivirus, el escaneo profundo ni la protección
  antiabuso.

