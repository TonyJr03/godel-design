# PPO-00.4A - Auditoria formal y diseno objetivo de la suite E2E

## 1. Proposito

Este documento audita la suite Playwright actual de Godel Diseno y define el
diseno objetivo para consolidarla durante PPO-00.4B a PPO-00.4E. No reorganiza,
elimina ni modifica tests. La fuente de verdad es el codigo actual; la
documentacion historica se usa solo como contexto de decisiones previas.

## 2. SHA auditado

- Rama: `preprod/ppo-00-baseline`.
- SHA: `f80ee5b`.
- Commit: `test: estabilizar bootstrap local de perfiles QA`.
- Estado inicial: arbol limpio antes de la auditoria.

## 3. Fecha

2026-08-01.

## 4. Metodologia

Se revisaron `AGENTS.md`, `package.json`, `playwright.config.ts`,
`tests/e2e/`, `tests/e2e/helpers/`, reglas de QA, reglas de seguridad,
checklist pre-commit, guia local de Auth y documentos archivados relacionados
con cierre Beta, QA consolidado, estabilizacion E2E, UI/UX final y deuda de
pruebas.

Tambien se ejecuto el inventario real con:

- `rg --files tests/e2e`
- `npx.cmd playwright test --list --project=chromium`
- `npm.cmd run qa:bootstrap`
- `npx.cmd playwright test --project=chromium --workers=1 --reporter=line`

No se copiaron secretos, correos QA completos, UUID, tokens ni rutas locales
absolutas.

Terminologia usada para interpretar la ejecucion:

- Skip branch: llamada o condicion estatica a `test.skip()` presente en el
  codigo. Un mismo test puede contener varias ramas de skip.
- Skipped test: test que Playwright reporto efectivamente como `skipped` durante
  una corrida.
- Did not run: test que no comenzo su ejecucion, por ejemplo porque fallo antes
  un test dentro de un bloque serial. No se cuenta como skip.

## 5. Inventario de specs

La suite actual contiene 15 specs y 108 tests Chromium listados.

| Spec | Tests | Responsabilidad declarada | Responsabilidades reales | Rutas principales | Roles | Datos/archivos | Supabase directo | Ejecucion y condiciones | Recomendacion |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| `smoke.spec.ts` | 6 | Smoke publico e interno minimo | Carga rutas publicas, login, redirect interno y estados 404/denegado | `/solicitud`, `/estado`, `/login`, `/acceso-denegado`, `/sin-permisos` | admin | No crea datos; no sube archivos | No | Sin `serial`; puede omitir login si faltan credenciales via helper | Conservar como smoke, reducirlo a gate rapido |
| `public-tracking.spec.ts` | 1 | Tracking publico negativo | Rechaza referencias invalidas y evita fuga tecnica | `/estado` | ninguno | No crea datos | No | Sin `serial`; sin skips | Conservar; ampliar con fixture valido en tarea futura |
| `public-solicitud.spec.ts` | 7 | Solicitud publica | Catalogo dinamico, encargo, impresion, uploads, servicios ocultos, manipulacion de workflow y usuario autenticado en ruta publica | `/solicitud` | admin | Crea servicios/solicitudes; sube PDF sintetico | No directo; usa UI y auth helper | `serial`; depende de servicios disponibles y deja datos QA | Dividir parcialmente: flujo publico baseline y manipulacion/availability en seguridad |
| `dashboard.spec.ts` | 10 | Dashboard por rol | Conteos, tarjetas, actividad, accesos, rutas protegidas y estados internos | `/dashboard/*`, `/acceso-denegado` | admin, supervisor, trabajador | Consulta datos existentes; no sube archivos | Si, via helper cliente anon/auth | `serial`; puede omitir un test si no hay perfil trabajador activo; tests posteriores pueden quedar did not run por serial | Conservar, separando seguridad por rol si crece |
| `dashboard-shell.spec.ts` | 4 | Shell interno | Sidebar desktop/mobile, persistencia, visibilidad por rol y convivencia con workspace | `/dashboard`, `/dashboard/pedidos`, `/dashboard/solicitudes` | admin, trabajador | No crea datos | No | `serial`; puede omitir el test de workspace si no existe pedido visible; tests posteriores pueden quedar did not run por serial | Conservar como shell/responsive; evitar depender del primer pedido |
| `clientes.spec.ts` | 8 | Clientes | Listado, busqueda, detalle, formulario, paginacion, responsive y permisos | `/dashboard/clientes` | admin, supervisor, trabajador | Crea cliente por UI; deja cliente QA | No | `serial`; contiene condiciones de skip por volumen, ausencia de datos o setup focal; tests posteriores pueden quedar did not run por serial | Dividir: baseline CRUD/listado y volumen paginado |
| `usuarios.spec.ts` | 6 | Usuarios | Listado, formulario actual, filtros, paginacion y permisos | `/dashboard/configuracion/usuarios` | admin, supervisor, trabajador | No debe crear Auth real; usa datos QA existentes | No | Sin `serial`; cuatro tests baseline ejecutables con roles QA base; dos tests condicionados a al menos 51 usuarios; esos dos tests contienen cuatro ramas estaticas de `test.skip()`; la ejecucion focal validada produjo 4 passed y 2 skipped | Conservar para listado/formulario; mover volumen fuera del baseline |
| `configuracion-servicios.spec.ts` | 6 | Servicios configurables | Acceso por rol, validaciones, crear/editar/ocultar, filtros, mobile/desktop | `/dashboard/configuracion/servicios` | admin, supervisor, trabajador | Crea servicio QA; no sube archivos | No | `serial`; sin skips; deja servicio QA | Conservar, con cleanup controlado |
| `task-templates.spec.ts` | 6 | Plantillas de tareas | CRUD plantilla, permisos, paginacion, aplicacion en pedido y selector asincrono | `/dashboard/configuracion/plantillas`, `/dashboard/pedidos` | admin, supervisor, trabajador | Crea plantillas y pedidos QA | No directo | `serial`; contiene condiciones de skip por volumen/busqueda; deja datos QA; tests posteriores pueden quedar did not run por serial | Dividir: plantillas CRUD y aplicacion a pedidos |
| `solicitudes-internas.spec.ts` | 12 | Solicitudes internas | Asociacion/creacion de cliente, conversion, comentarios, historial, files, paginacion, responsive y permisos | `/solicitud`, `/dashboard/solicitudes`, `/dashboard/clientes` | admin, supervisor, trabajador | Crea clientes, solicitudes, pedidos y archivos | Si, queries e inserts | `serial`; contiene condiciones de skip por servicios publicos y volumen; tests posteriores pueden quedar did not run por serial | Dividir por dominio; mover volumen a suite dedicada |
| `pedidos.spec.ts` | 17 | Pedidos | Creacion manual, selectores, asignaciones, estados, tareas, pagos, comentarios, historial, archivos, permisos, responsive y paginacion | `/dashboard/pedidos`, `/dashboard/pedidos/nuevo`, `/solicitud`, `/dashboard/clientes` | admin, supervisor, trabajador | Crea clientes, solicitudes, pedidos, pagos, tareas, comentarios y archivos | Si, queries/updates de servicios | `serial`; contiene condiciones de skip por setup focal, relaciones o volumen; tests posteriores pueden quedar did not run por serial | Dividir de forma prioritaria en specs por flujo |
| `pedido-edit.spec.ts` | 4 | Edicion de pedido | Edicion, historial saneado, permisos de supervisor/trabajador y reglas de pedido cerrado | `/dashboard/pedidos` | admin, supervisor, trabajador | Crea pedido y depende de asignacion | Si, queries directas | `serial`; puede omitir tests si el setup admin no crea pedido o no asigna trabajador; tests posteriores pueden quedar did not run por serial | Fusionar parcialmente con pedidos-edicion baseline, manteniendo diagnostico focal |
| `storage.spec.ts` | 6 | Storage y descargas seguras | Paneles de archivos, upload permitido, rechazo publico, rutas download invalidas y tracking sin superficie Storage | `/solicitud`, `/estado`, rutas download internas invalidas | admin, trabajador | Sube PNG/PDF sinteticos | Si, fixture finder | Sin `serial`; puede omitir el panel si no hay entidad con archivo | Conservar como seguridad/storage; agregar fixture propio |
| `internal-listings.spec.ts` | 14 | Contratos visuales de listados internos | Densidad, responsive, filtros, focus, IDs, chips, overflow y spinners | `/dashboard/pedidos` | admin | No crea datos | Si, via datos/estado visible | Sin `serial`; sin skips; depende de listados con tablas | Mover a release/visual focal; reducir fragilidad por estado |
| `full-visual-qa.spec.ts` | 1 | Aceptacion visual integral | Recorrido transversal publico, dashboard, solicitudes, pedidos, archivos, tabs, comentarios y roles | `/solicitud`, `/estado`, `/dashboard/*` | admin, supervisor, trabajador | Crea solicitudes, pedidos, comentarios, archivos | Si | `serial`; sin skips; muy amplio y lento | Mover a release; mantener como aceptacion, no baseline diaria |

## 6. Inventario de helpers

| Helper | Responsabilidad | Consumidores | Auth | Cliente Supabase | Muta datos | Env | Duplicacion observada | Accion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `auth.ts` | Login por rol QA desde variables locales | Casi todos los specs autenticados | Si | No | No | Si | Login/logout repetidos en flujos largos | Conservar helper actual, centralizar login/logout y no introducir todavia estado autenticado compartido; evaluar `storageState` en PPO-00.4D despues de medir duracion y aislamiento |
| `supabase.ts` | Crear clientes Supabase anon/auth y saltar si faltan credenciales | Dashboard, pedidos, pedido-edit, solicitudes, storage | Si indirecta | Si | No por si mismo | Si | Queries directas dispersas dentro de specs | Conservar; envolver factories/queries QA mas explicitas |
| `qa-data.ts` | `runId`, labels, emails sinteticos y queries improbables | Specs mutantes principales | No | No | No | No | Construccion de `runId` y labels repetida en specs | Conservar y ampliar con nombres/factories |
| `assertions.ts` | Assertions compartidas de accesibilidad, seguridad textual y overflow | Specs publicos, internos y de dominio | No | No | No | No | Checks de overflow, dialogos y ausencia de fuga repetidos | Conservar; dividir si crece hacia UI/security |
| `date.ts` | Fechas relativas deterministas | Pedidos, solicitudes, plantillas, visual QA | No | No | No | No | Uso correcto, baja duplicacion | Conservar |

Duplicaciones prioritarias detectadas: login/logout de roles, apertura/cierre de
dialogos, seleccion del primer elemento visible, creacion de clientes,
creacion de solicitudes, creacion de pedidos, consulta de servicios, manejo de
paneles del workspace, paginacion, overflow, construccion de datos `runId`,
queries directas a Supabase y cleanup.

## 7. Resultado empirico de la suite

Bootstrap QA:

- `npm.cmd run qa:bootstrap`: OK.
- Confirmo entorno local y tres roles QA operativos.
- No se reportan valores de claves, contrasenas ni correos completos.

Suite completa:

- Comando: `npx.cmd playwright test --project=chromium --workers=1 --reporter=line`.
- Total listado: 108 tests.
- Resultado: 57 passed, 8 failed, 9 skipped, 34 did not run.
- Duracion: 13.8 minutos.
- Spec mas lento reportado: `full-visual-qa.spec.ts`, 7.0 minutos.
- Los 34 `did not run` son distintos de los 9 skipped efectivos: no comenzaron
  su ejecucion, principalmente por fallos anteriores en bloques seriales.

Fallos exactos observados:

1. `clientes.spec.ts:258`, en `clientes.spec.ts:166`: no encontro una tabla
   visible en el listado de clientes.
2. `dashboard-shell.spec.ts:88`, en `dashboard-shell.spec.ts:103`: locator por
   texto de administrador resolvio dos elementos visibles.
3. `dashboard.spec.ts:359`, en `dashboard.spec.ts:312`: heading de pedidos
   activos resolvio tanto texto accesible oculto como estado vacio visible.
4. `full-visual-qa.spec.ts:583`, en `full-visual-qa.spec.ts:599`: timeout al
   seleccionar tipo de servicio en solicitud publica.
5. `internal-listings.spec.ts:832`, en `internal-listings.spec.ts:287`: no
   encontro tabla visible.
6. `internal-listings.spec.ts:915`, en `internal-listings.spec.ts:676`: no
   encontro `table:visible`.
7. `internal-listings.spec.ts:927`, en `internal-listings.spec.ts:757`: no
   encontro `table:visible`.
8. `pedidos.spec.ts:2139`, en `pedidos.spec.ts:2572`: locator de asignacion
   resolvio nombre de usuario y badge de rol.

Observacion empirica: los fallos no justifican relajar assertions. Senalan
dependencias de estado, cambios de UI/listados, locators con ambiguedad
semantica y un flujo visual integral que ya no diagnostica con precision.

## 8. Mapa de cobertura funcional

| Area | Recorrido | Estado actual | Recomendacion |
| --- | --- | --- | --- |
| Acceso | Login valido | Completo en smoke y specs autenticados | Mantener en smoke |
| Acceso | Login invalido | Parcial | Agregar caso focal sin credenciales sensibles |
| Acceso | Proteccion de rutas | Completo/duplicado | Mantener una prueba smoke y otra seguridad |
| Acceso | Acceso por roles | Parcial/duplicado | Consolidar en seguridad focal |
| Acceso | Usuario inactivo | Sin cobertura clara | Nuevo spec seguridad/auth |
| Acceso | Cambio inicial de contrasena | Sin cobertura | Cubrir en lifecycle Auth |
| Usuarios | Listado y formulario | Parcial, ya focal | Mantener `usuarios.spec.ts` |
| Usuarios | Creacion Auth Admin real | Sin cobertura baseline | Nuevo `usuarios-auth-lifecycle.spec.ts` |
| Usuarios | Reset administrativo real | Sin cobertura | Nuevo lifecycle separado |
| Usuarios | Cleanup usuarios temporales | Sin cobertura | Tooling controlado PPO-00.4B |
| Solicitud publica | Encargo publico | Parcial; depende de catalogo | Garantizar/restaurar servicio canonico si aplica o crear servicio QA `encargo` |
| Solicitud publica | Impresion publica | Parcial; upload cubierto | Garantizar/restaurar el servicio canonico de impresion; nunca crear una segunda impresion |
| Solicitud publica | Archivo permitido | Parcial | Mantener con fixture propio |
| Solicitud publica | Archivo rechazado | Completo | Mantener en storage/security |
| Solicitud publica | Validaciones | Parcial | Expandir en baseline publico |
| Solicitud publica | Servicios disponibles | Condicionado por fixture | Seed/factory controlado |
| Solicitud publica | Manipulacion | Parcial | Mover a seguridad focal |
| Solicitud publica | Exito sin fuga tecnica | Parcial | Assertion compartida |
| Tracking publico | Codigo valido | Condicionado por full visual | Fixture valido dedicado |
| Tracking publico | Codigo invalido | Completo | Mantener |
| Tracking publico | Estado permitido visible | Parcial | Nuevo tracking positivo |
| Tracking publico | Sin UUID/Storage/pagos | Parcial | Seguridad focal |
| Operacion interna | Clientes | Parcial, falla sin tabla | Baseline con fixture propio |
| Operacion interna | Solicitudes | Amplio pero serial y mutante | Dividir por flujo |
| Operacion interna | Cliente desde solicitud | Parcial | Fixture/factory dedicado |
| Operacion interna | Conversion a pedido | Parcial | Baseline determinista |
| Operacion interna | Pedidos manuales | Amplio | Dividir encargo/impresion |
| Operacion interna | Edicion pedido | Parcial y separado | Mantener focal |
| Operacion interna | Estados | Parcial | Spec de workflow pedido |
| Operacion interna | Personal | Parcial, fallo por locator | Spec focal asignaciones |
| Operacion interna | Tareas | Parcial/duplicado | Pedidos tareas + plantillas separadas |
| Operacion interna | Plantillas | Parcial | Conservar con cleanup |
| Operacion interna | Pagos | Parcial | Spec focal pedidos-pagos |
| Operacion interna | Comentarios/historial | Parcial | Mantener en workflow, verificar inmutables |
| Operacion interna | Archivos/descarga | Parcial | Storage focal con fixture |
| Configuracion | Hub | Parcial | Smoke interno |
| Configuracion | Servicios | Completo pero deja datos | Cleanup |
| Configuracion | Plantillas | Parcial | Dividir de aplicacion en pedido |
| Configuracion | Usuarios | Parcial | Mantener UI/listado |
| Configuracion | Restricciones no-admin | Duplicado | Seguridad focal |
| Dashboard/shell | Dashboard por rol | Parcial; falla por estado vacio | Fixture o assertions por estado |
| Dashboard/shell | Navegacion/sidebar | Parcial; fallo locator | Mantener con locators semanticos |
| Dashboard/shell | Responsive/overflow | Amplio en release | Sacar del baseline salvo smoke |
| Dashboard/shell | Dialogos/workspace | Parcial | Spec workspace focal |
| Seguridad | RLS observable | Parcial indirecta | Seguridad focal por rol |
| Seguridad | Rutas no autorizadas | Completo/duplicado | Consolidar |
| Seguridad | Sin detalles tecnicos | Parcial | Assertion compartida |
| Seguridad | Sin rutas Storage publicas | Parcial | Storage/security |
| Seguridad | IDs invalidos rechazados | Parcial | Mantener |
| Seguridad | Sin descarga publica | Parcial | Mantener y ampliar |

## 9. Hallazgos

### Dependencia de datos preexistentes

- Varios specs abren el primer pedido, solicitud, cliente o tabla visible.
- Los tests de paginacion dependen de mas de 50 registros visibles.
- `storage.spec.ts` puede saltar si no encuentra entidad con fixture de archivo.
- `dashboard.spec.ts` depende de perfil trabajador activo y actividad existente.
- `full-visual-qa.spec.ts` depende de catalogo y flujos transversales vivos.

### Skips

Skips legitimos para suite de volumen:

- Paginacion de clientes, usuarios, solicitudes, pedidos y plantillas cuando no
  existen suficientes registros o paginas.

Skips por fixture ausente o setup no determinista:

- Pedido focal no creado, cliente focal no creado, trabajador no asignado,
  servicio publico no disponible y fixture Storage no localizado.

Skips por entorno/credenciales:

- Los helpers saltan si faltan credenciales QA locales. Es aceptable fuera de CI,
  pero el baseline debe fallar temprano con diagnostico claro cuando el entorno
  requerido no esta listo.

Objetivo futuro: baseline determinista con 0 failed y 0 skips accidentales. Los
tests de volumen deben moverse a un nivel deliberado antes de exigir ese
criterio.

### Cleanup y acumulacion

La suite acumula clientes, servicios, solicitudes, pedidos, tareas, plantillas,
pagos, comentarios, historial y objetos Storage. Los usuarios Auth temporales
todavia no tienen lifecycle E2E real.

Datos que el test podria eliminar por app/RLS:

- Servicios y plantillas QA si existe flujo soportado.
- Algunos pedidos/solicitudes solo si el dominio permite baja o estados
  reversibles.

Datos que requieren tooling local controlado:

- Usuarios Auth temporales.
- Perfiles asociados a usuarios QA temporales.
- Objetos Storage generados.
- Datos mutantes con relaciones profundas.

Datos que no deben borrarse:

- Seed canonico.
- Roles QA base.
- Servicios canonicos necesarios para flujos manuales.

Auditorias/historiales:

- No deben borrarse como si fueran entidades simples. Requieren prefijos QA,
  ownership claro y cleanup transaccional o reset de base limpia.

### Solapamientos

- Solicitud publica aparece en `public-solicitud`, `solicitudes-internas`,
  `pedidos`, `storage` y `full-visual-qa`.
- Conversion solicitud-pedido aparece en `solicitudes-internas`, `pedidos` y
  `full-visual-qa`.
- Pedidos mezcla creacion, permisos, asignacion, tareas, pagos, archivos,
  responsive y paginacion.
- Configuracion de servicios afecta `public-solicitud`, `pedidos`,
  `solicitudes-internas` y `configuracion-servicios`.
- Shell/responsive aparece en `dashboard-shell`, `internal-listings`,
  `pedidos`, `solicitudes-internas` y `full-visual-qa`.
- Seguridad de ausencia de fugas esta repetida entre `assertions.ts`, specs
  publicos, storage y full visual.

### Specs demasiado amplios

`pedidos.spec.ts`, `solicitudes-internas.spec.ts`, `task-templates.spec.ts` y
`full-visual-qa.spec.ts` mezclan contrato visual, CRUD, permisos, responsive,
base de datos y aceptacion de release. El problema no es solo tamano: cuando
fallan, el diagnostico queda poco localizado y los tests posteriores de bloques
seriales pueden quedar sin ejecutar.

## 10. Riesgos

- Convertir la suite completa actual en gate inmediato bloquearia PPO por
  dependencias de datos no deterministas.
- Relajar locators o assertions ocultaria regresiones reales de accesibilidad.
- Reorganizar carpetas antes de estabilizar fixtures produciria churn sin
  mejorar diagnostico.
- Hacer cleanup con privilegios amplios podria violar reglas de seguridad.
- Mantener tests de volumen dentro del baseline generaria skips permanentes.
- Depender de `full-visual-qa.spec.ts` como prueba principal desplaza fallos de
  dominio a una aceptacion lenta y dificil de depurar.

## 11. Deuda tecnica

Se confirman deudas historicas ya registradas: paralelismo E2E no estable,
usuarios QA compartidos, datos QA persistentes, fixtures parciales de Storage,
tracking positivo sin referencia estable y full visual QA grande.

Deuda nueva o revalidada en PPO:

- Locators con nombres ambiguos ante texto duplicado de UI.
- Listados que esperan tablas cuando la UI puede renderizar estados vacios o
  tarjetas responsive.
- Falta de factories deterministas para entidades de dominio.
- Falta de cleanup verificable por prefijo de corrida.
- Skips de volumen mezclados con specs baseline.

## 12. Matriz conservar/dividir/fusionar/retirar

| Spec actual | Accion objetivo | Nivel objetivo |
| --- | --- | --- |
| `smoke.spec.ts` | Conservar y ajustar a recorrido minimo | Smoke |
| `public-tracking.spec.ts` | Conservar y ampliar con positivo | Baseline/seguridad |
| `public-solicitud.spec.ts` | Dividir parcialmente | Baseline publico + seguridad |
| `dashboard.spec.ts` | Conservar con fixtures de conteos | Baseline |
| `dashboard-shell.spec.ts` | Conservar como shell focal | Baseline/release |
| `clientes.spec.ts` | Dividir CRUD/listado y volumen | Baseline + volumen |
| `usuarios.spec.ts` | Conservar para listado/formulario | Baseline |
| `configuracion-servicios.spec.ts` | Conservar con cleanup | Baseline |
| `task-templates.spec.ts` | Dividir CRUD plantilla y aplicacion | Baseline |
| `solicitudes-internas.spec.ts` | Dividir por flujo | Baseline + release + volumen |
| `pedidos.spec.ts` | Dividir prioritariamente | Baseline + seguridad + volumen |
| `pedido-edit.spec.ts` | Fusionar parcialmente con edicion focal | Baseline |
| `storage.spec.ts` | Conservar y endurecer fixture | Seguridad/baseline |
| `internal-listings.spec.ts` | Reducir y mover a release/visual | Release |
| `full-visual-qa.spec.ts` | Mover a release; no retirar aun | Release |

Candidatos a retirar por obsoleto: ninguno todavia. Algunos tests podran
retirarse solo despues de que specs nuevos cubran el mismo contrato con fixtures
propios.

Specs nuevos recomendados:

- `usuarios-auth-lifecycle.spec.ts`: creacion Auth real, primer acceso, cambio
  inicial de contrasena, reset administrativo, baja/cleanup y verificacion de
  que no quedan intentos pendientes.
- `public-tracking-positive.spec.ts`: referencia valida sin fuga de UUID,
  Storage, pagos ni metadatos internos.
- `pedidos-workflow.spec.ts`: estados, asignacion, tareas y pagos con pedido
  factory.
- `pedidos-files-security.spec.ts`: uploads y descargas seguras de pedido.
- `solicitudes-conversion.spec.ts`: solicitud a pedido con cliente existente y
  cliente nuevo.
- `volume-pagination.spec.ts`: pruebas de mas de 50 registros fuera del baseline.
- `security-routes-roles.spec.ts`: matriz minima de rutas y permisos por rol.

## 13. Estructura objetivo

Opcion A: mantener todos los specs en `tests/e2e/`.

Ventajas:

- Menor churn en imports y comandos.
- Mantiene continuidad con reportes actuales.
- Suficiente para 15 specs si los nombres y helpers se limpian.
- Reduce riesgo de reorganizacion estetica antes de estabilizar datos.

Desventajas:

- La separacion por nivel depende de nombres/scripts.
- Puede crecer desordenado si release, security y volume aumentan.

Opcion B: agrupar en subdirectorios `public/`, `internal/`, `security/`,
`release/`, `volume/` y `helpers/`.

Ventajas:

- Comunica nivel y dominio desde la ruta.
- Facilita comandos por carpeta.
- Escala mejor si la suite duplica tamano.

Desventajas:

- Requiere actualizar imports y posiblemente reportes/documentacion.
- Puede producir mucho diff sin mejorar estabilidad inmediata.
- Si se hace antes de fixtures, solo cambia la forma del problema.

Recomendacion: mantener Opcion A durante PPO-00.4B y PPO-00.4C, con nombres
mas claros y tags/niveles por script. Introducir subdirectorios solo si al
terminar la consolidacion hay volumen real suficiente; empezar como maximo por
`release/` y `volume/`, porque esos niveles si tienen comportamiento operativo
diferente.

## 14. Estrategia de fixtures

- Definir factories E2E locales para cliente, servicio requerido por flujo,
  solicitud, pedido encargo, pedido impresion, plantilla, tarea, pago,
  comentario y objeto Storage.
- Usar prefijos QA y `runId` para ownership, sin correos reales.
- Mantener inicialmente login controlado por helper. Evaluar `storageState` por
  rol en PPO-00.4D despues de medir duracion y aislamiento.
- Mantener los tres roles QA base como bootstrap idempotente.
- No usar `SUPABASE_SERVICE_ROLE_KEY` ni ampliar grants para hacer pasar tests.
- Las queries directas deben vivir en helpers/factories auditables, no repetidas
  dentro de specs.
- El fixture de volumen debe ser deliberado y separado del baseline.

### Servicios

Servicios canonicos:

- `Impresion` y `Otro` pertenecen a la baseline.
- No deben eliminarse durante cleanup.
- Las pruebas que cambien disponibilidad o datos mutables deben registrar y
  restaurar el estado anterior.
- Ninguna factory debe crear otro servicio con `workflow_type = impresion`.
- La base solo admite un servicio de impresion.

Servicios QA dinamicos:

- Solo se crearan servicios configurables de tipo `encargo`.
- Deben usar nombre con prefijo y `runId`.
- Deben registrar ownership de corrida.
- Su cleanup se hara unicamente cuando no existan relaciones dependientes.
- Nunca deben confundirse con los servicios canonicos.

Una factory de servicio para flujos publicos puede garantizar/restaurar un
servicio canonico cuando el flujo lo requiera, o crear un servicio QA `encargo`.
Nunca debe crear una segunda impresion.

### Frontera de secretos

- Los specs y factories normales no reciben `SUPABASE_SECRET_KEY`.
- No se crea un cliente administrativo dentro de un spec.
- Las mutaciones normales usan UI, RPC productivas o clientes autenticados
  conforme a RLS.
- Tooling local separado puede usar `SUPABASE_SECRET_KEY` unicamente para crear
  o eliminar identidades Auth temporales.
- El cleanup relacional profundo puede utilizar PostgreSQL local guardado,
  siguiendo el modelo de seguridad local del bootstrap QA.
- No se amplian grants.
- No se utiliza `service_role` como acceso general a tablas.
- El seed, los tres roles QA base y los servicios canonicos quedan protegidos
  mediante allowlist.

## 15. Estrategia de cleanup

- Cleanup por prefijo QA y corrida, con allowlist de entidades borrables.
- Verificacion posterior: cero clientes/solicitudes/pedidos/plantillas/objetos
  Storage temporales de la corrida, salvo auditorias/historiales que requieran
  reset.
- Usuarios Auth temporales solo mediante tooling local explicito disenado en
  PPO-00.4B; nunca desde cliente admin improvisado dentro de un spec.
- Specs y factories normales no reciben `SUPABASE_SECRET_KEY`; si el tooling
  local necesita crear o eliminar identidades Auth temporales, debe hacerlo
  separado de la suite normal y sin imprimir secretos.
- El cleanup relacional profundo puede usar PostgreSQL local guardado, con
  guardas estrictas, prefijos QA, allowlist y proteccion del seed.
- Para historiales inmutables, preferir reset limpio de Supabase o ownership de
  corrida en datos padre, no borrado manual inseguro.
- El seed canonico, los tres roles QA base y los servicios canonicos no se
  eliminan.

## 16. Niveles de ejecucion

Focal:

- Un spec o test durante desarrollo.
- Puede ejecutarse con `npx.cmd playwright test <spec> --project=chromium`.

Smoke:

- Confirma app disponible, login, dashboard, solicitud publica basica y una
  operacion interna esencial.
- Debe ser corto y de diagnostico inmediato.

Baseline:

- Suite determinista desde base limpia.
- Serial mientras existan mutaciones compartidas.
- 0 failed y 0 skipped accidentales.
- Fixtures propios y cleanup controlado.

Release:

- Recorrido amplio, visual integrado, responsive y screenshots cuando aplique.
- Acepta mayor duracion, pero debe diagnosticar fallos por dominio cuando sea
  posible.

Volumen:

- Paginacion y busqueda con mas de 50 registros.
- No crea decenas de registros en cada baseline.
- Se ejecuta deliberadamente despues de seed/factory de volumen.

Seguridad focal:

- Rutas, permisos por rol, Storage, IDs invalidos y ausencia de fugas tecnicas.

## 17. Scripts propuestos

No implementados en esta tarea:

- `test:e2e:focal`
- `test:e2e:smoke`
- `test:e2e:baseline`
- `test:e2e:release`
- `test:e2e:volume`
- `test:e2e:security`
- `qa:e2e:reset-baseline`
- `qa:e2e:cleanup`

Los scripts deben mapear a specs/tags concretos despues de PPO-00.4B y
PPO-00.4C, no antes.

## 18. Plan PPO-00.4B-E

### PPO-00.4B - Fixtures, factories y cleanup

- Objetivo: crear infraestructura determinista para datos E2E locales.
- Archivos previstos: helpers E2E, posible tooling QA local y documentacion
  focal.
- Riesgos: privilegios excesivos, borrado de seed, leakage de credenciales.
- Criterios: bootstrap roles OK, factories crean datos por prefijo, cleanup
  verifica residuos, sin secretos impresos.
- Orden: diseno de prefijos, factories minimas, cleanup, smoke de factories.
- Dependencias: Supabase local canonicamente configurado y roles QA.
- No modificar: RLS, grants, migraciones, seed ni codigo productivo salvo
  aprobacion explicita.

### PPO-00.4C - Consolidacion de specs por dominio

- Objetivo: dividir specs amplios y eliminar duplicacion real de flujos.
- Archivos previstos: specs E2E y helpers creados en 4B.
- Riesgos: perder cobertura historica, introducir skips nuevos, relajar
  assertions.
- Criterios: baseline con responsabilidades claras, volumen separado, sin specs
  gigantes nuevos.
- Orden: pedidos, solicitudes, usuarios Auth lifecycle, storage/tracking,
  dashboard/shell.
- Dependencias: factories y cleanup de 4B.
- No modificar: reglas de negocio, UI productiva o seguridad para satisfacer
  tests.

### PPO-00.4D - Scripts y niveles de ejecucion

- Objetivo: formalizar comandos por nivel.
- Archivos previstos: `package.json`, posible configuracion Playwright y docs.
- Riesgos: comandos que no reflejen el nivel real, CI lento o no determinista.
- Criterios: focal/smoke/baseline/release/volume/security ejecutables y
  documentados.
- Orden: tags o convencion de nombres, scripts, documentacion, validacion.
- Dependencias: specs consolidados de 4C.
- No modificar: dependencias ni puertos.

### PPO-00.4E - Reset limpio y validacion integral

- Objetivo: probar baseline desde Supabase limpio.
- Archivos previstos: reporte de validacion y ajustes menores aprobados.
- Riesgos: diferencias ambientales Windows/Docker, seed incompleto, flakiness.
- Criterios: `qa:bootstrap` OK, baseline 0 failed/0 skipped accidentales,
  release reportada, cleanup verificado.
- Orden: reset, bootstrap, baseline, security, release, volumen deliberado.
- Dependencias: 4B, 4C y 4D.
- No modificar: seguridad o datos canonicos para ocultar fallos.

## 19. Criterios de baseline E2E consolidada

- Ejecutable desde base limpia con puertos canonicos.
- `qa:bootstrap` idempotente y sin secretos en logs.
- Fixtures propios para cada dominio mutante.
- Cleanup verificable por corrida.
- Sin dependencia del primer registro visible.
- Sin dependencia de otros specs.
- Sin skips accidentales.
- Fallos localizados por dominio.
- Seguridad validada sin grants nuevos ni service role en tests de aplicacion.
- Reporte claro de passed, failed, skipped, duracion y residuos.

## 20. Decisiones

Decisiones cerradas:

- La baseline consolidada debera terminar con 0 failed y 0 skips accidentales.
- Los tests de volumen se separaran antes de exigir ese criterio.
- Se permite disenar tooling de cleanup exclusivamente local y con guardas
  estrictas.
- `full-visual-qa.spec.ts` se mantiene inicialmente como aceptacion release; su
  division se reconsiderara despues de estabilizar fixtures.
- La estructura seguira plana durante PPO-00.4B y PPO-00.4C.
- `storageState` queda aplazado a PPO-00.4D.

Decisiones pendientes reales:

- Volumen exacto por entidad para la suite `volume`.
- Frecuencia de ejecucion de los niveles `release` y `volume`.
- Necesidad real de subdirectorios despues de medir el tamano final y el coste
  de mantenimiento de la suite consolidada.
