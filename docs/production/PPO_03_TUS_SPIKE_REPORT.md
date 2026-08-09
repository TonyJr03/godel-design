# PPO-03A.2 — Informe de spike TUS y signed upload token

## Metadatos

- Estado: Ejecutado — bloqueado para cierre.
- Fase: PPO-03A.2.
- Fecha: 2026-08-09.
- Rama inicial: <code>preprod/ppo-03-file-flow-redesign</code>.
- HEAD inicial: <code>4c4dbb72a5847b3575c7de5e2a0e47b7ed18e1d7</code>.

## Contexto y objetivo

Este spike es reversible y no implementa el flujo productivo de PPO-03. Su
objetivo fue demostrar la cadena cliente Supabase normal →
<code>createSignedUploadUrl()</code> → signed upload token → Chromium → TUS →
Supabase Storage, sin que los bytes atraviesen Next.js.

No se crearon migraciones, tablas, RPCs, policies, rutas Next.js, Server Actions
ni componentes productivos. Tampoco se modificaron los flujos actuales de
Solicitudes o Pedidos. La corrección documental previa normalizó en el roadmap
el límite a 20 MiB e incorporó CDR junto con ZIP y RAR.

## Versiones y harness

- Next.js: 16.2.6.
- <code>@supabase/supabase-js</code>: 2.105.4; su API instalada expone
  <code>createSignedUploadUrl(path, { upsert })</code>.
- <code>tus-js-client</code>: 4.3.1, añadido como dependencia de desarrollo
  exclusivamente para este spike.
- Playwright/Chromium: dependencias existentes del repositorio.
- Node.js observado durante el spike: 24.14.1.
- Supabase CLI local: 2.109.1.

El harness reproducible está en
<code>scripts/spikes/ppo-03a2/run.mjs</code> y se ejecuta con:

    npm.cmd run spike:ppo-03a2:local
    npm.cmd run spike:ppo-03a2:managed

Lee las configuraciones públicas locales o administradas ya existentes, inicia un
origen HTTP efímero independiente de Next.js y ejecuta Chromium en modo
headless. El navegador recibe solamente endpoint, path, metadata de TUS y signed
upload token; no recibe access token Auth. No imprime tokens, claves, UUID,
contraseñas ni host administrado.

Para las transferencias se generó en runtime un payload de 13 MiB y se usó
<code>chunkSize = 6 * 1024 * 1024</code>. Esto exige múltiples chunks. El
harness crea y elimina los archivos temporales usados en la prueba de tipos de
archivo; no versiona binarios.

## Arquitectura temporal comprobada

El control de transporte creó una solicitud fixture descartable con un usuario
QA admin autenticado normal. Ese mismo cliente normal creó la autorización
firmada para una ruta válida de Storage. Chromium cargó directamente al endpoint
TUS de Storage; el origen efímero del harness no es Next.js, no hay Route
Handler, API route, Server Action ni proxy Nginx entre el navegador y Storage.

La instrumentación del navegador confirmó para las solicitudes TUS de
transferencia:

- <code>x-signature</code> presente.
- <code>Authorization</code> ausente.
- La publishable key pública fue necesaria en <code>apikey</code> para el
  entorno local.
- Destino sanitizado: <code>http://local-storage/storage/v1/upload/resumable</code>.
- No se inició el servidor de Next.js ni se creó una ruta temporal de la
  aplicación.

El primer intento del control firmado con solamente <code>x-signature</code>
recibió HTTP 400 en Supabase local. Al repetir con un token nuevo y la cabecera
pública <code>apikey</code>, TUS completó. Esto no convierte la publishable key
en una credencial de usuario: el navegador siguió sin recibir ni reenviar una
sesión Auth. PPO-03B deberá decidir y validar si este requisito local también se
mantiene en el backend administrado antes de convertirlo en contrato
productivo.

## Resultados locales

| Comprobación | Resultado |
| --- | --- |
| Usuario QA normal autenticado | Correcto para el control firmado. |
| Caso interno sobre pedido existente | No disponible: no existía un pedido accesible por RLS en un estado apto para subida. No se creó un pedido persistente para forzarlo. |
| Signed token con cliente QA normal | Correcto en el control descartable. |
| TUS directo con payload de 13 MiB | Correcto con <code>apikey</code> público; se observaron múltiples chunks. |
| Progreso | Correcto; el callback de progreso avanzó sobre más de un chunk. |
| Interrupción controlada | Correcta después del primer chunk. |
| Reanudación | <code>findPreviousUploads()</code> no encontró la subida interrumpida; se creó una URL TUS nueva y la transferencia terminó desde el inicio. |
| <code>upsert = false</code> | Correcto: una segunda autorización para el path ya comprometido fue rechazada en la etapa de autorización. No hubo sobrescritura. |
| Comprobación y cleanup con permisos normales | Correctos. |
| Inserción en <code>public.archivos</code> | No realizada. |

La reanudación no debe presentarse como aprobada en el entorno actual: el
cliente pudo finalizar mediante una nueva transferencia, pero no continuó desde
la URL TUS previa.

## Caso público: resultado crítico

Se creó una solicitud fixture descartable con el usuario QA normal y se intentó
emitir la autorización con un cliente Supabase anónimo normal, sin sesión Auth,
contra una ruta pública válida. La llamada
<code>createSignedUploadUrl(..., { upsert: false })</code> fue rechazada con
HTTP 400, por lo que Chromium no recibió token ni inició una transferencia.

No se usó service role, secret key, cliente administrativo ni bypass de RLS para
forzar el resultado. La policy pública vigente de <code>storage.objects</code>
requiere una ruta de solicitud válida y metadata de objeto que satisfaga la
allowlist; la emisión actual de signed upload URL con identidad <code>anon</code>
no satisfizo experimentalmente ese modelo. Esta es una inferencia basada en la
policy vigente y en el rechazo observado; debe confirmarse al diseñar PPO-03B.

La decisión arquitectónica pendiente es cómo representará el control plane una
sesión pública autorizada para emitir un signed upload token sin convertir una
credencial privilegiada en mecanismo de Storage y sin abrir una policy anónima
más amplia. Mientras no exista esa decisión demostrada, no puede declararse
viable el flujo público aprobado.

## Supabase administrado

El harness encontró configuración pública administrada existente en
<code>compose.env.local</code> y no mostró el project ref. La prueba HTTPS no
pudo comenzar: las credenciales QA normales disponibles para el entorno local no
autenticaron contra el backend administrado.

No se solicitó ni usó una contraseña de base de datos, secret key, service role
ni una alternativa privilegiada. No se creó ningún objeto, fixture ni dato
remoto. Por tanto, no hay resultado administrado para TUS, token público,
progreso, reanudación, colisión o cleanup.

## RAR y CDR en Chromium sobre Windows

La medición usó archivos mínimos generados temporalmente y seleccionados mediante
un input de archivo de Chromium en Windows. El resultado describe
<code>File.type</code>, no inspección de contenido:

| Extensión | <code>File.type</code> observado |
| --- | --- |
| .rar | <code>application/x-compressed</code> |
| .cdr | cadena vacía |
| .zip | <code>application/x-zip-compressed</code> |
| .pdf | <code>application/pdf</code> |

La evidencia confirma que RAR y CDR no pueden depender del MIME que entregue el
navegador. No se amplió la allowlist productiva ni se abrió
<code>application/octet-stream</code> globalmente. RAR, CDR y ZIP siguen siendo
contenido opaco para el contrato.

## Cleanup y seguridad

Cada ejecución local exitosa eliminó el objeto de prueba con el cliente QA
normal y eliminó la solicitud fixture con el usuario autorizado. No se insertó
metadata en <code>public.archivos</code>. El harness no deja binarios,
tokens, logs con secretos, rutas de aplicación ni outputs persistentes.

El spike no demuestra magic bytes, antivirus, análisis profundo ni cuarentena
real. Un archivo renombrado puede contener datos distintos de su extensión; la
deuda <code>TD-STORAGE-002</code> sigue activa.

## Limitaciones y discrepancias

- El caso público no puede emitir signed upload token con las policies actuales.
- El caso interno obligatorio no pudo ejecutarse localmente por ausencia de
  pedido apto, y no se fabricó uno que no pudiera limpiarse de forma segura.
- No hubo autenticación QA normal disponible para demostrar el backend
  administrado.
- Supabase local necesitó <code>apikey</code> pública junto con
  <code>x-signature</code>; falta confirmar esa cabecera en administrado.
- La reanudación no recuperó la URL TUS anterior.
- El control firmado demuestra el transporte, pero no sustituye el flujo interno
  de Pedido ni resuelve la sesión pública de PPO-03B.

## Conclusión y decisión

Veredicto:

    Bloqueado

La combinación de transporte TUS firmado quedó demostrada solo de manera local
y controlada con un usuario QA normal, sin transferencia binaria hacia Next.js.
Sin embargo, PPO-03A.2 no cumple su criterio de cierre: falta la demostración
en Supabase administrado y la hipótesis pública crítica falló sin una solución
compatible con los guardrails aprobados.

PPO-03B no debe iniciar todavía. Arquitectura/Dirección Técnica debe resolver la
emisión de capacidad pública y proporcionar, si autoriza continuar el spike, una
configuración QA normal válida para el backend administrado y un pedido
descartable o fixture autorizado para el caso interno.

