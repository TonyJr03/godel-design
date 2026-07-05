# Beta 2 - Registro de deuda tecnica

## 1. Proposito

Este documento registra compromisos tecnicos reales aceptados al cierre de Beta
2. Su objetivo es diferenciar deuda tecnica de alcance futuro de producto,
mejoras opcionales o deseos de UI/UX.

Las deudas aqui registradas son accionables, tienen ID estable y no bloquean el
cierre arquitectonico de Beta 2 salvo que el propio registro indique una
condicion futura de bloqueo.

## 2. Criterios de clasificacion

- Deuda tecnica: decision tecnica aceptada temporalmente que puede aumentar
  mantenimiento, fragilidad, coste de cambio o riesgo de drift si el proyecto
  crece.
- Riesgo operativo: condicion que no rompe el sistema actual, pero puede afectar
  estabilidad, seguridad, monitoreo o soporte al pasar a produccion o mayor
  volumen.
- Mejora opcional: cambio conveniente, pero no necesario para seguridad,
  arquitectura o operacion actual.
- Trabajo funcional futuro: nueva capacidad de producto o negocio. No se
  clasifica como deuda tecnica por no existir todavia en el alcance implementado.

## 3. Resumen

| ID | Area | Deuda | Severidad | Bloquea actualmente | Fase recomendada |
|---|---|---|---|---|---|
| TD-QA-001 | QA | Suite e2e paralela no estable | Media | Si, antes de usar paralelo en CI | Tooling/CI futuro |
| TD-QA-002 | QA/Auth | Usuarios QA compartidos | Media | No | Fixtures QA |
| TD-QA-003 | QA/Datos | Datos QA persistentes y falta de cleanup | Media | No | Fixtures/seed/cleanup |
| TD-QA-004 | QA/Storage | Fixtures parciales de Storage | Media | No | Storage QA hardening |
| TD-TRACKING-001 | QA/Tracking | Tracking focal con referencia real | Media | No | Public tracking QA |
| TD-QA-005 | QA | Full visual QA grande | Media | No | QA/tooling futuro si aumenta el coste |
| TD-TEMPLATES-001 | Configuracion/templates | Operaciones secuenciales en tareas de plantilla | Media | No | Templates hardening |
| TD-STORAGE-001 | Storage | Reconciliacion Storage/Postgres | Media | No | Storage operativo |
| TD-SECURITY-001 | Seguridad publica | Proteccion antiabuso de rutas publicas | Alta | Si, antes de produccion publica | Preproduccion publica |
| TD-STORAGE-002 | Storage/Seguridad | Escaneo de archivos | Media | Si, antes de produccion publica con volumen de archivos | Preproduccion publica |
| TD-OBS-001 | Observabilidad | Observabilidad operativa limitada | Media | No | Infra/preproduccion |

## 4. Deudas activas

### TD-QA-001 - Suite e2e paralela no estable

- ID: TD-QA-001.
- Descripcion: la suite e2e Chromium serial es estable, pero la suite paralela
  completa no debe usarse todavia como gate.
- Causa: specs autenticados/mutantes comparten usuarios, sesiones y datos QA
  persistentes; algunos flujos dependen de navegacion y registros creados en la
  misma ejecucion.
- Impacto: si se usa paralelo como gate CI antes de estabilizarlo, puede generar
  falsos fallos y diagnostico lento.
- Evidencia: Beta 2.9 documenta serial 30/30, y ejecuciones paralelas con fallos
  en specs autenticados/mutantes.
- Severidad: Media.
- Condicion que justificaria resolverla: convertir paralelo en gate CI,
  aumentar volumen de specs o necesitar reducir tiempos de pipeline.
- Solucion recomendada: aislar usuarios/sesiones, estabilizar fixtures,
  separar specs paralelizables, medir por grupos y activar paralelo solo por
  bloques confiables.
- Fase sugerida: Tooling/CI futuro.
- Estado: Activa aceptada.

### TD-QA-002 - Usuarios QA compartidos

- ID: TD-QA-002.
- Descripcion: los specs autenticados usan los mismos usuarios por rol.
- Causa: el setup QA actual prioriza simplicidad y credenciales locales por rol.
- Impacto: logins concurrentes y acciones mutantes pueden interferir entre specs
  si se ejecutan en paralelo.
- Evidencia: estrategia Beta 2.9 registra usuarios QA compartidos y recomienda
  modo serial para specs autenticados.
- Severidad: Media.
- Condicion que justificaria resolverla: querer paralelizar specs autenticados
  o ejecutar CI con varios workers.
- Solucion recomendada: evaluar `storageState` por rol, usuarios QA aislados por
  worker o una estrategia mixta de sesiones preautenticadas y specs seriales.
- Fase sugerida: Fixtures QA.
- Estado: Activa aceptada.

### TD-QA-003 - Datos QA persistentes y falta de cleanup

- ID: TD-QA-003.
- Descripcion: pedidos, solicitudes, plantillas y otros registros QA quedan
  persistidos despues de los tests mutantes.
- Causa: no existe todavia seed/cleanup controlado ni transacciones de test
  aisladas para e2e.
- Impacto: crecimiento de datos QA, posible contaminacion visual de listados y
  mayor fragilidad si los tests dependen de primeros registros existentes.
- Evidencia: full visual QA, pedidos, solicitudes internas y task templates crean
  datos con prefijos QA.
- Severidad: Media.
- Condicion que justificaria resolverla: crecimiento excesivo de datos,
  necesidad de CI limpio o fallos por contaminacion de fixtures.
- Solucion recomendada: disenar seed/cleanup seguro por prefijos QA, con
  allowlist estricta y sin borrado agresivo generico.
- Fase sugerida: Fixtures/seed/cleanup.
- Estado: Activa aceptada.

### TD-QA-004 - Fixtures parciales de Storage

- ID: TD-QA-004.
- Descripcion: algunos casos de `storage.spec.ts` dependen parcialmente de datos
  existentes o pueden saltarse si no hay registros adecuados.
- Causa: no existe fixture estable de Storage con objeto y metadata controlados
  para pedido/solicitud.
- Impacto: cobertura de descarga/upload positivo real puede ser incompleta o
  volverse fragil.
- Evidencia: auditoria Beta 2.6 y estrategia Beta 2.9 registran esta limitacion.
- Severidad: Media.
- Condicion que justificaria resolverla: priorizar hardening de Storage,
  descargas reales en CI o cambios en policies/rutas de archivos.
- Solucion recomendada: crear fixtures estables de Storage con setup y cleanup
  seguro, o una estrategia de seed controlada por entorno QA.
- Fase sugerida: Storage QA hardening.
- Estado: Activa aceptada.

### TD-TRACKING-001 - Tracking focal con referencia real

- ID: TD-TRACKING-001.
- Descripcion: el spec focal de tracking cubre principalmente referencia
  invalida; la referencia valida se valida en full visual QA.
- Causa: evitar dependencia de datos reales persistentes en spec focal.
- Impacto: cambios futuros del contrato `/estado` pueden depender demasiado de
  full visual QA para el caso positivo real.
- Evidencia: matriz Beta 2.9 registra `public-tracking.spec.ts` como focal
  negativo y full visual QA como cobertura de referencia valida.
- Severidad: Media.
- Condicion que justificaria resolverla: evolucionar tracking publico, ampliar
  campos del DTO o necesitar QA rapido de caso positivo.
- Solucion recomendada: crear fixture focal estable que genere referencia valida
  controlada y la consulte sin exponer datos internos.
- Fase sugerida: Public tracking QA.
- Estado: Activa aceptada.

### TD-QA-005 - Full visual QA grande

- ID: TD-QA-005.
- Descripcion: `full-visual-qa.spec.ts` sigue siendo grande y cubre multiples
  dominios en un recorrido transversal.
- Causa: nacio como aceptacion integral y conserva valor como cierre de release.
- Impacto: si falla, el diagnostico puede ser mas lento que en specs focales.
- Evidencia: Beta 2.0, 2.4 y 2.9 documentan que el full visual QA es util, pero
  amplio y mutante.
- Severidad: Media.
- Condicion que justificaria resolverla: aumento real del coste de
  mantenimiento, fallos frecuentes o tiempos incompatibles con el flujo de
  trabajo.
- Solucion recomendada: mantenerlo como aceptacion transversal y extraer solo
  flujos que duelan realmente hacia specs focales; no dividir por anticipacion.
- Fase sugerida: QA/tooling futuro si aumenta el coste.
- Estado: Activa aceptada.

### TD-TEMPLATES-001 - Operaciones secuenciales en tareas de plantilla

- ID: TD-TEMPLATES-001.
- Descripcion: crear, eliminar y reordenar tareas de plantilla usa varias
  operaciones Supabase secuenciales.
- Causa: para MVP y bajo volumen, la claridad del servicio TypeScript fue
  suficiente; solo la aplicacion de plantilla a pedido usa RPC transaccional.
- Impacto: ante errores intermedios o concurrencia real, puede quedar orden
  parcialmente normalizado.
- Evidencia: auditoria Beta 2.8 y README de `src/lib/task-templates`.
- Severidad: Media.
- Condicion que justificaria resolverla: uso concurrente de Configuracion,
  errores reales de orden o crecimiento de operaciones de templates.
- Solucion recomendada: evaluar una RPC transaccional para mutaciones de tareas
  de plantilla si hay evidencia de concurrencia o inconsistencia.
- Fase sugerida: Templates hardening.
- Estado: Activa aceptada.

### TD-STORAGE-001 - Reconciliacion Storage/Postgres

- ID: TD-STORAGE-001.
- Descripcion: upload de objeto en Storage e insercion de metadata en Postgres
  no son una transaccion unica.
- Causa: Supabase Storage y Postgres no comparten transaccion atomica desde el
  flujo actual.
- Impacto: pueden quedar objetos huerfanos si falla metadata despues del upload.
- Evidencia: auditorias Beta 2.4 y Beta 2.6 registran cleanup best-effort y
  falta de reconciliacion.
- Severidad: Media.
- Condicion que justificaria resolverla: volumen de archivos, costos de Storage,
  auditoria operativa o fallos reales de metadata post-upload.
- Solucion recomendada: disenar job de reconciliacion o cleanup operativo
  server-side, nunca abrir borrado anonimo ni exponer rutas privadas.
- Fase sugerida: Storage operativo.
- Estado: Activa aceptada.

### TD-SECURITY-001 - Proteccion antiabuso de rutas publicas

- ID: TD-SECURITY-001.
- Descripcion: las rutas publicas no tienen todavia rate limiting, captcha,
  honeypot u otra proteccion antiabuso avanzada.
- Causa: Beta 2 consolido arquitectura y contratos, no hardening publico final.
- Impacto: antes de exposicion publica productiva, `/solicitud` y `/estado`
  pueden requerir mitigaciones contra spam, abuso o consumo excesivo.
- Evidencia: auditorias de solicitudes, Storage y cierre Beta 2 registran
  hardening publico como posterior.
- Severidad: Alta.
- Condicion que justificaria resolverla: exponer el sistema publicamente en
  produccion o recibir trafico externo no controlado.
- Solucion recomendada: definir rate limiting, captcha/honeypot, limites por IP
  o proveedor de proteccion, y revisar logs/alertas.
- Fase sugerida: Preproduccion publica.
- Estado: Activa aceptada; bloquea antes de produccion publica.

### TD-STORAGE-002 - Escaneo de archivos

- ID: TD-STORAGE-002.
- Descripcion: no hay antivirus ni escaneo profundo de archivos subidos.
- Causa: el MVP limita MIME, extension y tamano, pero no inspecciona contenido
  con motor especializado.
- Impacto: antes de produccion publica o mayor volumen, archivos maliciosos
  pueden requerir control adicional aunque permanezcan privados.
- Evidencia: README y auditoria Beta 2.6 registran validacion basica y ausencia
  de antivirus/escaneo profundo.
- Severidad: Media.
- Condicion que justificaria resolverla: produccion publica, mayor volumen de
  archivos o requisitos de seguridad/compliance.
- Solucion recomendada: evaluar servicio de escaneo, cuarentena o workflow de
  revision antes de habilitar consumo amplio.
- Fase sugerida: Preproduccion publica.
- Estado: Activa aceptada; bloquea antes de produccion publica con volumen de
  archivos.

### TD-OBS-001 - Observabilidad operativa

- ID: TD-OBS-001.
- Descripcion: logs, metricas, alertas y monitoreo agregado son limitados.
- Causa: la fase se enfoco en arquitectura, seguridad de contratos y QA local.
- Impacto: diagnostico en produccion podria ser lento sin trazas, alertas y
  metricas operativas suficientes.
- Evidencia: auditorias de Storage y cierre Beta 2 registran monitoreo operativo
  como posterior.
- Severidad: Media.
- Condicion que justificaria resolverla: preproduccion, despliegue publico,
  soporte real de usuarios o necesidad de SLO/alertas.
- Solucion recomendada: definir logs estructurados, metricas clave, alertas,
  monitoreo de errores y seguimiento de jobs/Storage.
- Fase sugerida: Infra/preproduccion.
- Estado: Activa aceptada.

## 5. Riesgos de drift arquitectonico

Estos son riesgos preventivos de mantenimiento, no necesariamente deuda activa:

- Cambiar permisos TypeScript sin coordinar RLS.
- Cambiar `workflow_type` sin coordinar Pedidos, Dashboard, templates y QA.
- Volver a introducir Supabase en Client Components.
- Crear `src/services` duplicando `src/lib`.
- Exponer rows o errores crudos en rutas publicas.
- Exponer `file_path`, bucket o signed URLs.
- Mover reglas criticas a UI o Server Actions sin defensa server-side/RLS.
- Editar tipos generados o migraciones historicas sin fase explicita.

## 6. Trabajo futuro que NO es deuda tecnica

Los siguientes elementos son futuras ampliaciones de producto, UI/UX o negocio.
No son deuda tecnica por si mismos:

- catalogo digital;
- tienda online;
- carrito;
- pagos online;
- nuevas funcionalidades comerciales;
- rediseno UI/UX planificado;
- nuevas metricas de negocio;
- reportes avanzados;
- notificaciones reales;
- panel de cliente.

## 7. Politica de actualizacion

- Cada deuda debe tener ID estable.
- No eliminar deuda sin registrar su resolucion.
- Actualizar severidad si cambia el contexto.
- Enlazar el commit, subfase o documento donde se resuelva.
- Revisar este registro al cerrar cada beta importante.
- No mezclar nuevas funcionalidades de producto con deuda tecnica.

## 8. Estado al cierre de Beta 2

Las deudas activas estan aceptadas y no bloquean el cierre arquitectonico de
Beta 2.
