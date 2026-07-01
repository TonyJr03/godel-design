# Reglas de arquitectura

## Stack

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS.
- Supabase Auth.
- Supabase PostgreSQL.
- Supabase Storage.

## Principios

- Claridad antes que complejidad.
- Separacion de responsabilidades.
- Seguridad desde el inicio.
- Escalabilidad razonable.
- Archivos privados por defecto.
- Trazabilidad basica.
- Server-side por defecto para datos, permisos y mutaciones.
- RLS y RPCs criticas como defensa efectiva, no como detalle opcional.

## Decision de capas Beta 2.1

`src/lib` queda adoptado oficialmente como capa de servicios de dominio y logica server-side de aplicacion.

No se crea `src/services` por ahora. El problema actual no es el nombre de la carpeta, sino la claridad de responsabilidades. Mover la logica existente a `src/services` generaria churn mecanico, riesgo de imports rotos y criterios duplicados para decidir donde vive cada pieza. La mejora correcta es formalizar la organizacion interna de `src/lib/<dominio>` y extraer helpers solo cuando reduzcan complejidad real.

## Capas del proyecto

### `src/app`

Responsabilidades:

- Definir rutas App Router, layouts, pages y route handlers.
- Usar Server Components por defecto para cargar datos server-side.
- Componer UI a partir de componentes y DTOs seguros.
- Contener Server Actions finas, cercanas a la ruta que las usa.
- Leer `FormData`, invocar servicios de `src/lib`, devolver estado de UI y ejecutar `revalidatePath` despues de mutaciones.
- Resolver `notFound`, redirecciones y estados de pantalla cuando correspondan.

No debe:

- Contener logica de negocio compleja.
- Duplicar validaciones complejas ya existentes en `src/lib`, RPCs o base de datos.
- Decidir reglas criticas de permisos, transiciones, pagos, conversiones o archivos por si sola.
- Consultar Supabase desde Client Components.
- Hacer escrituras directas a tablas cuando ya existe un servicio o RPC para ese flujo.

### `src/components`

Responsabilidades:

- Renderizar UI, formularios, tablas, estados visuales y controles de interaccion.
- Organizar componentes comunes y componentes por dominio.
- Mostrar datos ya preparados por Server Components o servicios.
- Sincronizar filtros visuales con la URL cuando aplique, sin convertir la UI en autoridad de consulta.
- Mostrar errores, advertencias y estados de exito controlados.

No debe:

- Consultar Supabase directamente.
- Conocer ni exponer `file_path`, rutas privadas, buckets internos o metadata sensible.
- Implementar reglas criticas de permisos, transacciones, pagos, estados o conversiones.
- Aceptar campos tecnicos como fuente de verdad cuando el servidor puede derivarlos.
- Renderizar metadata cruda, JSON tecnico o mensajes internos de base de datos.

### `src/lib`

Responsabilidades:

- Ser la capa de servicios de dominio y logica server-side de aplicacion.
- Centralizar validaciones server-side, permisos, consultas, mutaciones, mappers, labels, wrappers de RPC y DTOs seguros.
- Integrar Supabase server-side mediante los clientes definidos en `src/lib/supabase`.
- Validar perfil interno activo y permisos antes de operaciones internas.
- Delegar operaciones transaccionales o reglas criticas en RPCs y dejar RLS como defensa final.
- Devolver `ServiceResult`, DTOs controlados o errores seguros, sin filtrar detalles sensibles.
- Mantener helpers transversales reutilizables cuando reduzcan duplicacion real.

Decision vigente:

- `src/lib` es la capa de servicios de dominio.
- No se crea `src/services` sin una decision formal futura.
- No se hacen movimientos esteticos de archivos por preferencia de nombre.

### `src/types`

Responsabilidades:

- Contener tipos generados/base de Supabase.
- Usar `src/types/database.types.ts` como salida generada desde Supabase CLI.
- No editar manualmente `src/types/database.types.ts`.
- Exponer helpers generados a traves de `src/types/database.ts`, como
  `Tables`, `Enums`, `TablesInsert` y `TablesUpdate`.
- Complementar, no reemplazar, los DTOs seguros que viven cerca de cada dominio en `src/lib`.
- Evitar aliases por dominio en `src/types` cuando no haya uso compartido real.

No debe:

- Editar manualmente `src/types/database.types.ts` salvo necesidad puntual documentada.
- Inventar tipos que contradigan migraciones, enums, RPCs o RLS.
- Usarse como sustituto de validaciones runtime en servidor o base de datos.

DTOs, inputs y contratos internos deben vivir en `src/lib/<dominio>/types.ts`
o en archivos `*-types.ts` del dominio cuando el subflujo sea suficientemente
grande. En dominios extensos como Pedidos, usar `*-types.ts` por subflujo es
valido y preferible a concentrar todos los tipos en un `types.ts` gigante.

### `tests/e2e`

Responsabilidades:

- Cubrir smoke tests, QA visual/funcional y flujos criticos por rol.
- Validar rutas publicas, login, permisos, pedidos, solicitudes, storage y tracking cuando aplique.
- Usar credenciales y URLs desde variables locales de entorno, nunca hardcodeadas.
- Preferir specs por dominio para diagnostico rapido y reservar recorridos full QA como aceptacion de cierre.
- Usar fechas futuras dinamicas en pruebas y datos semilla.

No debe:

- Depender de credenciales reales escritas en el repositorio.
- Convertirse en la unica defensa de seguridad.
- Bloquear refactors seguros por estar demasiado concentrado en un unico spec serial.

## Convencion para `src/lib/<dominio>`

Estructura objetivo cuando el dominio lo necesite:

```text
src/lib/<dominio>/
  index.ts
  types.ts
  validation.ts
  labels.ts
  mappers.ts
  queries.ts
  mutations.ts
  rpc.ts
  errors.ts
```

Reglas de uso:

- No se crean archivos vacios solo para cumplir una plantilla.
- No todos los dominios necesitan todos los archivos.
- Extrae una pieza solo si reduce complejidad, duplicacion o riesgo.
- `index.ts` expone la API publica del dominio cuando mejore los imports.
- `types.ts` define DTOs, inputs y estados propios del dominio.
- `validation.ts` normaliza y valida input server-side.
- `labels.ts` traduce valores tecnicos a textos visibles.
- `mappers.ts` transforma filas de base de datos en DTOs seguros.
- `queries.ts` agrupa lecturas complejas y loaders server-side.
- `mutations.ts` agrupa escrituras simples o coordinacion no transaccional.
- `rpc.ts` centraliza llamadas RPC repetidas, tipos de cliente y mapeo de errores.
- `errors.ts` concentra errores seguros cuando el dominio tenga suficientes casos.

Las reglas criticas de negocio, transacciones, transiciones de estado, pagos, conversiones y conteos sensibles deben vivir en RPCs o en la base de datos cuando corresponda. TypeScript puede validar antes para mejorar UX, pero no reemplaza RPCs ni RLS.

## Server Actions

Las Server Actions son adaptadores finos entre formularios y servicios.

Debe:

- Leer solo los campos editables desde `FormData`.
- Recibir identificadores enlazados desde Server Components cuando el flujo ya valido el recurso.
- Llamar servicios de `src/lib` para autorizacion, validacion y mutacion.
- Devolver estados de UI simples y mensajes seguros.
- Ejecutar `revalidatePath` para las rutas afectadas despues de mutar.
- Mantenerse cerca de la ruta que las consume.

No debe:

- Contener logica de negocio pesada.
- Decidir permisos criticos sin apoyo de servicios, RPCs o RLS.
- Escribir tablas directamente cuando exista servicio o RPC del dominio.
- Aceptar campos tecnicos como `status`, `author_id`, `bucket`, `file_path`, `created_by` o importes derivados si el servidor debe controlarlos.
- Exponer errores internos de Supabase o de Postgres al usuario.

## Servicios de dominio

Los servicios en `src/lib/<dominio>` deben:

- Validar usuario, perfil activo y permisos internos.
- Validar y normalizar input con helpers compartidos cuando existan.
- Usar el cliente server-side normal de Supabase.
- Respetar RLS como defensa final.
- Delegar operaciones criticas en RPCs cuando haya transaccion, bloqueo, transicion de estado o regla multi-tabla.
- Mapear filas a DTOs seguros antes de llegar a componentes.
- Devolver `ServiceResult` o contratos controlados equivalentes.
- Evitar filtrar rutas privadas, metadata cruda, errores SQL o datos tecnicos no necesarios.

Los servicios no deben usar `service_role`, `SUPABASE_SERVICE_ROLE_KEY` ni consultar `auth.users` desde la aplicacion.

## RPC, RLS y base de datos

- Las operaciones transaccionales criticas viven en RPCs.
- Las RPCs deben repetir validaciones de permisos, estado y consistencia cuando actuen como autoridad.
- RLS es la ultima linea de defensa para lecturas y escrituras.
- Las validaciones TypeScript mejoran UX y mensajes, pero no sustituyen RLS ni constraints.
- Los wrappers `rpc.ts` por dominio deben centralizar casts, tipos y errores cuando haya repeticion real.
- Todo cambio de tablas, enums, constraints, triggers, policies, grants o RPCs debe ir en una migracion nueva, salvo instruccion explicita en contrario.
- Cuando cambien permisos o datos persistidos, actualiza en la misma tarea SQL, tipos generados y documentacion aplicable.

## Seguridad

- No uses `service_role` ni `SUPABASE_SERVICE_ROLE_KEY` en la app.
- No consultes `auth.users` desde codigo de aplicacion.
- No consultes Supabase desde Client Components.
- No expongas `file_path`, buckets privados, rutas internas, metadata cruda ni URLs permanentes en la UI publica o cliente.
- Usa route handlers y signed URLs de corta duracion para descargas privadas.
- Los componentes cliente pueden manejar interaccion, pero no ser autoridad de permisos, datos ni seguridad.
- Las reglas de permisos en UI son ayuda de UX; la proteccion real vive en servidor, RPCs, RLS y policies de Storage.

## Tests y QA

- Ejecuta smoke tests rapidos para cambios pequeños cuando aplique.
- Divide e2e por dominio si un flujo crece demasiado.
- Mantiene full visual QA como recorrido de aceptacion o cierre de release.
- Usa fechas futuras dinamicas para evitar fallos por paso del tiempo.
- Usa credenciales por variables locales, nunca hardcodeadas.
- Verifica por rol cuando el cambio toque permisos, RLS, dashboard o rutas protegidas.
- Para cambios documentales puros, ejecuta las auditorias de seguridad y verificacion definidas en `QA_AND_REPORTING.md`.

## Que no hacer

- No crear `src/services` sin una decision formal futura.
- No mover archivos por estetica o preferencia de nombre.
- No mezclar refactors de arquitectura con funcionalidades nuevas.
- No crear abstracciones vacias o archivos plantilla sin uso real.
- No duplicar validaciones complejas en UI, actions y servicios sin una razon de defensa en profundidad.
- No agregar dependencias sin justificacion tecnica.
- No implementar funcionalidades futuras fuera del alcance de la tarea.

## Dominios actuales del sistema

- Solicitudes.
- Pedidos.
- Clientes.
- Usuarios y perfiles.
- Permisos.
- Archivos privados.
- Comentarios.
- Historial.
- Tareas de pedido.
- Plantillas de tareas.
- Tracking publico.
- Pagos de pedidos.

## Documentos funcionales relacionados

- `docs/PUBLIC_REQUEST_FLOW.md`
- `docs/INTERNAL_REQUESTS_FLOW.md`
- `docs/CLIENTS_FLOW.md`
- `docs/ORDERS_FLOW.md`
- `docs/ORDER_ASSIGNMENTS_FLOW.md`
- `docs/COMMENTS_AND_HISTORY_MODEL.md`
- `docs/USERS_MANAGEMENT_MODEL.md`
- `docs/DASHBOARD_OPERATIVE_MODEL.md`
