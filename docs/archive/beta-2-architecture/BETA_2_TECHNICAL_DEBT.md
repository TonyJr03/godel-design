# Beta 2 - Registro de deuda técnica

## 1. Propósito

Este documento registra compromisos técnicos reales aceptados al cierre de Beta
2. Su objetivo es diferenciar deuda técnica de alcance futuro de producto,
mejoras opcionales o deseos de UI/UX.

Las deudas aquí registradas son accionables, tienen ID estable y no bloquean el
cierre arquitectónico de Beta 2 salvo que el propio registro indique una
condición futura de bloqueo.

## 2. Criterios de clasificación

- Deuda técnica: decisión técnica aceptada temporalmente que puede aumentar
  mantenimiento, fragilidad, coste de cambio o riesgo de drift si el proyecto
  crece.
- Riesgo operativo: condición que no rompe el sistema actual, pero puede afectar
  estabilidad, seguridad, monitoreo o soporte al pasar a producción o mayor
  volumen.
- Mejora opcional: cambio conveniente, pero no necesario para seguridad,
  arquitectura o operación actual.
- Trabajo funcional futuro: nueva capacidad de producto o negocio. No se
  clasifica como deuda técnica por no existir todavía en el alcance implementado.

## 3. Resumen

| ID | Área | Deuda | Severidad | Bloquea actualmente | Fase recomendada |
|---|---|---|---|---|---|
| TD-QA-001 | QA | Suite e2e paralela no estable | Media | Si, antes de usar paralelo en CI | Tooling/CI futuro |
| TD-QA-002 | QA/Auth | Usuarios QA compartidos | Media | No | Fixtures QA |
| TD-QA-003 | QA/Datos | Datos QA persistentes y falta de cleanup | Media | No | Fixtures/seed/cleanup |
| TD-QA-004 | QA/Storage | Fixtures parciales de Storage | Media | No | Storage QA hardening |
| TD-TRACKING-001 | QA/Tracking | Tracking focal con referencia real | Media | No | Public tracking QA |
| TD-QA-005 | QA | Full visual QA grande | Media | No | QA/tooling futuro si aumenta el coste |
| TD-TEMPLATES-001 | Configuración/templates | Operaciones secuenciales en tareas de plantilla | Media | No | Templates hardening |
| TD-STORAGE-001 | Storage | Reconciliacion Storage/Postgres | Media | No | Storage operativo |
| TD-SECURITY-001 | Seguridad pública | Proteccion antiabuso de rutas públicas | Alta | Si, antes de producción pública | Preproduccion pública |
| TD-STORAGE-002 | Storage/Seguridad | Escaneo de archivos | Media | Si, antes de producción pública con volumen de archivos | Preproduccion pública |
| TD-OBS-001 | Observabilidad | Observabilidad operativa limitada | Media | No | Infra/preproducción |

## 4. Deudas activas

### TD-QA-001 - Suite e2e paralela no estable

- ID: TD-QA-001.
- Descripción: la suite e2e Chromium serial es estable, pero la suite paralela
  completa no debe usarse todavía como gate.
- Causa: specs autenticados/mutantes comparten usuarios, sesiones y datos QA
  persistentes; algunos flujos dependen de navegación y registros creados en la
  misma ejecución.
- Impacto: si se usa paralelo como gate CI antes de estabilizarlo, puede generar
  falsos fallos y diagnóstico lento.
- Evidencia: Beta 2.9 documenta serial 30/30, y ejecuciones paralelas con fallos
  en specs autenticados/mutantes.
- Severidad: Media.
- Condición que justificaria resolverla: convertir paralelo en gate CI,
  aumentar volumen de specs o necesitar reducir tiempos de pipeline.
- Solución recomendada: aislar usuarios/sesiones, estabilizar fixtures,
  separar specs paralelizables, medir por grupos y activar paralelo solo por
  bloques confiables.
- Fase sugerida: Tooling/CI futuro.
- Estado: Activa aceptada.

### TD-QA-002 - Usuarios QA compartidos

- ID: TD-QA-002.
- Descripción: los specs autenticados usan los mismos usuarios por rol.
- Causa: el setup QA actual prioriza simplicidad y credenciales locales por rol.
- Impacto: logins concurrentes y acciones mutantes pueden interferir entre specs
  si se ejecutan en paralelo.
- Evidencia: estrategia Beta 2.9 registra usuarios QA compartidos y recomienda
  modo serial para specs autenticados.
- Severidad: Media.
- Condición que justificaria resolverla: querer paralelizar specs autenticados
  o ejecutar CI con varios workers.
- Solución recomendada: evaluar `storageState` por rol, usuarios QA aislados por
  worker o una estrategia mixta de sesiones preautenticadas y specs seriales.
- Fase sugerida: Fixtures QA.
- Estado: Activa aceptada.

### TD-QA-003 - Datos QA persistentes y falta de cleanup

- ID: TD-QA-003.
- Descripción: pedidos, solicitudes, plantillas y otros registros QA quedan
  persistidos después de los tests mutantes.
- Causa: no existe todavía seed/cleanup controlado ni transacciones de test
  aisladas para e2e.
- Impacto: crecimiento de datos QA, posible contaminación visual de listados y
  mayor fragilidad si los tests dependen de primeros registros existentes.
- Evidencia: full visual QA, pedidos, solicitudes internas y task templates crean
  datos con prefijos QA.
- Severidad: Media.
- Condición que justificaria resolverla: crecimiento excesivo de datos,
  necesidad de CI limpio o fallos por contaminación de fixtures.
- Solución recomendada: diseñar seed/cleanup seguro por prefijos QA, con
  allowlist estricta y sin borrado agresivo genérico.
- Fase sugerida: Fixtures/seed/cleanup.
- Estado: Activa aceptada.

### TD-QA-004 - Fixtures parciales de Storage

- ID: TD-QA-004.
- Descripción: algunos casos de `storage.spec.ts` dependen parcialmente de datos
  existentes o pueden saltarse si no hay registros adecuados.
- Causa: no existe fixture estable de Storage con objeto y metadata controlados
  para pedido/solicitud.
- Impacto: cobertura de descarga/upload positivo real puede ser incompleta o
  volverse fragil.
- Evidencia: auditoría Beta 2.6 y estrategia Beta 2.9 registran esta limitación.
- Severidad: Media.
- Condición que justificaria resolverla: priorizar hardening de Storage,
  descargas reales en CI o cambios en policies/rutas de archivos.
- Solución recomendada: crear fixtures estables de Storage con setup y cleanup
  seguro, o una estrategia de seed controlada por entorno QA.
- Fase sugerida: Storage QA hardening.
- Estado: Activa aceptada.

### TD-TRACKING-001 - Tracking focal con referencia real

- ID: TD-TRACKING-001.
- Descripción: el spec focal de tracking cubre principalmente referencia
  inválida; la referencia válida se valida en full visual QA.
- Causa: evitar dependencia de datos reales persistentes en spec focal.
- Impacto: cambios futuros del contrato `/estado` pueden depender demasiado de
  full visual QA para el caso positivo real.
- Evidencia: matriz Beta 2.9 registra `public-tracking.spec.ts` como focal
  negativo y full visual QA como cobertura de referencia válida.
- Severidad: Media.
- Condición que justificaria resolverla: evolucionar tracking público, ampliar
  campos del DTO o necesitar QA rapido de caso positivo.
- Solución recomendada: crear fixture focal estable que genere referencia válida
  controlada y la consulte sin exponer datos internos.
- Fase sugerida: Public tracking QA.
- Estado: Activa aceptada.

### TD-QA-005 - Full visual QA grande

- ID: TD-QA-005.
- Descripción: `full-visual-qa.spec.ts` sigue siendo grande y cubre múltiples
  dominios en un recorrido transversal.
- Causa: nació como aceptación integral y conserva valor como cierre de release.
- Impacto: si falla, el diagnóstico puede ser más lento que en specs focales.
- Evidencia: Beta 2.0, 2.4 y 2.9 documentan que el full visual QA es útil, pero
  amplio y mutante.
- Severidad: Media.
- Condición que justificaria resolverla: aumento real del coste de
  mantenimiento, fallos frecuentes o tiempos incompatibles con el flujo de
  trabajo.
- Solución recomendada: mantenerlo como aceptación transversal y extraer solo
  flujos que duelan realmente hacia specs focales; no dividir por anticipación.
- Fase sugerida: QA/tooling futuro si aumenta el coste.
- Estado: Activa aceptada.

### TD-TEMPLATES-001 - Operaciones secuenciales en tareas de plantilla

- ID: TD-TEMPLATES-001.
- Descripción: crear, eliminar y reordenar tareas de plantilla usa varias
  operaciones Supabase secuenciales.
- Causa: para MVP y bajo volumen, la claridad del servicio TypeScript fue
  suficiente; solo la aplicación de plantilla a pedido usa RPC transaccional.
- Impacto: ante errores intermedios o concurrencia real, puede quedar orden
  parcialmente normalizado.
- Evidencia: auditoría Beta 2.8 y README de `src/lib/task-templates`.
- Severidad: Media.
- Condición que justificaria resolverla: uso concurrente de Configuración,
  errores reales de orden o crecimiento de operaciones de templates.
- Solución recomendada: evaluar una RPC transaccional para mutaciones de tareas
  de plantilla si hay evidencia de concurrencia o inconsistencia.
- Fase sugerida: Templates hardening.
- Estado: Activa aceptada.

### TD-STORAGE-001 - Reconciliacion Storage/Postgres

- ID: TD-STORAGE-001.
- Descripción: upload de objeto en Storage e inserción de metadata en Postgres
  no son una transacción única.
- Causa: Supabase Storage y Postgres no comparten transacción atómica desde el
  flujo actual.
- Impacto: pueden quedar objetos huérfanos si falla metadata después del upload.
- Evidencia: auditorías Beta 2.4 y Beta 2.6 registran cleanup best-effort y
  falta de reconciliación.
- Severidad: Media.
- Condición que justificaria resolverla: volumen de archivos, costos de Storage,
  auditoría operativa o fallos reales de metadata post-upload.
- Solución recomendada: diseñar job de reconciliación o cleanup operativo
  server-side, nunca abrir borrado anónimo ni exponer rutas privadas.
- Fase sugerida: Storage operativo.
- Estado: Activa aceptada.

### TD-SECURITY-001 - Proteccion antiabuso de rutas públicas

- ID: TD-SECURITY-001.
- Descripción: las rutas públicas no tienen todavía rate limiting, captcha,
  honeypot u otra protección antiabuso avanzada.
- Causa: Beta 2 consolido arquitectura y contratos, no hardening público final.
- Impacto: antes de exposición pública productiva, `/solicitud` y `/estado`
  pueden requerir mitigaciones contra spam, abuso o consumo excesivo.
- Evidencia: auditorías de solicitudes, Storage y cierre Beta 2 registran
  hardening público como posterior.
- Severidad: Alta.
- Condición que justificaria resolverla: exponer el sistema publicamente en
  producción o recibir trafico externo no controlado.
- Solución recomendada: definir rate limiting, captcha/honeypot, límites por IP
  o proveedor de protección, y revisar logs/alertas.
- Fase sugerida: Preproduccion pública.
- Estado: Activa aceptada; bloquea antes de producción pública.

### TD-STORAGE-002 - Escaneo de archivos

- ID: TD-STORAGE-002.
- Descripción: no hay antivirus ni escaneo profundo de archivos subidos.
- Causa: el MVP limita MIME, extensión y tamaño, pero no inspecciona contenido
  con motor especializado.
- Impacto: antes de producción pública o mayor volumen, archivos maliciosos
  pueden requerir control adicional aunque permanezcan privados.
- Evidencia: README y auditoría Beta 2.6 registran validación básica y ausencia
  de antivirus/escaneo profundo.
- Severidad: Media.
- Condición que justificaria resolverla: producción pública, mayor volumen de
  archivos o requisitos de seguridad/compliance.
- Solución recomendada: evaluar servicio de escaneo, cuarentena o workflow de
  revisión antes de habilitar consumo amplio.
- Fase sugerida: Preproduccion pública.
- Estado: Activa aceptada; bloquea antes de producción pública con volumen de
  archivos.

### TD-OBS-001 - Observabilidad operativa

- ID: TD-OBS-001.
- Descripción: logs, métricas, alertas y monitoreo agregado son limitados.
- Causa: la fase se enfoco en arquitectura, seguridad de contratos y QA local.
- Impacto: diagnóstico en producción podría ser lento sin trazas, alertas y
  métricas operativas suficientes.
- Evidencia: auditorías de Storage y cierre Beta 2 registran monitoreo operativo
  como posterior.
- Severidad: Media.
- Condición que justificaria resolverla: preproducción, despliegue público,
  soporte real de usuarios o necesidad de SLO/alertas.
- Solución recomendada: definir logs estructurados, métricas clave, alertas,
  monitoreo de errores y seguimiento de jobs/Storage.
- Fase sugerida: Infra/preproducción.
- Estado: Activa aceptada.

## 5. Riesgos de drift arquitectónico

Estos son riesgos preventivos de mantenimiento, no necesariamente deuda activa:

- Cambiar permisos TypeScript sin coordinar RLS.
- Cambiar `workflow_type` sin coordinar Pedidos, Dashboard, templates y QA.
- Volver a introducir Supabase en Client Components.
- Crear `src/services` duplicando `src/lib`.
- Exponer rows o errores crudos en rutas públicas.
- Exponer `file_path`, bucket o signed URLs.
- Mover reglas críticas a UI o Server Actions sin defensa server-side/RLS.
- Editar tipos generados o migraciones históricas sin fase explícita.

## 6. Trabajo futuro que NO es deuda técnica

Los siguientes elementos son futuras ampliaciones de producto, UI/UX o negocio.
No son deuda técnica por si mismos:

- catálogo digital;
- tienda online;
- carrito;
- pagos online;
- nuevas funcionalidades comerciales;
- rediseño UI/UX planificado;
- nuevas métricas de negocio;
- reportes avanzados;
- notificaciones reales;
- panel de cliente.

## 7. Política de actualización

- Cada deuda debe tener ID estable.
- No eliminar deuda sin registrar su resolución.
- Actualizar severidad si cambia el contexto.
- Enlazar el commit, subfase o documento donde se resuelva.
- Revisar este registro al cerrar cada beta importante.
- No mezclar nuevas funcionalidades de producto con deuda técnica.

## 8. Estado al cierre de Beta 2

Las deudas activas están aceptadas y no bloquean el cierre arquitectónico de
Beta 2.
