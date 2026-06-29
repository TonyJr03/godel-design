# Beta 2.4.1 - Auditoria focal de Solicitudes y Tracking Publico

## 1 Objetivo

Auditar el dominio de solicitudes y tracking publico sin modificar codigo funcional. El alcance cubre `/solicitud`, `/estado`, la gestion interna de solicitudes, la relacion Solicitudes -> Pedidos, Storage asociado y la cobertura e2e vigente.

Esta auditoria busca identificar riesgos reales, deuda tecnica y pasos recomendados para Beta 2.4, respetando las reglas vigentes de arquitectura: Server Actions finas, logica de dominio en `src/lib`, datos server-side por defecto, DTOs publicos controlados, RLS como defensa final y RPCs para operaciones criticas.

## 2 Resumen ejecutivo

El dominio esta en buen estado para consolidacion incremental. La separacion principal es correcta: las rutas App Router componen UI y enlazan acciones, los componentes cliente no consultan Supabase directamente, los servicios de `src/lib/solicitudes`, `src/lib/public-tracking`, `src/lib/storage` y `src/lib/pedidos` concentran validaciones y mutaciones, y las operaciones criticas se apoyan en RPCs, RLS y policies de Storage.

Los flujos publicos mas sensibles estan razonablemente protegidos. `/solicitud` crea solicitudes con validacion server-side, genera `public_reference` no secuencial y no permite lectura publica de solicitudes. `/estado` consulta por `public_reference`, valida formato, usa la RPC `consultar_estado_publico` y devuelve un DTO minimo sin cliente, contacto, archivos, comentarios, historial, pagos, `order_number`, `file_path` ni UUIDs internos.

Los riesgos principales no son fallos criticos inmediatos, sino puntos de mantenimiento: `PublicSolicitudForm` y `public-request-validation.ts` son densos, `src/app/solicitud/actions.ts` mezcla orquestacion de formulario y archivos, Storage puede dejar objetos sin metadata si falla el insert posterior al upload, y el `full-visual-qa.spec.ts` cubre demasiado en un recorrido serial. Tambien conviene mantener vigilancia estricta sobre cualquier cambio futuro al DTO publico de `/estado`.

## 3 Mapa del flujo publico `/solicitud`

Ruta principal:

- `src/app/solicitud/page.tsx`
- `src/components/solicitudes/PublicSolicitudForm.tsx`
- `src/app/solicitud/actions.ts`
- `src/lib/solicitudes/create-public-solicitud.ts`
- `src/lib/solicitudes/public-request-validation.ts`
- `src/lib/storage/upload-public-solicitud-file.ts`
- `src/lib/storage/file-validation.ts`
- `src/lib/storage/file-paths.ts`

Flujo actual:

1. El cliente entra en `/solicitud`.
2. La pagina renderiza contenido publico y el formulario.
3. `PublicSolicitudForm` permite elegir `encargo` o `impresion`.
4. El componente cliente solo maneja estado visual, tabs, inputs, mensajes y archivos seleccionados.
5. La Server Action lee `FormData`, extrae campos permitidos y valida archivos antes de crear cuando corresponde.
6. Para `impresion`, la action exige al menos un archivo.
7. `createPublicSolicitud` valida todo el input con `validatePublicSolicitudInput`.
8. El servicio genera `solicitudId` y `publicReference` en servidor.
9. Inserta la solicitud con `status = nueva`, `cliente_id = null`, `reviewed_by = null` y `converted_order_id = null`.
10. Si hay archivos, `uploadPublicSolicitudFiles` valida, sube al bucket privado y registra metadata en `archivos`.
11. La UI devuelve un mensaje seguro y muestra el `public_reference` copiable.

Puntos fuertes:

- No se aceptan campos tecnicos desde el formulario como fuente de verdad.
- La descripcion estructurada de impresion se construye server-side.
- La fecha deseada se valida server-side y la UI solo orienta con `min`.
- El flujo no usa `service_role`, no consulta `auth.users` y no abre lectura publica de solicitudes.
- El codigo publico no es UUID, no es `order_number` y no es secuencial.

Riesgos/deuda:

- `PublicSolicitudForm.tsx` concentra muchas responsabilidades visuales.
- `public-request-validation.ts` mezcla reglas comunes, reglas por workflow y construccion de descripcion de impresion.
- `src/app/solicitud/actions.ts` es aceptable, pero combina adaptacion de formulario, prevalidacion de archivos, creacion y subida posterior.
- No hay captcha, rate limiting ni anti-spam avanzado todavia.

## 4 Mapa del tracking publico `/estado`

Ruta principal:

- `src/app/estado/page.tsx`
- `src/components/tracking/PublicTrackingSearchForm.tsx`
- `src/components/tracking/PublicTrackingResultCard.tsx`
- `src/lib/public-tracking/get-public-tracking-status.ts`
- `src/lib/public-tracking/status-labels.ts`
- RPC `public.consultar_estado_publico(text)`

Flujo actual:

1. El cliente consulta `/estado?ref=GD-XXXX-XXXX`.
2. La pagina normaliza el parametro `ref`.
3. `getPublicTrackingStatus` valida el formato con `PUBLIC_REFERENCE_PATTERN`.
4. El servicio llama `consultar_estado_publico` con `p_public_reference`.
5. La RPC busca primero pedidos por `public_reference`.
6. Si existe pedido, devuelve `kind = pedido`, workflow, estado, fechas publicas y progreso agregado.
7. Si no existe pedido, busca solicitud por `public_reference`.
8. Si la solicitud ya fue convertida, resuelve el pedido asociado.
9. Si sigue como solicitud, devuelve solo estado y fechas publicas de solicitud.
10. La UI muestra un resultado publico limitado o errores genericos.

Datos expuestos:

- `kind`
- `public_reference`
- `workflow_type`
- estado publico
- `created_at`
- `desired_date` para solicitudes
- `estimated_delivery_date` y `actual_delivery_date` para pedidos
- progreso agregado para pedidos cuando aplica

Datos no expuestos:

- UUIDs internos
- `order_number`
- cliente, telefono o correo
- descripcion, notas o archivos
- `file_path`, bucket o rutas privadas
- comentarios e historial
- pagos, deuda o estado financiero
- nombres de tareas, usuarios internos o personal asignado

Riesgo principal:

- Este contrato publico es sensible. Cualquier ampliacion del DTO o de la RPC debe pasar por checklist de ruta publica y `audit:public-tracking`.

## 5 Mapa de gestion interna de solicitudes

Listado:

- `src/app/dashboard/solicitudes/page.tsx`
- `src/lib/solicitudes/list-internal-solicitudes.ts`
- `src/components/solicitudes/InternalSolicitudesList.tsx`

Detalle:

- `src/app/dashboard/solicitudes/[id]/page.tsx`
- `src/app/dashboard/solicitudes/[id]/actions.ts`
- `src/lib/solicitudes/get-internal-solicitud-by-id.ts`
- `src/components/solicitudes/InternalSolicitudDetail.tsx`

Mutaciones y datos relacionados:

- `src/lib/solicitudes/update-internal-solicitud-status.ts`
- `src/lib/solicitudes/associate-solicitud-cliente.ts`
- `src/lib/solicitudes/create-cliente-from-solicitud.ts`
- `src/lib/solicitudes/create-solicitud-comment.ts`
- `src/lib/solicitudes/list-solicitud-comments.ts`
- `src/lib/solicitudes/list-solicitud-history.ts`

El listado y detalle cargan server-side. Los servicios validan UUID, perfil activo y permisos (`solicitudes.view` o `solicitudes.manage`) antes de leer o mutar datos sensibles. Las actions del detalle leen campos permitidos, delegan en servicios y revalidan rutas afectadas.

La gestion interna incluye estados, asociacion de cliente, creacion de cliente desde solicitud, comentarios, historial, archivos y conversion a pedido. La UI muestra el UUID interno solo dentro del dashboard, no en rutas publicas.

## 6 Relacion Solicitudes ↔ Pedidos

Archivos principales:

- `src/components/solicitudes/SolicitudConvertPedidoForm.tsx`
- `src/app/dashboard/solicitudes/[id]/actions.ts`
- `src/lib/pedidos/create-pedido-from-solicitud.ts`
- `src/lib/pedidos/rpc.ts`
- RPC `public.convertir_solicitud_a_pedido(...)`

La conversion esta correctamente ubicada en el dominio Pedidos porque el resultado transaccional crea un pedido, su resumen financiero y la herencia de archivos. La solicitud es el origen del flujo, pero la operacion critica pertenece al agregado resultante.

El flujo exige:

- usuario interno activo;
- permisos `solicitudes.manage` y `pedidos.manage`;
- solicitud valida;
- estado `aprobada`;
- cliente asociado;
- no conversion previa;
- precio total valido;
- prioridad valida;
- fecha estimada igual o posterior al dia de negocio si existe.

La RPC bloquea la solicitud con `FOR UPDATE`, crea el pedido, crea `pedido_pagos`, marca la solicitud como `convertida`, guarda `converted_order_id` y asocia metadata de archivos con el pedido. Todas esas escrituras se confirman o revierten juntas.

Punto importante: el pedido convertido hereda `solicitudes.public_reference`, por lo que `/estado` resuelve el pedido con el mismo codigo publico.

## 7 Storage en solicitudes

Archivos principales:

- `src/lib/storage/constants.ts`
- `src/lib/storage/types.ts`
- `src/lib/storage/file-validation.ts`
- `src/lib/storage/file-paths.ts`
- `src/lib/storage/upload-public-solicitud-file.ts`
- `src/lib/storage/list-solicitud-files.ts`
- `src/lib/storage/signed-url.ts`
- `src/app/dashboard/solicitudes/[id]/archivos/[fileId]/download/route.ts`

Modelo vigente:

- Bucket privado `godel-files`.
- Archivos publicos de solicitud bajo `solicitudes/{solicitud_id}/originales/...`.
- Metadata de negocio en `archivos`.
- `visibility = cliente_solicitud`.
- `pedido_id = null` hasta conversion.
- `uploaded_by = null` para flujo publico.
- Sin URLs publicas.
- Sin signed URLs para clientes externos.
- Descarga interna mediante route handler y URL firmada de corta duracion.

Controles actuales:

- maximo 5 archivos por solicitud;
- maximo 20 MB por archivo;
- extensiones y MIME permitidos;
- bloqueo de extensiones peligrosas;
- rutas construidas server-side;
- listados internos no devuelven `file_path`;
- descarga interna valida UUIDs, pertenencia, bucket, perfil y permiso.

Deuda aceptada:

- La subida publica guarda primero el objeto y luego metadata. Si falla la metadata, puede quedar un objeto sin metadata. No conviene abrir borrado anonimo; la mitigacion recomendada es reconciliacion interna, monitoreo y rate limiting antes de produccion.

## 8 Evaluacion de archivos principales

| Archivo | Responsabilidad | Riesgo | Recomendacion |
|---|---|---|---|
| `src/app/solicitud/page.tsx` | Componer pagina publica de solicitud. | Bajo. Contenido y layout sin logica sensible. | Mantener como Server Component simple. |
| `src/app/solicitud/actions.ts` | Adaptar `FormData`, prevalidar archivos, crear solicitud y subir adjuntos. | Medio. Mezcla orquestacion de creacion y Storage. | Extraer helpers internos pequenos si crece; no mover reglas a UI. |
| `src/components/solicitudes/PublicSolicitudForm.tsx` | UI completa del formulario publico, workflows, archivos y mensajes. | Medio. Archivo denso y con patrones repetidos de formularios. | Extraer subcomponentes de secciones/tabs cuando se toque por cambio real. |
| `src/lib/solicitudes/create-public-solicitud.ts` | Crear solicitud publica y generar referencia publica. | Bajo-medio. Generacion local de referencia debe mantenerse alineada con DB. | Mantener tests/e2e y documentacion; no exponer lecturas publicas. |
| `src/lib/solicitudes/public-request-validation.ts` | Validacion server-side de solicitud publica y descripcion de impresion. | Medio. Muchas reglas por workflow en un solo archivo. | Separar validadores por workflow si Beta 2.4 toca reglas de formulario. |
| `src/app/estado/page.tsx` | Componer consulta publica de estado. | Bajo. Usa servicio server-side y UI controlada. | Mantener `dynamic = "force-dynamic"` y errores seguros. |
| `src/lib/public-tracking/get-public-tracking-status.ts` | Validar referencia, llamar RPC y mapear DTO publico. | Alto por sensibilidad publica, no por bug actual. | Tratar cualquier cambio como seguridad publica; revisar DTO en cada ajuste. |
| `src/components/tracking/PublicTrackingResultCard.tsx` | Renderizar resultado publico. | Medio. Puede exponer datos si el DTO crece sin control. | No agregar campos sensibles; depender solo de `PublicTrackingStatusResult`. |
| `src/app/dashboard/solicitudes/page.tsx` | Listado interno con filtros. | Bajo. Delegacion correcta a servicio. | Mantener busqueda server-side. |
| `src/lib/solicitudes/list-internal-solicitudes.ts` | Buscar, filtrar y listar solicitudes internas. | Medio. Query con ramas de busqueda y merge manual. | Extraer helpers de query/merge si crece volumen o filtros. |
| `src/app/dashboard/solicitudes/[id]/page.tsx` | Loader de detalle y composicion de secciones. | Medio. Carga varias fuentes relacionadas. | Mantener sin mutaciones; considerar loader dedicado si crece. |
| `src/app/dashboard/solicitudes/[id]/actions.ts` | Actions de estado, cliente, conversion y comentarios. | Medio. Varias actions en un archivo pero aun acotadas. | Conservar cerca de ruta; extraer revalidacion ya existente si se repite mas. |
| `src/lib/solicitudes/get-internal-solicitud-by-id.ts` | Cargar detalle interno con permisos. | Bajo. Contrato claro. | Mantener DTO explicito. |
| `src/lib/solicitudes/update-internal-solicitud-status.ts` | Validar y delegar cambio de estado a RPC. | Bajo-medio. Mapeo de errores seguro manual. | Candidato futuro a `src/lib/solicitudes/rpc.ts` si se consolidan wrappers. |
| `src/lib/solicitudes/create-cliente-from-solicitud.ts` | Crear cliente desde solicitud mediante RPC. | Medio. Cruza dominios Solicitudes/Clientes. | Mantener RPC como autoridad; no aceptar datos editables desde UI. |
| `src/lib/solicitudes/associate-solicitud-cliente.ts` | Asociar solicitud a cliente existente. | Bajo-medio. Escritura simple con permisos. | Vigilar consistencia si se agregan reglas de deduplicacion. |
| `src/lib/solicitudes/list-solicitud-comments.ts` | Listar comentarios internos via RPC. | Bajo. DTO limitado de autor. | Mantener interno; no reutilizar en rutas publicas. |
| `src/lib/solicitudes/list-solicitud-history.ts` | Listar historial y enriquecer metadata relacionada. | Medio. Mapper y enriquecimiento algo densos. | Extraer mapper de historial si se agregan filtros o mas tipos de evento. |
| `src/lib/storage/upload-public-solicitud-file.ts` | Subir archivos publicos y registrar metadata. | Medio. Storage y DB no son transaccionales entre si. | Mantener deuda documentada; planear reconciliacion interna. |
| `src/lib/storage/list-solicitud-files.ts` | Listar metadata segura de archivos de solicitud. | Bajo. No devuelve `file_path`. | Mantener select minimo. |
| `src/lib/storage/signed-url.ts` | Crear URL firmada server-side por `archivo.id`. | Medio. Consulta `file_path` server-side. | Mantener fuera de componentes cliente y con expiracion corta. |
| `src/app/dashboard/solicitudes/[id]/archivos/[fileId]/download/route.ts` | Validar descarga interna y redirigir a signed URL. | Medio. Route handler sensible. | Considerar helper compartido con pedidos solo si reduce duplicacion real. |
| `src/components/solicitudes/SolicitudConvertPedidoForm.tsx` | UI de conversion a pedido. | Medio. Reglas visuales por workflow y campos financieros. | Mantener validacion server-side como autoridad; extraer solo con cambios reales. |
| `src/lib/pedidos/create-pedido-from-solicitud.ts` | Validar conversion y delegar a RPC transaccional. | Alto por impacto multi-tabla, no por bug actual. | No simplificar fuera de RPC; mantener errores seguros. |
| `src/lib/pedidos/rpc.ts` | Wrapper de RPCs de pedidos. | Bajo. Ya reduce casts repetidos. | Mantener conversion aqui; no mover al dominio de solicitudes. |
| `tests/e2e/full-visual-qa.spec.ts` | Recorrido serial de aceptacion visual/funcional. | Medio. Mucho diagnostico depende de un unico spec. | Crear specs por dominio en fase futura; conservar full QA para cierre. |

## 9 Patrones repetidos o deuda tecnica

- Formularios con `useActionState`, mensajes, field errors y valores preservados se repiten entre solicitudes, pedidos y conversion.
- Tabs/controles por `workflow_type` aparecen en solicitud publica, pedido manual y conversion.
- Validaciones por fecha futura existen en varios dominios y deben seguir usando helpers locales, no UTC con `toISOString()`.
- Wrappers RPC ya existen en Pedidos; Solicitudes aun tiene casts locales para varias RPCs.
- Revalidaciones de dashboard/listado/detalle se escriben manualmente cerca de cada action.
- Listados con filtros URL + servicio server-side estan bien orientados, pero las ramas de busqueda pueden crecer.
- Storage comparte patrones de upload/list/download entre pedidos y solicitudes, con duplicacion aceptable por ahora.
- El `full-visual-qa.spec.ts` cubre demasiado flujo en un solo recorrido y dificulta aislar fallos.
- No hay captcha, rate limiting, antivirus ni reconciliacion de objetos sin metadata.

## 10 Hallazgos clasificados

| Severidad | Area | Hallazgo | Riesgo | Recomendacion |
|---|---|---|---|---|
| Alto | Tracking publico | El DTO de `/estado` es seguro hoy, pero cualquier ampliacion puede exponer datos sensibles si no pasa por checklist. | Filtracion de `order_number`, cliente, pagos, archivos o UUIDs internos. | Tratar cambios en `src/lib/public-tracking` y RPC como seguridad publica; ejecutar `audit:public-tracking`. |
| Alto | Conversion Solicitudes -> Pedidos | La conversion toca solicitud, pedido, pagos y archivos. Esta bien en RPC, pero es un punto de alto impacto. | Inconsistencias multi-tabla si se intenta reimplementar en TypeScript. | Mantener `public.convertir_solicitud_a_pedido` como autoridad transaccional. |
| Medio | Formulario publico | `PublicSolicitudForm.tsx` es grande y concentra muchas secciones. | Cambios futuros pueden introducir drift visual o errores en workflows. | Extraer secciones reutilizables solo cuando haya cambio funcional o refactor focal. |
| Medio | Validacion publica | `public-request-validation.ts` combina reglas comunes, reglas de encargo, impresion y serializacion. | Mayor costo para agregar nuevos campos o cambiar impresion. | Separar por helpers internos o archivos por workflow durante Beta 2.4 si se toca validacion. |
| Medio | Server Action publica | `src/app/solicitud/actions.ts` coordina creacion y upload. | Un cambio de archivos podria afectar el contrato de creacion publica. | Mantener action fina; mover helpers de archivos si aumenta complejidad. |
| Medio | Storage publico | Upload a Storage y metadata no son atomicos. | Objetos huerfanos en bucket privado ante fallo posterior al upload. | Implementar reconciliacion interna/monitoreo; no abrir borrado anonimo. |
| Medio | Produccion publica | No hay captcha, rate limiting ni anti-spam avanzado. | Abuso de `/solicitud`, consumo de Storage o consultas repetidas a `/estado`. | Planear mitigacion operativa antes de produccion publica. |
| Medio | E2E | El full visual QA valida muchos dominios en un solo spec serial. | Fallos dificiles de diagnosticar y tiempos altos. | Crear specs focales para solicitud, tracking, conversion y storage; conservar full QA como aceptacion. |
| Bajo | Listado interno | `list-internal-solicitudes.ts` tiene busqueda con varias ramas y merge manual. | Mantenimiento mas costoso si crecen filtros. | Extraer query builders/mappers solo si Beta 2.4 amplia filtros. |
| Bajo | Historial | `list-solicitud-history.ts` enriquece metadata con clientes y pedidos. | Crecimiento del mapper al agregar eventos. | Extraer mapper de historial si aparecen mas eventos o filtros. |
| Bajo | Descargas internas | Route handler de descarga de solicitud duplica patron con pedidos. | Duplicacion moderada en checks de archivo. | Crear helper compartido solo si se modifica ambos handlers. |

## 11 Plan recomendado para Beta 2.4

1. Beta 2.4.2 - Consolidar validacion publica de solicitudes.
   - Mantener contrato de UI.
   - Separar helpers internos de `public-request-validation.ts` por reglas comunes, encargo e impresion si reduce lectura.
   - No cambiar campos ni reglas de negocio.

2. Beta 2.4.3 - Focalizar Server Action publica y upload.
   - Revisar `src/app/solicitud/actions.ts`.
   - Extraer helpers locales pequenos de archivos si aporta claridad.
   - Mantener `createPublicSolicitud` y `uploadPublicSolicitudFiles` como servicios separados.

3. Beta 2.4.4 - Blindar contrato de tracking publico.
   - Documentar explicitamente el DTO de `PublicTrackingStatusResult`.
   - Agregar o ajustar audit si faltan campos sensibles.
   - No agregar `order_number`, cliente, pagos, archivos ni UUIDs.

4. Beta 2.4.5 - Consolidar gestion interna de solicitudes.
   - Revisar list/detail/actions sin mover arquitectura.
   - Evaluar helper de revalidacion y mappers de historial.
   - Mantener permisos en servicios y RPC.

5. Beta 2.4.6 - QA e2e focal por dominio.
   - Crear specs pequenos para `/solicitud`, `/estado` y conversion si se aprueba.
   - Mantener `full-visual-qa.spec.ts` como recorrido de cierre.
   - No ocultar fallos funcionales bajo fixtures excesivos.

6. Beta 2.4.7 - Deuda operativa de Storage publico.
   - Diseñar reconciliacion de objetos sin metadata.
   - Definir rate limiting/captcha/honeypot si el despliegue publico lo requiere.
   - No abrir lectura, listado ni borrado anonimo.

## 12 Que NO conviene hacer

- No crear `src/services`.
- No mover el dominio completo por preferencia estetica.
- No dividir `full-visual-qa.spec.ts` dentro de esta auditoria.
- No tocar migraciones ni tipos generados en una fase solo documental.
- No cambiar el DTO publico de `/estado` para mostrar mas informacion.
- No exponer `order_number` en tracking publico.
- No exponer `file_path`, bucket, rutas privadas ni signed URLs al cliente externo.
- No permitir descarga publica de archivos de solicitud.
- No aceptar `workflow_type`, `status`, `cliente_id`, `created_by`, `converted_order_id`, `bucket`, `file_path` o `uploaded_by` como fuente de verdad desde formularios.
- No sacar la conversion de la RPC transaccional.
- No abrir borrado anonimo de Storage para resolver objetos huerfanos.
- No agregar dependencias de validacion/formularios sin una decision tecnica especifica.

## 13 Checklist de cierre de auditoria

- [x] Revisado flujo publico `/solicitud`.
- [x] Revisado tracking publico `/estado`.
- [x] Revisada gestion interna de solicitudes.
- [x] Revisada relacion Solicitudes -> Pedidos.
- [x] Revisado Storage de solicitudes.
- [x] Revisada cobertura relevante en `tests/e2e/full-visual-qa.spec.ts`.
- [x] Revisados documentos funcionales de solicitudes, pedidos y Storage.
- [x] Confirmado que no se requiere cambio de codigo de aplicacion para esta auditoria.
- [x] Confirmado que no se requiere migracion.
- [x] Confirmado que no se requiere tocar `src/types/database.types.ts`.
- [x] Confirmado que el contrato publico actual no expone pagos, archivos, `order_number`, UUIDs internos ni datos de contacto.
- [x] Ejecutado `npm.cmd run diff:check`.
- [x] Ejecutado `npm.cmd run audit:security`.
- [x] Ejecutado `npm.cmd run audit:client-supabase`.
- [x] Ejecutado `npm.cmd run audit:public-tracking`.
- [x] Ejecutado `npm.cmd run verify`.
