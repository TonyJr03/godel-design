# Auditoria Tecnica Inicial

Fecha: 2026-05-28  
Proyecto: `godel-design`

## 1. Resumen ejecutivo

El proyecto esta en un estado tecnico solido para un MVP interno: los flujos principales existen, la mayor parte de la logica sensible vive en servidor, Supabase se usa con cliente normal y RLS queda como defensa final. No se detectaron problemas criticos evidentes como uso de service role key, consultas directas a `auth.users` desde la app, buckets publicos o exposicion directa de `file_path` a componentes.

La deuda principal no esta en una pieza rota, sino en consolidacion: helpers repetidos, validadores dispersos, `src/services` convertido en una capa placeholder obsoleta, documentacion parcialmente desactualizada y varias reglas duplicadas entre paginas, componentes, servicios y SQL.

## 2. Estado general de la arquitectura

La arquitectura actual esta bien encaminada:

- `src/app` concentra rutas App Router, Server Components, Server Actions y Route Handlers.
- `src/lib/<dominio>` contiene la logica server-side real por modulo.
- `src/components/<dominio>` mantiene componentes visuales sin consultas directas a Supabase.
- `src/lib/supabase` centraliza cliente server/browser/proxy.
- `src/lib/permissions` concentra la matriz de permisos y reglas de rutas.
- `supabase/migrations` refleja una evolucion progresiva del modelo, RLS, Storage, comentarios, historial, usuarios y dashboard.

Las areas que necesitan orden son:

- duplicacion entre dominios de validacion, UUID, fechas, labels y manejo de `FormData`;
- resultados de servicios con formas similares pero no normalizadas;
- documentacion historica que mezcla estado inicial, fases completadas y pendientes ya resueltos;
- superficie SQL con muchas funciones `security definer` y grants amplios que conviene inventariar antes de despliegue final;
- rendimiento del dashboard, que hace varias consultas y varias validaciones de perfil en paralelo para una sola pantalla.

## 3. Hallazgos por area

### Estructura de carpetas

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Medio | `src/services` contiene placeholders y no la capa real de servicios. | `src/services/*.service.ts` solo exporta objetos `pendiente`. | Confusion para mantenimiento; futuros cambios pueden tocar la capa equivocada. | Eliminar o renombrar en una tarea separada, despues de confirmar que no hay imports activos. |
| Medio | Existen carpetas `src/lib/utils` y `src/lib/validators` sin uso visible. | Inventario de archivos no muestra utilidades reales ahi. | La arquitectura sugiere una capa comun que aun no existe. | Usarlas para helpers compartidos pequenos o eliminarlas si no se adoptan. |
| Bajo | `src/constants` duplica enums ya derivados de Supabase. | `roles.ts`, `estados-pedido.ts`, `estados-solicitud.ts` frente a `Constants.public.Enums`. | Divergencia si cambian enums en DB. | Preferir constantes generadas desde `database.types.ts` o consolidar aliases. |

### Servicios y logica server-side

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Alto | El dashboard repite carga de perfil y helpers de fecha/rol entre servicios. | `get-dashboard-summary.ts`, `get-dashboard-work-items.ts`, `get-dashboard-activity.ts`, `get-worker-dashboard.ts`. | Mas consultas de perfil por request y mayor superficie para diferencias sutiles. | Crear un pequeno helper de contexto de dashboard y utilidades puras de fecha/estado. |
| Medio | `getCurrentProfile()` y `getCurrentUserWithProfile()` duplican flujo y hacen `select("*")`. | `src/lib/auth/current-user.ts`. | Retorna mas columnas de las necesarias y repite consultas. | Crear DTO minimo `id, role, is_active, full_name` segun necesidad, manteniendo tipos completos solo donde hagan falta. |
| Medio | Los tipos de resultado varian por dominio. | Algunos servicios devuelven `reason`, otros solo `message`, otros agregan `fieldErrors`. | Manejo de UI y acciones menos predecible. | Definir un patron base por familia: list/detail/mutation/upload. |
| Bajo | Logs de `console.error` son consistentes pero dispersos. | Multiples servicios capturan y loguean errores tecnicos. | Dificulta observabilidad si crece el sistema. | Mantener por ahora; futuro helper de logging server-side sin exponer detalles al usuario. |

### Componentes

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Medio | Labels de estados, roles y fechas estan duplicados en paginas/componentes/dashboard. | `PedidoHistorySection`, `SolicitudHistorySection`, paginas de listados, dashboard activity. | Cambios de texto o estados pueden quedar inconsistentes. | Centralizar labels por dominio (`pedidos/status.ts`, `solicitudes/status.ts`, roles). |
| Bajo | El listado de pedidos muestra "Nuevo pedido" tambien a `trabajador`. | `/dashboard/pedidos/page.tsx`; la pagina de nuevo pedido si bloquea por servidor. | No es una brecha de seguridad, pero crea una UX inconsistente. | Ocultar acciones segun permiso en la pagina de listado. |
| Bajo | Algunos componentes mezclan formateo de dominio con render. | Historial de solicitud y pedido construyen resumen localmente. | Crece el componente y duplica reglas con dashboard activity. | Extraer formateadores puros por dominio cuando se toque historial. |

### Server Actions

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Alto | `getFormValue()` esta repetido en casi todas las actions. | Actions de login, solicitud, clientes, pedidos, usuarios. | Duplicacion simple, pero amplia. | Crear helper comun para lectura segura de `FormData`. |
| Alto | Algunas actions de comentarios usan fallback desde `headers()`/`referer` para recuperar id si falta el hidden input. | `src/app/dashboard/pedidos/[id]/actions.ts`, `src/app/dashboard/solicitudes/[id]/actions.ts`. | Mantiene el flujo funcionando, pero confiar en ruta inferida complica auditoria y pruebas. | Hacer obligatorio el id validado desde formulario o bind server-side; dejar el fallback solo si hay una razon explicita. |
| Medio | Revalidaciones de rutas estan escritas a mano y repetidas. | Actions de pedidos, solicitudes, clientes, usuarios. | Omisiones futuras o rutas inconsistentes. | Crear helpers de revalidacion por dominio. |

### Validaciones

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Alto | UUID, fecha ISO, limpieza de strings y validacion de email estan duplicados. | `order-validation`, `user-validation`, storage `file-paths`, solicitudes, clientes. | Inconsistencias pequeñas y mantenimiento lento. | Centralizar helpers puros sin cambiar reglas de negocio. |
| Medio | No se usa libreria de schemas; las validaciones manuales estan bien pero crecen. | Validadores propios en cada dominio. | A mayor superficie, mas dificil validar exhaustivamente. | Por ahora no instalar dependencias; primero unificar helpers. Evaluar schema library solo si el proyecto lo decide. |
| Medio | La subida publica valida archivos antes de crear solicitud, pero si falla metadata tras upload anonimo queda deuda de limpieza. | Documentado en `../STORAGE_MODEL.md` y `TECH_DEBT.md`. | Objetos huerfanos en Storage ante fallos parciales. | Mantener para MVP; disenar limpieza segura antes de produccion. |

### Tipos TypeScript

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Medio | `database.types.ts` esta actualizado con RPCs/tablas nuevas, pero hay wrappers de dominio muy finos y constantes paralelas. | `src/types/*.ts`, `src/constants/*`. | Varias fuentes conceptuales para lo mismo. | Definir si `src/types/<dominio>` sera fachada oficial o eliminar lo que no aporte. |
| Bajo | Tipos de roles tienen varios nombres: `Role`, `Rol`, `InternalUserRole`, `DashboardRole`. | `permissions`, `usuarios`, `constants`, `dashboard`. | Carga cognitiva. | Mantener `Role` derivado de Supabase como tipo base y alias solo cuando aporten contexto. |

### Supabase/RLS

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Alto | Hay muchas funciones `security definer` y grants a `anon, authenticated`, incluyendo un `grant execute on all functions in schema private`. | `20260512001000_initial_rls_policies.sql`, migraciones de Storage e historial. | No se ve una brecha directa, pero la superficie merece revision dedicada antes de produccion. | Inventariar funcion por funcion, cambiar grants globales por grants explicitos si aplica. |
| Alto | Las policies fueron redefinidas en varias migraciones. | Policies de lectura de clientes, solicitudes y perfiles. | El estado final es razonable, pero cuesta auditarlo mentalmente desde la historia. | Crear una documentacion o snapshot de policies efectivas finales. |
| Medio | RLS y codigo TypeScript estan mayormente alineados, pero la fuente de verdad de permisos existe en dos mundos. | `permissions.ts` y funciones private SQL. | Drift futuro si se agrega un rol/permiso. | En cada cambio de permisos, actualizar matriz TS, docs y SQL en la misma tarea. |
| Bajo | Las RPCs de pedido estan bien acotadas pero devuelven `metadata` a servicios. | `listar_pedido_historial`, dashboard activity. | La UI actual no renderiza JSON crudo, pero hay que conservar disciplina. | Mantener DTOs/formatters que transformen metadata antes de llegar a componentes. |

### Storage

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Alto | Server Actions permiten cuerpos grandes (`110mb`) para archivos. | `next.config.ts`, `docs/development/TECH_DEBT.md`. | Riesgo de memoria/latencia en produccion. | Migrar a flujo de carga directa/controlada con signed upload cuando se prepare despliegue. |
| Medio | La generacion de signed URLs consulta `file_path`, pero solo dentro de helper server-side. | `src/lib/storage/signed-url.ts`. | Correcto hoy; sensible si se reutiliza mal. | Mantener API por `fileId`, no exponer rutas. |
| Medio | No hay eliminacion/limpieza de archivos implementada. | Docs de Storage. | Objetos huerfanos ante fallos o cambios operativos. | Disenar eliminacion segura con RLS y audit trail en fase posterior. |

### Documentacion

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Alto | `README.md` raiz esta desactualizado: describe Supabase/auth/formularios como fuera de alcance. | `README.md`. | Onboarding incorrecto. | Actualizar despues de esta auditoria, sin tocar `ROADMAP.md` si sigue restringido. |
| Alto | Algunos docs de flujo conservan secciones "pendiente" ya resueltas. | `PUBLIC_REQUEST_FLOW.md`, `INTERNAL_REQUESTS_FLOW.md`, `src/lib/solicitudes/README.md`, `src/lib/clientes/README.md`. | Confusion en futuras tareas. | Hacer una fase de limpieza documental. |
| Medio | `DATABASE_MODEL.md` mezcla proposito inicial con notas posteriores. | Primeras secciones dicen que no implementa SQL/RLS, luego describe modelo vigente. | Puede confundir como fuente de verdad. | Separar "modelo vigente" de "historia/fases". |
| Bajo | `TECH_DEBT.md` existe y es util, pero solo cubre subida de archivos. | `docs/development/TECH_DEBT.md`. | Otras deudas no quedan centralizadas. | Migrar hallazgos de esta auditoria a tareas pequeñas futuras. |

### Seguridad

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Critico | No se detectaron problemas criticos confirmados. | Busquedas sobre `SUPABASE_SERVICE_ROLE_KEY`, `service_role`, `auth.users`, `file_path`, URLs publicas. | N/A | Mantener restricciones actuales. |
| Alto | Public request no tiene captcha/rate limiting. | Documentado como pendiente. | Spam o abuso del formulario publico. | Antes de produccion, agregar control anti-spam/rate limit compatible con el despliegue. |
| Medio | Proxy protege rutas por seccion, pero algunas subrutas permitidas por prefijo dependen de checks de pagina/action. | `/dashboard/pedidos/nuevo` permitido por prefijo a trabajador, bloqueado luego en pagina/action. | Defensa final existe, pero UX y auditoria pueden mejorar. | Refinar reglas de rutas o checks visuales para acciones de gestion. |
| Medio | `avatar_url` se almacena como texto editable por admin. | Usuarios internos. | Si se renderiza como link/imagen sin restricciones futuras, puede abrir tracking o content externo. | Definir politica: URL externa permitida, Storage interno o campo deshabilitado. |

### Rendimiento y mantenibilidad

| Prioridad | Hallazgo | Evidencia | Riesgo | Propuesta |
| --- | --- | --- | --- | --- |
| Alto | `/dashboard` ejecuta tres servicios en paralelo, cada uno valida perfil y abre consultas propias. | `src/app/dashboard/page.tsx`. | Correcto para MVP; puede crecer en latencia y carga. | Compartir contexto de perfil y evaluar una capa agregadora. |
| Medio | Muchas queries usan limites fijos y ordenamientos razonables, pero no hay paginacion avanzada en algunos paneles. | Listados y dashboard. | Suficiente hoy; escalara peor con datos reales. | Mantener por ahora; paginar donde aparezca volumen real. |
| Medio | No hay tests automatizados visibles. | Inventario del repo. | Refactors futuros dependen de pruebas manuales. | Agregar pruebas focalizadas para validadores y servicios puros antes de refactors de riesgo. |

## 4. Prioridad global de hallazgos

### Critico

- No se encontraron hallazgos criticos confirmados en esta auditoria.

### Alto

- Consolidar Server Actions y eliminar fallback por `referer` donde no sea necesario.
- Revisar flujo de archivos grandes antes de produccion.
- Inventariar grants, funciones `security definer` y policies efectivas finales.
- Actualizar documentacion de onboarding y flujos desactualizados.
- Reducir duplicacion y consultas repetidas en dashboard.
- Agregar control anti-spam/rate limiting al formulario publico antes de despliegue.

### Medio

- Eliminar o formalizar `src/services`.
- Centralizar validadores comunes: UUID, fechas, email, limpieza de texto.
- Normalizar tipos de resultado por dominio.
- Revisar `getCurrentProfile()` para DTO minimo y menos duplicacion.
- Centralizar labels de estados/roles.
- Definir estrategia de cleanup/eliminacion de archivos.

### Bajo

- Limpiar constantes duplicadas.
- Ocultar acciones no disponibles para ciertos roles en UI.
- Ordenar aliases de tipos.
- Ampliar `TECH_DEBT.md` o convertir hallazgos en tareas.

## 5. Propuesta de plan de refactorizacion

### Fase 1: utilidades puras y bajo riesgo

- Crear helper comun para `getFormValue()`.
- Crear helper comun para `getSingleSearchParam()`.
- Exponer un `isValidUuid()` unico desde una ubicacion neutral.
- Centralizar `formatDateOnly()` y `addDays()`.
- No cambiar comportamiento ni textos en esta fase.

### Fase 2: labels y constantes de dominio

- Usar `PEDIDO_STATUS_LABELS` y `SOLICITUD_STATUS_LABELS` desde un solo lugar.
- Consolidar labels de roles.
- Eliminar constantes paralelas que dupliquen enums generados, si no tienen uso.

### Fase 3: resultados y errores

- Definir patron de resultados para listados, detalles, mutaciones y uploads.
- Mantener mensajes de usuario controlados.
- Agregar helpers de mapeo de errores sin ocultar razones utiles para UI.

### Fase 4: dashboard

- Crear un servicio agregador que obtenga perfil una sola vez.
- Compartir helpers de fecha/estado.
- Evaluar reducir consultas o mantener paralelismo con contexto compartido.

### Fase 5: documentacion

- Actualizar `README.md`.
- Limpiar docs con pendientes ya resueltos.
- Crear snapshot de RLS/policies efectivas finales.
- No modificar `docs/development/ROADMAP.md` hasta una tarea explicita.

### Fase 6: Supabase/RLS y Storage

- Inventariar `security definer`, `grant execute`, RPCs y policies.
- Revisar grants globales frente a grants explicitos.
- Disenar limpieza segura de archivos huerfanos.
- Evaluar signed uploads o flujo directo a Storage para produccion.

### Fase 7: pruebas

- Agregar pruebas unitarias de validadores puros.
- Agregar pruebas de permisos puros (`canAccessDashboardRoute`, `hasPermission`).
- Preparar checklist manual por rol para cambios RLS/Storage.

## 6. Que NO conviene tocar por ahora

- No conviene reescribir la matriz de permisos: esta clara y funcionando.
- No conviene cambiar RLS ni policies sin una tarea dedicada y pruebas manuales por rol.
- No conviene introducir service role key para mejorar alta de usuarios en esta etapa.
- No conviene rehacer Storage: el modelo privado, signed URLs cortas y metadatos separados estan bien planteados.
- No conviene refactorizar de golpe solicitudes, pedidos, clientes, usuarios, archivos y dashboard a la vez.
- No conviene cambiar el flujo de conversion solicitud -> pedido sin pruebas especificas de archivos heredados, historial y restricciones unicas.
- No conviene sustituir validaciones manuales por una dependencia nueva sin una decision de proyecto.

## 7. Riesgos de refactorizacion

- **Storage y archivos heredados:** cualquier cambio en `archivos`, `file_path`, signed URLs o conversion puede romper descargas o visibilidad por rol.
- **RLS y funciones private:** cambios pequenos pueden abrir o cerrar filas inesperadamente para trabajadores.
- **Usuarios internos:** las guardas del ultimo admin activo son delicadas; requieren pruebas manuales.
- **Dashboard de trabajador:** debe seguir filtrando estrictamente a pedidos asignados.
- **Comentarios e historial:** no renderizar `metadata` cruda ni cambiar append-only sin decision.
- **Public request:** el formulario publico no debe ganar lecturas publicas ni aceptar campos sensibles.
- **Server Actions:** toda action debe seguir validando permisos server-side aunque la UI o el proxy ya filtren.

## 8. Recomendacion final

El primer refactor pequeño y seguro deberia ser crear una capa minima de utilidades puras compartidas para `FormData`, query params, UUID y fechas. Es una mejora acotada, no toca RLS ni negocio, reduce repeticion visible y prepara el terreno para normalizar validadores sin cambiar comportamiento.

Despues de eso, la segunda tarea natural seria centralizar labels de estados/roles y actualizar documentacion desactualizada fuera de `ROADMAP.md`.
