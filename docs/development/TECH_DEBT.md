# Deuda técnica activa

Este es el registro único de deuda técnica viva de Godel Diseño. Contiene
compromisos técnicos aceptados que pueden aumentar mantenimiento, fragilidad,
coste de cambio o riesgo operativo si el proyecto crece. No incluye narrativas
resueltas ni planes históricos completos.

## Criterios

- Deuda técnica: decisión temporal con coste técnico real.
- Bloqueador de producción pública: deuda o riesgo que debe resolverse antes de
  exponer el sistema a tráfico público no controlado.
- Riesgo operativo: condición que puede dificultar soporte, monitoreo o limpieza.
- Trabajo futuro que no es deuda: nueva capacidad de producto o negocio no
  requerida por el alcance actual.

## Resumen

| ID | Área | Severidad | Bloquea producción pública | Estado |
| --- | --- | --- | --- | --- |
| TD-UPLOAD-001 | Upload/Infraestructura | Alta | Sí, hasta validar la infraestructura o adoptar un flujo adecuado | Activa |
| TD-QA-001 | QA | Media | No | Activa |
| TD-QA-002 | QA/Auth | Media | No | Activa |
| TD-QA-003 | QA/Datos | Media | No | Activa |
| TD-QA-004 | QA/Storage | Media | No | Activa |
| TD-TRACKING-001 | Tracking público | Media | No | Activa |
| TD-QA-005 | QA visual | Media | No | Activa |
| TD-TEMPLATES-001 | Plantillas | Media | No | Activa |
| TD-STORAGE-001 | Storage/Postgres | Media | No | Activa |
| TD-SECURITY-001 | Seguridad pública | Alta | Sí | Activa |
| TD-STORAGE-002 | Escaneo de archivos | Media | Sí, con volumen de archivos | Activa |
| TD-OBS-001 | Observabilidad | Media | No | Activa |
| TD-DASHBOARD-001 | Métricas dashboard | Baja | No | Activa |
| TD-DB-001 | Contrato RPC impresión | Baja/Media | No | Activa |
| TD-ROUTES-001 | Acceso trabajador a ruta nueva | Baja | No | Activa |

## Bloqueadores antes de producción pública

### TD-UPLOAD-001 - Archivos grandes procesados por Next

Las subidas actuales atraviesan Server Actions. `next.config.ts` permite hasta
`110mb` en `serverActions.bodySizeLimit` y `proxyClientMaxBodySize` también está
en `110mb`, mientras el sistema permite hasta cinco archivos de 20 MB. Este
flujo es aceptable para MVP y QA local, pero antes de producción debe probarse
en infraestructura real o reemplazarse por un flujo adecuado para archivos
grandes.

### TD-SECURITY-001 - Protección antiabuso de rutas públicas

Las rutas `/solicitud` y `/estado` no tienen todavía rate limiting, captcha,
honeypot u otra protección antiabuso avanzada. Antes de exposición pública deben
definirse mitigaciones por IP/proveedor, límites de frecuencia y criterio de
auditoría o métricas de intentos fallidos.

### TD-STORAGE-002 - Escaneo de archivos

El MVP valida MIME, extensión, tamaño y permisos, pero no inspecciona contenido
con antivirus ni motor especializado. Antes de producción pública con volumen
real de archivos debe evaluarse escaneo, cuarentena o workflow operativo de
revisión.

## Deudas activas

### TD-UPLOAD-001 - Archivos grandes procesados por Next

- Área: Upload/Infraestructura.
- Severidad: Alta.
- Bloquea producción pública: Sí, hasta validar la infraestructura o adoptar un flujo adecuado.
- Estado: Activa.

Las subidas actuales pasan por Server Actions. Para soportar el límite funcional
de hasta cinco archivos de 20 MB, `next.config.ts` mantiene
`serverActions.bodySizeLimit = "110mb"` y `proxyClientMaxBodySize = "110mb"`.
Esto significa que Next puede recibir y procesar cuerpos grandes antes de que el
archivo termine en Storage.

El compromiso es razonable para MVP y QA local, pero en producción puede causar
presión de memoria, timeouts o incompatibilidad con límites del hosting, proxy o
plataforma de despliegue. Antes de exposición pública debe validarse con la
infraestructura real.

Solución recomendada:

- Evaluar upload directo y controlado a Supabase Storage mediante signed upload
  URLs u otro flujo especializado.
- Mantener validaciones de permisos y metadata en servidor.
- No debilitar RLS, grants ni policies de Storage.
- No abrir rutas privadas, `file_path` ni credenciales administrativas al cliente.

### TD-QA-001 - Suite e2e paralela no estable

La suite e2e Chromium serial es estable, pero la suite completa en paralelo no
debe usarse todavía como gate de CI. Requiere aislar usuarios, sesiones y datos
mutantes antes de aumentar workers.

### TD-QA-002 - Usuarios QA compartidos

Los specs autenticados usan usuarios compartidos por rol. Esto es suficiente en
serial, pero puede interferir con ejecuciones concurrentes. Evaluar
`storageState` por rol, usuarios por worker o una estrategia mixta.

### TD-QA-003 - Datos QA persistentes y falta de cleanup

Pedidos, solicitudes, plantillas y otros registros QA quedan persistidos después
de tests mutantes. Diseñar seed/cleanup seguro por prefijos QA, con allowlist
estricta y sin borrado genérico agresivo.

### TD-QA-004 - Fixtures parciales de Storage

Algunos casos de Storage dependen de registros existentes o saltan si no hay
datos adecuados. Crear fixtures estables de objeto y metadata para pedido y
solicitud cuando se endurezca Storage QA.

### TD-TRACKING-001 - Tracking focal con referencia real

El spec focal de `/estado` cubre principalmente referencia inválida; la
referencia válida queda cubierta por full visual QA. Crear fixture focal estable
si evoluciona el contrato público.

### TD-QA-005 - Full visual QA grande

`full-visual-qa.spec.ts` conserva valor como aceptación transversal, pero cubre
varios dominios en un recorrido mutante grande. Extraer flujos hacia specs
focales solo cuando el diagnóstico o mantenimiento empiece a doler.

### TD-TEMPLATES-001 - Operaciones secuenciales en tareas de plantilla

Crear, eliminar y reordenar tareas de plantilla usa varias operaciones
secuenciales. Evaluar una RPC transaccional si aparecen concurrencia,
inconsistencias de orden o errores intermedios reales.

### TD-STORAGE-001 - Reconciliación Storage/Postgres

El upload de objeto en Storage y la inserción de metadata en Postgres no son una
transacción única. Mantener cleanup best-effort, pero diseñar reconciliación o
limpieza server-side para objetos huérfanos sin abrir borrado anónimo ni exponer
rutas privadas.

### TD-OBS-001 - Observabilidad operativa limitada

Logs, métricas, alertas y monitoreo agregado son limitados. Antes de
preproducción conviene definir logs estructurados, métricas clave, alertas,
monitoreo de errores y seguimiento de Storage/jobs.

### TD-DASHBOARD-001 - Métrica de pedidos sin tareas

El dashboard genérico puede mezclar encargos e impresiones en indicadores donde
la ausencia de tareas solo bloquea a encargos. Filtrar por `workflow_type =
encargo` o reformular la métrica antes de usarla como indicador estricto.

### TD-DB-001 - Contrato DB de conversión de impresión

La aplicación normaliza título y descripción de solicitudes de impresión antes
de llamar a `convertir_solicitud_a_pedido`, pero la RPC exige esos campos no
vacíos. Decidir si el fallback debe seguir solo en aplicación o reforzarse en el
contrato transaccional.

### TD-ROUTES-001 - Respuesta de trabajador en `/dashboard/pedidos/nuevo`

Un trabajador puede recibir 200 en la ruta de nuevo pedido, aunque la pantalla
muestra falta de permiso y no expone formulario. La operación está bloqueada por
UI, action y servicio. Evaluar si conviene redirección o pantalla unificada de
acceso denegado.

## Riesgos operativos

- Drift entre permisos TypeScript, RLS y RPCs.
- Cambios en `workflow_type` sin coordinar Pedidos, Dashboard, templates y QA.
- Reintroducir Supabase en Client Components.
- Crear `src/services` duplicando `src/lib`.
- Exponer rows, errores crudos, `file_path`, bucket o signed URLs en superficies cliente.
- Mover reglas críticas a UI o Server Actions sin defensa server-side/RLS.
- Editar tipos generados o migraciones históricas sin fase explícita.

## Trabajo futuro que no es deuda técnica

- Catálogo comercial.
- Tienda online.
- Carrito.
- Pagos online.
- Nuevas funcionalidades comerciales.
- Nuevas métricas de negocio.
- Reportes avanzados.
- Notificaciones reales.
- Panel de cliente.
- Normalización detallada de atributos de impresión sin necesidad real de búsqueda,
  cotización, automatización o métricas.
- Movimientos financieros, comprobantes y cierre de caja si el negocio lo requiere.

## Política de actualización

- Cada deuda debe tener ID estable.
- No agregar trabajo funcional futuro como deuda técnica.
- Actualizar severidad si cambia el contexto.
- Registrar el documento o commit donde se resuelva.
- Revisar este registro al cerrar cada beta o fase de preproducción.

## Contexto histórico

- [BETA_2_TECHNICAL_DEBT.md](../archive/beta-2-architecture/BETA_2_TECHNICAL_DEBT.md)
- [TECHNICAL_AUDIT.md](../archive/initial-development/TECHNICAL_AUDIT.md)
