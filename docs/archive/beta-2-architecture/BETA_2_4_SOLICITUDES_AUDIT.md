# Beta 2.4.1 - Auditoria focal de Solicitudes y Tracking Público

## 1 Objetivo

Auditar el dominio de solicitudes y tracking público sin modificar código funcional. El alcance cubre `/solicitud`, `/estado`, la gestión interna de solicitudes, la relación Solicitudes -> Pedidos, Storage asociado y la cobertura e2e vigente.

Esta auditoría busca identificar riesgos reales, deuda técnica y pasos recomendados para Beta 2.4, respetando las reglas vigentes de arquitectura: Server Actions finas, lógica de dominio en `src/lib`, datos server-side por defecto, DTOs públicos controlados, RLS como defensa final y RPCs para operaciones críticas.

## 2 Resumen ejecutivo

El dominio está en buen estado para consolidación incremental. La separación principal es correcta: las rutas App Router componen UI y enlazan acciones, los componentes cliente no consultan Supabase directamente, los servicios de `src/lib/solicitudes`, `src/lib/public-tracking`, `src/lib/storage` y `src/lib/pedidos` concentran validaciones y mutaciones, y las operaciones críticas se apoyan en RPCs, RLS y policies de Storage.

Los flujos públicos más sensibles están razonablemente protegidos. `/solicitud` crea solicitudes con validación server-side, genera `public_reference` no secuencial y no permite lectura pública de solicitudes. `/estado` consulta por `public_reference`, valida formato, usa la RPC `consultar_estado_publico` y devuelve un DTO mínimo sin cliente, contacto, archivos, comentarios, historial, pagos, `order_number`, `file_path` ni UUIDs internos.

Los riesgos principales no son fallos críticos inmediatos, sino puntos de mantenimiento: `PublicSolicitudForm` y `public-request-validation.ts` son densos, `src/app/solicitud/actions.ts` mezcla orquestación de formulario y archivos, Storage puede dejar objetos sin metadata si falla el insert posterior al upload, y el `full-visual-qa.spec.ts` cubre demasiado en un recorrido serial. También conviene mantener vigilancia estricta sobre cualquier cambio futuro al DTO público de `/estado`.

## 3 Mapa del flujo público `/solicitud`

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
2. La página renderiza contenido público y el formulario.
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

- No se aceptan campos técnicos desde el formulario como fuente de verdad.
- La descripción estructurada de impresión se construye server-side.
- La fecha deseada se valida server-side y la UI solo orienta con `min`.
- El flujo no usa `service_role`, no consulta `auth.users` y no abre lectura pública de solicitudes.
- El código público no es UUID, no es `order_number` y no es secuencial.

Riesgos/deuda:

- `PublicSolicitudForm.tsx` concentra muchas responsabilidades visuales.
- `public-request-validation.ts` mezcla reglas comunes, reglas por workflow y construcción de descripción de impresión.
- `src/app/solicitud/actions.ts` es aceptable, pero combina adaptación de formulario, prevalidación de archivos, creación y subida posterior.
- No hay captcha, rate limiting ni anti-spam avanzado todavía.

## 4 Mapa del tracking público `/estado`

Ruta principal:

- `src/app/estado/page.tsx`
- `src/components/tracking/PublicTrackingSearchForm.tsx`
- `src/components/tracking/PublicTrackingResultCard.tsx`
- `src/lib/public-tracking/get-public-tracking-status.ts`
- `src/lib/public-tracking/status-labels.ts`
- RPC `public.consultar_estado_publico(text)`

Flujo actual:

1. El cliente consulta `/estado?ref=GD-XXXX-XXXX`.
2. La página normaliza el parámetro `ref`.
3. `getPublicTrackingStatus` valida el formato con `PUBLIC_REFERENCE_PATTERN`.
4. El servicio llama `consultar_estado_publico` con `p_public_reference`.
5. La RPC busca primero pedidos por `public_reference`.
6. Si existe pedido, devuelve `kind = pedido`, workflow, estado, fechas públicas y progreso agregado.
7. Si no existe pedido, busca solicitud por `public_reference`.
8. Si la solicitud ya fue convertida, resuelve el pedido asociado.
9. Si sigue como solicitud, devuelve solo estado y fechas públicas de solicitud.
10. La UI muestra un resultado público limitado o errores genéricos.

Datos expuestos:

- `kind`
- `public_reference`
- `workflow_type`
- estado público
- `created_at`
- `desired_date` para solicitudes
- `estimated_delivery_date` y `actual_delivery_date` para pedidos
- progreso agregado para pedidos cuando aplica

Datos no expuestos:

- UUIDs internos
- `order_number`
- cliente, telefono o correo
- descripción, notas o archivos
- `file_path`, bucket o rutas privadas
- comentarios e historial
- pagos, deuda o estado financiero
- nombres de tareas, usuarios internos o personal asignado

Riesgo principal:

- Este contrato público es sensible. Cualquier ampliación del DTO o de la RPC debe pasar por checklist de ruta pública y `audit:public-tracking`.

## 5 Mapa de gestión interna de solicitudes

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

La gestión interna incluye estados, asociación de cliente, creación de cliente desde solicitud, comentarios, historial, archivos y conversion a pedido. La UI muestra el UUID interno solo dentro del dashboard, no en rutas públicas.

## 6 Relación Solicitudes ↔ Pedidos

Archivos principales:

- `src/components/solicitudes/SolicitudConvertPedidoForm.tsx`
- `src/app/dashboard/solicitudes/[id]/actions.ts`
- `src/lib/pedidos/create-pedido-from-solicitud.ts`
- `src/lib/pedidos/rpc.ts`
- RPC `public.convertir_solicitud_a_pedido(...)`

La conversión está correctamente ubicada en el dominio Pedidos porque el resultado transaccional crea un pedido, su resumen financiero y la herencia de archivos. La solicitud es el origen del flujo, pero la operación crítica pertenece al agregado resultante.

El flujo exige:

- usuario interno activo;
- permisos `solicitudes.manage` y `pedidos.manage`;
- solicitud válida;
- estado `aprobada`;
- cliente asociado;
- no conversion previa;
- precio total válido;
- prioridad válida;
- fecha estimada igual o posterior al día de negocio si existe.

La RPC bloquea la solicitud con `FOR UPDATE`, crea el pedido, crea `pedido_pagos`, marca la solicitud como `convertida`, guarda `converted_order_id` y asocia metadata de archivos con el pedido. Todas esas escrituras se confirman o revierten juntas.

Punto importante: el pedido convertido hereda `solicitudes.public_reference`, por lo que `/estado` resuelve el pedido con el mismo código público.

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
- Archivos públicos de solicitud bajo `solicitudes/{solicitud_id}/originales/...`.
- Metadata de negocio en `archivos`.
- `visibility = cliente_solicitud`.
- `pedido_id = null` hasta conversion.
- `uploaded_by = null` para flujo público.
- Sin URLs públicas.
- Sin signed URLs para clientes externos.
- Descarga interna mediante route handler y URL firmada de corta duracion.

Controles actuales:

- máximo 5 archivos por solicitud;
- máximo 20 MB por archivo;
- extensiones y MIME permitidos;
- bloqueo de extensiones peligrosas;
- rutas construidas server-side;
- listados internos no devuelven `file_path`;
- descarga interna valida UUIDs, pertenencia, bucket, perfil y permiso.

Deuda aceptada:

- La subida pública guarda primero el objeto y luego metadata. Si falla la metadata, puede quedar un objeto sin metadata. No conviene abrir borrado anónimo; la mitigación recomendada es reconciliación interna, monitoreo y rate limiting antes de producción.

## 8 Evaluación de archivos principales

| Archivo | Responsabilidad | Riesgo | Recomendación |
|---|---|---|---|
| `src/app/solicitud/page.tsx` | Componer página pública de solicitud. | Bajo. Contenido y layout sin lógica sensible. | Mantener como Server Component simple. |
| `src/app/solicitud/actions.ts` | Adaptar `FormData`, prevalidar archivos, crear solicitud y subir adjuntos. | Medio. Mezcla orquestación de creación y Storage. | Extraer helpers internos pequeños si crece; no mover reglas a UI. |
| `src/components/solicitudes/PublicSolicitudForm.tsx` | UI completa del formulario público, workflows, archivos y mensajes. | Medio. Archivo denso y con patrones repetidos de formularios. | Extraer subcomponentes de secciones/tabs cuando se toque por cambio real. |
| `src/lib/solicitudes/create-public-solicitud.ts` | Crear solicitud pública y generar referencia pública. | Bajo-medio. Generación local de referencia debe mantenerse alineada con DB. | Mantener tests/e2e y documentación; no exponer lecturas públicas. |
| `src/lib/solicitudes/public-request-validation.ts` | Validación server-side de solicitud pública y descripción de impresión. | Medio. Muchas reglas por workflow en un solo archivo. | Separar validadores por workflow si Beta 2.4 toca reglas de formulario. |
| `src/app/estado/page.tsx` | Componer consulta pública de estado. | Bajo. Usa servicio server-side y UI controlada. | Mantener `dynamic = "force-dynamic"` y errores seguros. |
| `src/lib/public-tracking/get-public-tracking-status.ts` | Validar referencia, llamar RPC y mapear DTO público. | Alto por sensibilidad pública, no por bug actual. | Tratar cualquier cambio como seguridad pública; revisar DTO en cada ajuste. |
| `src/components/tracking/PublicTrackingResultCard.tsx` | Renderizar resultado público. | Medio. Puede exponer datos si el DTO crece sin control. | No agregar campos sensibles; depender solo de `PublicTrackingStatusResult`. |
| `src/app/dashboard/solicitudes/page.tsx` | Listado interno con filtros. | Bajo. Delegación correcta a servicio. | Mantener búsqueda server-side. |
| `src/lib/solicitudes/list-internal-solicitudes.ts` | Buscar, filtrar y listar solicitudes internas. | Medio. Query con ramas de búsqueda y merge manual. | Extraer helpers de query/merge si crece volumen o filtros. |
| `src/app/dashboard/solicitudes/[id]/page.tsx` | Loader de detalle y composición de secciones. | Medio. Carga varias fuentes relacionadas. | Mantener sin mutaciones; considerar loader dedicado si crece. |
| `src/app/dashboard/solicitudes/[id]/actions.ts` | Actions de estado, cliente, conversión y comentarios. | Medio. Varias actions en un archivo pero aún acotadas. | Conservar cerca de ruta; extraer revalidación ya existente si se repite más. |
| `src/lib/solicitudes/get-internal-solicitud-by-id.ts` | Cargar detalle interno con permisos. | Bajo. Contrato claro. | Mantener DTO explícito. |
| `src/lib/solicitudes/update-internal-solicitud-status.ts` | Validar y delegar cambio de estado a RPC. | Bajo-medio. Mapeo de errores seguro manual. | Candidato futuro a `src/lib/solicitudes/rpc.ts` si se consolidan wrappers. |
| `src/lib/solicitudes/create-cliente-from-solicitud.ts` | Crear cliente desde solicitud mediante RPC. | Medio. Cruza dominios Solicitudes/Clientes. | Mantener RPC como autoridad; no aceptar datos editables desde UI. |
| `src/lib/solicitudes/associate-solicitud-cliente.ts` | Asociar solicitud a cliente existente. | Bajo-medio. Escritura simple con permisos. | Vigilar consistencia si se agregan reglas de deduplicación. |
| `src/lib/solicitudes/list-solicitud-comments.ts` | Listar comentarios internos via RPC. | Bajo. DTO limitado de autor. | Mantener interno; no reutilizar en rutas públicas. |
| `src/lib/solicitudes/list-solicitud-history.ts` | Listar historial y enriquecer metadata relacionada. | Medio. Mapper y enriquecimiento algo densos. | Extraer mapper de historial si se agregan filtros o más tipos de evento. |
| `src/lib/storage/upload-public-solicitud-file.ts` | Subir archivos públicos y registrar metadata. | Medio. Storage y DB no son transaccionales entre sí. | Mantener deuda documentada; planear reconciliación interna. |
| `src/lib/storage/list-solicitud-files.ts` | Listar metadata segura de archivos de solicitud. | Bajo. No devuelve `file_path`. | Mantener select mínimo. |
| `src/lib/storage/signed-url.ts` | Crear URL firmada server-side por `archivo.id`. | Medio. Consulta `file_path` server-side. | Mantener fuera de componentes cliente y con expiracion corta. |
| `src/app/dashboard/solicitudes/[id]/archivos/[fileId]/download/route.ts` | Validar descarga interna y redirigir a signed URL. | Medio. Route handler sensible. | Considerar helper compartido con pedidos solo si reduce duplicación real. |
| `src/components/solicitudes/SolicitudConvertPedidoForm.tsx` | UI de conversion a pedido. | Medio. Reglas visuales por workflow y campos financieros. | Mantener validación server-side como autoridad; extraer solo con cambios reales. |
| `src/lib/pedidos/create-pedido-from-solicitud.ts` | Validar conversión y delegar a RPC transaccional. | Alto por impacto multi-tabla, no por bug actual. | No simplificar fuera de RPC; mantener errores seguros. |
| `src/lib/pedidos/rpc.ts` | Wrapper de RPCs de pedidos. | Bajo. Ya reduce casts repetidos. | Mantener conversion aquí; no mover al dominio de solicitudes. |
| `tests/e2e/full-visual-qa.spec.ts` | Recorrido serial de aceptación visual/funcional. | Medio. Mucho diagnóstico depende de un único spec. | Crear specs por dominio en fase futura; conservar full QA para cierre. |

## 9 Patrones repetidos o deuda técnica

- Formularios con `useActionState`, mensajes, field errors y valores preservados se repiten entre solicitudes, pedidos y conversion.
- Tabs/controles por `workflow_type` aparecen en solicitud pública, pedido manual y conversion.
- Validaciones por fecha futura existen en varios dominios y deben seguir usando helpers locales, no UTC con `toISOString()`.
- Wrappers RPC ya existen en Pedidos; Solicitudes aún tiene casts locales para varias RPCs.
- Revalidaciones de dashboard/listado/detalle se escriben manualmente cerca de cada action.
- Listados con filtros URL + servicio server-side están bien orientados, pero las ramas de búsqueda pueden crecer.
- Storage comparte patrones de upload/list/download entre pedidos y solicitudes, con duplicación aceptable por ahora.
- El `full-visual-qa.spec.ts` cubre demasiado flujo en un solo recorrido y dificulta aislar fallos.
- No hay captcha, rate limiting, antivirus ni reconciliación de objetos sin metadata.

## 10 Hallazgos clasificados

| Severidad | Área | Hallazgo | Riesgo | Recomendación |
|---|---|---|---|---|
| Alto | Tracking público | El DTO de `/estado` es seguro hoy, pero cualquier ampliación puede exponer datos sensibles si no pasa por checklist. | Filtracion de `order_number`, cliente, pagos, archivos o UUIDs internos. | Tratar cambios en `src/lib/public-tracking` y RPC como seguridad pública; ejecutar `audit:public-tracking`. |
| Alto | Conversión Solicitudes -> Pedidos | La conversión toca solicitud, pedido, pagos y archivos. Está bien en RPC, pero es un punto de alto impacto. | Inconsistencias multi-tabla si se intenta reimplementar en TypeScript. | Mantener `public.convertir_solicitud_a_pedido` como autoridad transaccional. |
| Medio | Formulario público | `PublicSolicitudForm.tsx` es grande y concentra muchas secciones. | Cambios futuros pueden introducir drift visual o errores en workflows. | Extraer secciones reutilizables solo cuando haya cambio funcional o refactor focal. |
| Medio | Validación pública | `public-request-validation.ts` combina reglas comunes, reglas de encargo, impresión y serializacion. | Mayor costo para agregar nuevos campos o cambiar impresión. | Separar por helpers internos o archivos por workflow durante Beta 2.4 si se toca validación. |
| Medio | Server Action pública | `src/app/solicitud/actions.ts` coordina creación y upload. | Un cambio de archivos podría afectar el contrato de creación pública. | Mantener action fina; mover helpers de archivos si aumenta complejidad. |
| Medio | Storage público | Upload a Storage y metadata no son atómicos. | Objetos huérfanos en bucket privado ante fallo posterior al upload. | Implementar reconciliación interna/monitoreo; no abrir borrado anónimo. |
| Medio | Producción pública | No hay captcha, rate limiting ni anti-spam avanzado. | Abuso de `/solicitud`, consumo de Storage o consultas repetidas a `/estado`. | Planear mitigación operativa antes de producción pública. |
| Medio | E2E | El full visual QA valida muchos dominios en un solo spec serial. | Fallos difíciles de diagnosticar y tiempos altos. | Crear specs focales para solicitud, tracking, conversión y storage; conservar full QA como aceptación. |
| Bajo | Listado interno | `list-internal-solicitudes.ts` tiene búsqueda con varias ramas y merge manual. | Mantenimiento más costoso si crecen filtros. | Extraer query builders/mappers solo si Beta 2.4 amplia filtros. |
| Bajo | Historial | `list-solicitud-history.ts` enriquece metadata con clientes y pedidos. | Crecimiento del mapper al agregar eventos. | Extraer mapper de historial si aparecen más eventos o filtros. |
| Bajo | Descargas internas | Route handler de descarga de solicitud duplica patrón con pedidos. | Duplicación moderada en checks de archivo. | Crear helper compartido solo si se modifica ambos handlers. |

## 11 Plan recomendado para Beta 2.4

1. Beta 2.4.2 - Consolidar validación pública de solicitudes.
   - Mantener contrato de UI.
   - Separar helpers internos de `public-request-validation.ts` por reglas comunes, encargo e impresión si reduce lectura.
   - No cambiar campos ni reglas de negocio.

2. Beta 2.4.3 - Focalizar Server Action pública y upload.
   - Revisar `src/app/solicitud/actions.ts`.
   - Extraer helpers locales pequeños de archivos si aporta claridad.
   - Mantener `createPublicSolicitud` y `uploadPublicSolicitudFiles` como servicios separados.

3. Beta 2.4.4 - Blindar contrato de tracking público.
   - Documentar explícitamente el DTO de `PublicTrackingStatusResult`.
   - Agregar o ajustar audit si faltan campos sensibles.
   - No agregar `order_number`, cliente, pagos, archivos ni UUIDs.

4. Beta 2.4.5 - Consolidar gestión interna de solicitudes.
   - Revisar list/detail/actions sin mover arquitectura.
   - Evaluar helper de revalidación y mappers de historial.
   - Mantener permisos en servicios y RPC.

5. Beta 2.4.6 - QA e2e focal por dominio.
   - Crear specs pequeños para `/solicitud`, `/estado` y conversion si se aprueba.
   - Mantener `full-visual-qa.spec.ts` como recorrido de cierre.
   - No ocultar fallos funcionales bajo fixtures excesivos.

6. Beta 2.4.7 - Deuda operativa de Storage público.
   - Diseñar reconciliación de objetos sin metadata.
   - Definir rate limiting/captcha/honeypot si el despliegue público lo requiere.
   - No abrir lectura, listado ni borrado anónimo.

## 12 Que NO conviene hacer

- No crear `src/services`.
- No mover el dominio completo por preferencia estética.
- No dividir `full-visual-qa.spec.ts` dentro de esta auditoría.
- No tocar migraciones ni tipos generados en una fase solo documental.
- No cambiar el DTO público de `/estado` para mostrar más información.
- No exponer `order_number` en tracking público.
- No exponer `file_path`, bucket, rutas privadas ni signed URLs al cliente externo.
- No permitir descarga pública de archivos de solicitud.
- No aceptar `workflow_type`, `status`, `cliente_id`, `created_by`, `converted_order_id`, `bucket`, `file_path` o `uploaded_by` como fuente de verdad desde formularios.
- No sacar la conversión de la RPC transaccional.
- No abrir borrado anónimo de Storage para resolver objetos huérfanos.
- No agregar dependencias de validación/formularios sin una decisión técnica especifica.

## 13 Checklist de cierre de auditoría

- [x] Revisado flujo público `/solicitud`.
- [x] Revisado tracking público `/estado`.
- [x] Revisada gestión interna de solicitudes.
- [x] Revisada relación Solicitudes -> Pedidos.
- [x] Revisado Storage de solicitudes.
- [x] Revisada cobertura relevante en `tests/e2e/full-visual-qa.spec.ts`.
- [x] Revisados documentos funcionales de solicitudes, pedidos y Storage.
- [x] Confirmado que no se requiere cambio de código de aplicación para esta auditoría.
- [x] Confirmado que no se requiere migración.
- [x] Confirmado que no se requiere tocar `src/types/database.types.ts`.
- [x] Confirmado que el contrato público actual no expone pagos, archivos, `order_number`, UUIDs internos ni datos de contacto.
- [x] Ejecutado `npm.cmd run diff:check`.
- [x] Ejecutado `npm.cmd run audit:security`.
- [x] Ejecutado `npm.cmd run audit:client-supabase`.
- [x] Ejecutado `npm.cmd run audit:public-tracking`.
- [x] Ejecutado `npm.cmd run verify`.

## 14 Cierre documental Beta 2.4.9

Beta 2.4.9 deja esta auditoría como diagnóstico histórico de arranque del
dominio Solicitudes y Tracking Público. El mapa operativo vigente queda en
`src/lib/solicitudes/README.md`, con la separación entre `/solicitud`,
`/dashboard/solicitudes` y `/estado`, el inventario de servicios, las actions
internas divididas por familia, las reglas de seguridad, la relación con
Storage, el contrato de Public Tracking y los pendientes técnicos conocidos.

No se modifico código funcional, componentes, Server Actions, servicios
TypeScript, migraciones ni tests durante este cierre documental.
