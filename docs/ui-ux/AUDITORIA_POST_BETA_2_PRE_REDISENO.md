# Auditoria post-Beta 2 previa al rediseno UI/UX

## 1. Resumen ejecutivo

Esta auditoria revisa el estado actual del repositorio despues del cierre de
Beta 2 y prepara tres trabajos posteriores: reorganizar rutas con Route Groups,
incorporar una infraestructura local de iconos SVG y evolucionar los detalles
internos de solicitudes y pedidos hacia una experiencia de workspace operativo.

El repositorio se encuentra arquitectonicamente estable: `src/lib/<dominio>` es
la capa server-side de dominio, `src/app` contiene rutas y Server Actions finas,
los componentes no consultan Supabase directamente, Storage permanece privado y
la proteccion real combina proxy, servicios, permisos, RLS, RPCs y policies de
Storage. Esta auditoria no detecta una razon para reescribir arquitectura ni
para convertir pantallas completas en Client Components.

La recomendacion principal es ejecutar los trabajos futuros en tareas pequenas:
primero Route Groups estructurales, despues iconos, luego un prototipo de
workspace sobre un detalle de bajo riesgo, y solo entonces extender el patron.
El rediseño debe preservar URLs, contratos de formularios, Server Actions,
loaders, servicios, permisos, RLS, Storage y pruebas existentes.

## 2. Estado del repositorio auditado

| Dato | Valor |
| --- | --- |
| Rama | `uiux/pre-redesign-foundation` |
| Commit corto | `91b9827` |
| Commit completo | `91b9827e9533e4a8111880daedc0b58114509e74` |
| Estado inicial de Git | Limpio antes de crear este documento |
| Next.js | `16.2.6` |
| React | `19.2.4` |
| Tailwind CSS | v4 mediante `@tailwindcss/postcss` |
| Supabase | `@supabase/ssr`, `@supabase/supabase-js` |
| Iconos | No existe dependencia de iconos ni catalogo SVG local |

## 3. Metodologia y limitaciones

Se revisaron los documentos permanentes de arquitectura, seguridad, base de
datos, QA, checklists, cierre Beta 2, deuda tecnica, Fase 14 UI/UX, modelo de
permisos, modelo de datos, flujo de pedidos y modelo de Storage.

Se inspecciono codigo real en:

- `src/app`, incluyendo pages, layouts, actions y route handlers.
- `src/components/ui`, `src/components/layout`, `src/components/common`.
- Componentes de solicitudes, pedidos, storage, tareas, comentarios, historial,
  asignaciones, pagos, clientes, usuarios, dashboard y configuracion.
- `src/app/globals.css`, `package.json`, `next.config.ts`,
  `postcss.config.mjs`, `src/proxy.ts`, `playwright.config.ts`, specs e2e y
  scripts de auditoria.
- Documentacion local de Next.js 16 sobre Route Groups, layouts, loading,
  error, not-found, route handlers, Parallel Routes e Intercepting Routes.

Limitaciones:

- No se ejecuto inspeccion visual autenticada nueva, porque esta tarea no cambia
  UI y no debia realizar escrituras ni recorridos mutantes. Se usa como
  antecedente la evidencia visual cerrada en Fase 14.
- La skill `ui-ux-pro-max` fue leida, pero `python`, `python3` y `py` fallaron
  en este entorno con "A specified logon session does not exist"; por tanto no
  se pudo ejecutar su buscador local.
- No se instalaron dependencias ni se modifico configuracion.
- No se ejecutaron suites e2e focales porque el alcance fue documental puro.

## 4. Inventario de rutas y pantallas

| URL | Archivo actual | Layout | Acceso | Dominio | Componentes principales | Spec focal | Clasificacion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | raiz | Publico | Home/tracking | `PublicHeader`, `PublicTrackingSearchForm` | `smoke.spec.ts`, full visual | Publica |
| `/solicitud` | `src/app/solicitud/page.tsx` | raiz | Publico | Solicitudes publicas | `PublicHeader`, `PublicSolicitudForm` | `public-solicitud.spec.ts` | Publica |
| `/solicitud` action | `src/app/solicitud/actions.ts` | n/a | Publico controlado | Solicitudes/Storage | `submitPublicSolicitudAction` | `public-solicitud.spec.ts`, `storage.spec.ts` | Publica |
| `/estado` | `src/app/estado/page.tsx` | raiz | Publico por `public_reference` | Tracking publico | `PublicTrackingSearchForm`, `PublicTrackingResultCard` | `public-tracking.spec.ts` | Publica |
| `/login` | `src/app/login/page.tsx` | raiz | Sin sesion, acceso interno | Auth | `PublicHeader`, `LoginForm` | `smoke.spec.ts`, `dashboard.spec.ts` | Interna |
| `/login` actions | `src/app/login/actions.ts` | n/a | Auth | Auth | `login`, `logout` | `smoke.spec.ts` | Interna |
| `/acceso-denegado` | `src/app/acceso-denegado/page.tsx` | raiz | Usuario sin perfil activo | Auth/permisos | `Alert`, `Card`, `LogoutButton` | `dashboard.spec.ts` | Transversal interna |
| `/sin-permisos` | `src/app/sin-permisos/page.tsx` | raiz | Perfil activo sin permiso | Permisos | `Alert`, `Card`, `LogoutButton` | `dashboard.spec.ts` | Transversal interna |
| `/*` 404 | `src/app/not-found.tsx` | raiz | Publico | Error | `PublicHeader`, `Card` | full visual | Transversal |
| `/dashboard` | `src/app/dashboard/page.tsx` | `dashboard/layout.tsx` | `admin`, `supervisor`, `trabajador` | Dashboard | `DashboardAttentionPanel`, `DashboardOverview`, `DashboardWorkPanels`, `DashboardRecentActivity` | `dashboard.spec.ts` | Interna |
| `/dashboard/solicitudes` | `src/app/dashboard/solicitudes/page.tsx` | dashboard | `admin`, `supervisor` | Solicitudes internas | `ListFiltersBar`, `InternalSolicitudesList` | `solicitudes-internas.spec.ts` | Interna |
| `/dashboard/solicitudes/[id]` | `src/app/dashboard/solicitudes/[id]/page.tsx` | dashboard | `admin`, `supervisor` | Solicitudes internas | `InternalSolicitudDetail`, cliente, conversion, archivos, comentarios, historial | `solicitudes-internas.spec.ts`, `storage.spec.ts` | Interna |
| Solicitud detail actions | `src/app/dashboard/solicitudes/[id]/actions/**` | n/a | `admin`, `supervisor` | Solicitudes/clientes/pedidos | estado, cliente, conversion, comentarios | `solicitudes-internas.spec.ts` | Interna |
| Solicitud download | `src/app/dashboard/solicitudes/[id]/archivos/[fileId]/download/route.ts` | n/a | `admin`, `supervisor` | Storage | route handler con signed URL | `storage.spec.ts` | Interna |
| `/dashboard/pedidos` | `src/app/dashboard/pedidos/page.tsx` | dashboard | `admin`, `supervisor`, `trabajador` | Pedidos | `ListFiltersBar`, `InternalPedidosList` | `pedidos.spec.ts` | Interna |
| `/dashboard/pedidos/nuevo` | `src/app/dashboard/pedidos/nuevo/page.tsx` | dashboard | Vista interna; formulario solo si `pedidos.manage` | Pedidos | `PedidoForm` | `pedidos.spec.ts` | Interna |
| Pedido nuevo action | `src/app/dashboard/pedidos/nuevo/actions.ts` | n/a | `admin`, `supervisor` | Pedidos | `createPedidoAction` | `pedidos.spec.ts` | Interna |
| `/dashboard/pedidos/[id]` | `src/app/dashboard/pedidos/[id]/page.tsx` | dashboard | `admin`, `supervisor`, trabajador asignado | Pedidos | `InternalPedidoDetail`, tareas, pagos, asignaciones, archivos, comentarios, historial | `pedidos.spec.ts`, `storage.spec.ts` | Interna |
| Pedido detail actions | `src/app/dashboard/pedidos/[id]/actions/**` | n/a | Segun permiso y asignacion | Pedidos | estado, tareas, pagos, asignaciones, archivos, comentarios, plantillas | `pedidos.spec.ts`, `task-templates.spec.ts` | Interna |
| Pedido download | `src/app/dashboard/pedidos/[id]/archivos/[fileId]/download/route.ts` | n/a | Acceso al pedido | Storage | route handler con signed URL | `storage.spec.ts` | Interna |
| `/dashboard/clientes` | `src/app/dashboard/clientes/page.tsx` | dashboard | `admin`, `supervisor` | Clientes | `ListFiltersBar`, `InternalClientesList` | `clientes.spec.ts` | Interna |
| `/dashboard/clientes/nuevo` | `src/app/dashboard/clientes/nuevo/page.tsx` | dashboard | `admin`, `supervisor` | Clientes | `ClienteForm` | `clientes.spec.ts` | Interna |
| `/dashboard/clientes/[id]` | `src/app/dashboard/clientes/[id]/page.tsx` | dashboard | `admin`, `supervisor` | Clientes | `InternalClienteDetail` | `clientes.spec.ts` | Interna |
| `/dashboard/clientes/[id]/editar` | `src/app/dashboard/clientes/[id]/editar/page.tsx` | dashboard | `admin`, `supervisor` | Clientes | `ClienteEditForm` | `clientes.spec.ts` | Interna |
| `/dashboard/usuarios` | `src/app/dashboard/usuarios/page.tsx` | dashboard | `admin` | Usuarios | `ListFiltersBar`, `InternalUsersList` | `usuarios.spec.ts` | Interna |
| `/dashboard/usuarios/nuevo` | `src/app/dashboard/usuarios/nuevo/page.tsx` | dashboard | `admin` | Usuarios | `UserCreateForm` | `usuarios.spec.ts` | Interna |
| `/dashboard/usuarios/[id]` | `src/app/dashboard/usuarios/[id]/page.tsx` | dashboard | `admin` | Usuarios | `InternalUserDetail` | `usuarios.spec.ts` | Interna |
| `/dashboard/usuarios/[id]/editar` | `src/app/dashboard/usuarios/[id]/editar/page.tsx` | dashboard | `admin` | Usuarios | `UserEditForm` | `usuarios.spec.ts` | Interna |
| `/dashboard/configuracion` | `src/app/dashboard/configuracion/page.tsx` | dashboard | `admin` | Plantillas | `TaskTemplatesSection` | `task-templates.spec.ts` | Interna |
| `/dashboard/configuracion/plantillas/[templateId]` | `src/app/dashboard/configuracion/plantillas/[templateId]/page.tsx` | dashboard | `admin` | Plantillas | `TaskTemplateDetailHeader`, `TaskTemplateTasksSection` | `task-templates.spec.ts` | Interna |

No hay `loading.tsx`, `error.tsx` ni segment-level `not-found.tsx` adicionales.
El unico `not-found.tsx` esta en la raiz.

## 5. Clasificacion publica, interna y transversal

Publico:

- `/`
- `/solicitud`
- `/estado`

Interno:

- `/login`, aunque no requiera sesion, porque pertenece al acceso al sistema
  interno.
- `/dashboard/**`
- Route handlers de descarga bajo `/dashboard/**`.

Transversal:

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/not-found.tsx`
- `/acceso-denegado`
- `/sin-permisos`
- `src/proxy.ts`
- `src/lib/supabase/proxy.ts`

## 6. Arbol actual de `src/app`

```text
src/app/
  layout.tsx
  globals.css
  favicon.ico
  page.tsx
  not-found.tsx
  solicitud/
    page.tsx
    actions.ts
  estado/
    page.tsx
  login/
    page.tsx
    actions.ts
  acceso-denegado/
    page.tsx
  sin-permisos/
    page.tsx
  dashboard/
    layout.tsx
    page.tsx
    solicitudes/
      page.tsx
      [id]/
        page.tsx
        actions.ts
        actions/
          client-actions.ts
          comment-actions.ts
          conversion-actions.ts
          shared.ts
          status-actions.ts
        archivos/[fileId]/download/route.ts
    pedidos/
      page.tsx
      nuevo/
        page.tsx
        actions.ts
      [id]/
        page.tsx
        actions.ts
        actions/
          comment-actions.ts
          file-actions.ts
          payment-actions.ts
          shared.ts
          status-actions.ts
          task-actions.ts
          template-actions.ts
          worker-actions.ts
        archivos/[fileId]/download/route.ts
    clientes/
      page.tsx
      nuevo/page.tsx + actions.ts
      [id]/page.tsx
      [id]/editar/page.tsx + actions.ts
    usuarios/
      page.tsx
      nuevo/page.tsx + actions.ts
      [id]/page.tsx
      [id]/editar/page.tsx + actions.ts
    configuracion/
      page.tsx
      actions.ts
      plantillas/[templateId]/page.tsx + actions.ts
```

## 7. Arbol propuesto con `(publico)` e `(interno)`

```text
src/app/
  layout.tsx
  globals.css
  favicon.ico
  not-found.tsx
  (publico)/
    page.tsx
    solicitud/
      page.tsx
      actions.ts
    estado/
      page.tsx
  (interno)/
    login/
      page.tsx
      actions.ts
    acceso-denegado/
      page.tsx
    sin-permisos/
      page.tsx
    dashboard/
      layout.tsx
      page.tsx
      solicitudes/
        page.tsx
        [id]/
          page.tsx
          actions.ts
          actions/
          archivos/[fileId]/download/route.ts
      pedidos/
        page.tsx
        nuevo/
        [id]/
      clientes/
      usuarios/
      configuracion/
```

Notas:

- `(publico)` e `(interno)` no aparecen en las URLs.
- La agrupacion no crea aislamiento de seguridad, red ni despliegue.
- La exposicion publica e interna debe resolverse despues con arquitectura de
  despliegue, red, dominios, proxy o reglas de plataforma.
- No se deben alterar permisos, redirects, contratos funcionales ni RLS durante
  la reorganizacion.

## 8. Impacto exacto de la reorganizacion

Archivos que se moverian:

- `page.tsx` raiz hacia `(publico)/page.tsx`.
- `solicitud/**` hacia `(publico)/solicitud/**`.
- `estado/**` hacia `(publico)/estado/**`.
- `login/**`, `acceso-denegado/**`, `sin-permisos/**` y `dashboard/**` hacia
  `(interno)/**`.

Archivos que no deberian moverse:

- `src/app/layout.tsx`, para conservar un unico root layout y evitar cargas
  completas entre areas por multiples root layouts.
- `src/app/globals.css` y `favicon.ico`.
- `src/app/not-found.tsx`, salvo decision posterior de crear not-found por area.
- `src/proxy.ts`.

Riesgos de imports:

- Los imports con alias hacia rutas fisicas de `src/app` deben actualizarse,
  por ejemplo `@/app/dashboard/pedidos/[id]/actions` pasaria a incluir
  `@/app/(interno)/dashboard/...`.
- Los imports relativos dentro de una carpeta movida, como `./actions`, deberian
  seguir funcionando si se mueve la carpeta completa.
- Los imports desde `@/components` y `@/lib` no deberian romperse.
- Puede convenir en una fase posterior reducir imports de componentes hacia
  `@/app/.../actions` exponiendo tipos de action desde componentes o dominio,
  pero eso ya no seria una tarea puramente estructural.

Riesgos de rutas duplicadas:

- No pueden existir dos `page.tsx` que resuelvan a la misma URL entre grupos.
  Por ejemplo `(publico)/login` y `(interno)/login` colisionarian.
- La home `/` debe vivir en un solo grupo.

Riesgos de layouts multiples:

- Mantener root layout en `src/app/layout.tsx` evita full page reloads entre
  areas por multiples root layouts.
- `dashboard/layout.tsx` puede moverse dentro de `(interno)` sin cambiar URL.
- Si en el futuro se crea layout por grupo, debe medirse si aporta valor real.

Riesgos de auth, redirect y proteccion:

- `src/lib/supabase/proxy.ts` opera por pathname URL (`/dashboard`, `/login`,
  `/acceso-denegado`, `/sin-permisos`), por lo que no deberia cambiar.
- `canAccessDashboardRoute` usa URLs visibles; no debe incluir nombres de route
  group.
- `redirect` y `revalidatePath` usan URLs reales; no deben cambiar.
- Los route handlers de descarga deben moverse junto con la ruta interna y
  mantener validaciones server-side.

Pruebas recomendadas para la tarea futura A:

- `npm run diff:check`
- `npm run verify`
- `npm run test:e2e -- --project=chromium tests/e2e/smoke.spec.ts`
- `npm run test:e2e -- --project=chromium tests/e2e/dashboard.spec.ts`
- `npm run test:e2e -- --project=chromium tests/e2e/public-solicitud.spec.ts`
- `npm run test:e2e -- --project=chromium tests/e2e/public-tracking.spec.ts`
- `npm run test:e2e -- --project=chromium tests/e2e/storage.spec.ts`

El cambio puede ser casi estructural, pero no estrictamente mecanico: exige
actualizar imports que apuntan a `@/app/...` y revisar cualquier referencia
documental o script que asuma paths fisicos.

## 9. Auditoria de iconografia

Estado actual:

- `package.json` no incluye `lucide-react`, Heroicons ni otra libreria de
  iconos.
- No se detecto catalogo SVG local ni componentes `Icon*`.
- La UI usa texto como mecanismo principal de accion: `Ver pedido`, `Descargar`,
  `Guardar cambios`, `Actualizar estado`, `Asignar personal`.
- Existen decoraciones simples con `aria-hidden`, separadores textuales `·`,
  ellipsis en estados pending y asteriscos requeridos con `aria-hidden`.
- Los estados no dependen solo de simbolos: `StatusBadge`, `PriorityBadge` y
  mensajes usan texto.

Componentes que deberian recibir iconos primero en una tarea futura:

- Navegacion interna: dashboard, solicitudes, pedidos, clientes, usuarios,
  configuracion.
- Acciones repetidas: volver, ver detalle, descargar, copiar, guardar, crear,
  eliminar, mover arriba/abajo.
- Alertas y estados vacios.
- Secciones de detalle: archivos, comentarios, historial, tareas, pagos,
  asignaciones.
- Busqueda y filtros en `ListFiltersBar`.

## 10. Recomendacion del sistema de iconos

Dependencia recomendada: `lucide-react`.

Razones:

- Funciona sin CDN.
- Renderiza SVG inline y permite `currentColor`.
- Tiene soporte TypeScript y buen tree shaking cuando se importan iconos por
  nombre.
- Mantiene consistencia de trazo y un catalogo suficiente para UI operativa.
- Es compatible con Server Components para iconos estaticos.
- Permite reemplazo futuro si se centralizan reglas de uso sin envolver todo en
  una abstraccion prematura.

Alternativas descartadas:

- Emojis o Unicode como iconos de interfaz: inconsistentes, dependientes del
  sistema y poco controlables.
- SVGs copiados ad hoc: utiles para marca, pero caros de mantener como sistema.
- Icon font o CDN: peor para control, accesibilidad y funcionamiento offline.
- Wrapper generico universal desde el inicio: puede ocultar tree shaking y
  añadir complejidad antes de saber que variantes hacen falta.

Propuesta minima:

- Tamaños canonicos: 16 px para metadata, 20 px para botones/listas, 24 px para
  estados vacios o secciones.
- `strokeWidth`: 1.75 o 2, definido por convencion.
- Color por `currentColor`.
- Iconos decorativos con `aria-hidden="true"`.
- Botones de solo icono solo con nombre accesible (`aria-label`) y tooltip si
  el significado no es obvio.
- No comunicar estado solo con icono.
- No usar imports dinamicos que carguen todo el catalogo.
- Usar iconos de marca propios solo cuando Lucide no represente el concepto.

Alcance futuro B:

- Instalar `lucide-react`.
- Documentar convenciones en `FASE_14_DESIGN_SYSTEM.md` o documento derivado.
- Migrar una primera tanda pequena: navegacion, alertas, vacios y acciones de
  archivo/copia.
- Ejecutar `verify`, `diff:check` y QA visual focal.

## 11. Auditoria del shell interno

El shell actual vive en `src/app/dashboard/layout.tsx` y combina:

- `SkipLink`.
- `DashboardSidebar` server-side con filtrado por rol.
- `DashboardNavLink` client-side pequeno para `usePathname` y `aria-current`.
- Navegacion movil con `details/summary`.
- `main#main-content` con `max-w-screen-2xl`.

Fortalezas:

- Mantiene permisos y visibilidad en servidor.
- Tiene foco visible global y skip link.
- No consulta Supabase desde componentes cliente.
- Sidebar desktop sticky y navegacion movil operable.

Limitaciones para workspace:

- El `main` actual tiene padding y ancho maximo generalista; detalles tipo
  workspace podrian necesitar una variante de contenedor mas amplia y de altura
  util completa.
- El sidebar principal y una futura barra contextual pueden competir si ambos
  usan peso visual alto.
- El menu movil actual sirve como navegacion principal, pero no como barra
  contextual de acciones de detalle.
- No hay breadcrumbs o rail contextual por pantalla.

Recomendacion:

- Conservar el shell actual como base.
- Crear una variante composable para paginas de detalle/workspace, no un layout
  global nuevo para todo el dashboard.
- Permitir contenedores distintos por tipo de pantalla: listados, formularios y
  workspaces no necesitan el mismo ancho.

## 12. Auditoria detallada de solicitudes

La pagina `src/app/dashboard/solicitudes/[id]/page.tsx` carga server-side la
solicitud, clientes, archivos, comentarios e historial, y compone secciones
presentacionales. `InternalSolicitudDetail` ya separa cabecera, codigo publico,
resumen, contenido principal y aside.

Clasificacion de contenido:

| Contenido | Ubicacion futura recomendada |
| --- | --- |
| Referencia publica, estado, cliente, servicio, fecha | Cabecera/resumen compacto |
| Descripcion y observaciones | Contenido principal permanente |
| Contacto recibido | Resumen compacto o panel cliente |
| Archivos | Vista rapida en principal; gestion en panel de archivos |
| Cliente asociado/crear/asociar cliente | Panel contextual de cliente |
| Cambio de estado | Action rail o panel de gestion |
| Conversion a pedido | Panel contextual o ruta completa si crece |
| Comentarios | Panel contextual o seccion secundaria con scroll interno |
| Historial | Panel contextual de lectura |
| UUID interno y metadata | Panel metadata secundario |

Riesgos:

- No ocultar conversion, estado o cliente de forma que el supervisor pierda el
  flujo de revision.
- No exponer comentarios/historial a trabajador; hoy trabajador no entra a
  solicitudes.
- No convertir el detalle completo en Client Component.

## 13. Auditoria detallada de pedidos

`src/app/dashboard/pedidos/[id]/page.tsx` carga pedido, perfil, asignables,
tareas, archivos, comentarios, historial, pagos y plantillas. `InternalPedidoDetail`
renderiza cabecera, codigo publico, resumen, columna principal y aside.

El detalle actual es completo, pero acumula demasiadas operaciones en una sola
pagina: estado, pagos, asignaciones, cliente, solicitud, metadata, datos del
trabajo, tareas, archivos, comentarios e historial.

Clasificacion de contenido:

| Contenido | Ubicacion futura recomendada |
| --- | --- |
| Numero, titulo, flujo, estado, prioridad | Cabecera compacta |
| Cliente, entrega, asignados, progreso/pago resumido | Resumen compacto |
| Descripcion/especificaciones | Contenido principal permanente |
| Tareas activas y progreso | Principal en `encargo`; resumen en `impresion` |
| Archivos importantes | Vista rapida principal |
| Gestion completa de archivos | Panel contextual |
| Estado del pedido | Action rail + panel de estado |
| Pagos | Panel contextual; mantener visible si bloquea entrega |
| Asignaciones | Panel contextual de personal |
| Comentarios | Panel contextual o sheet |
| Historial | Panel contextual de lectura |
| Plantillas | Panel/tarea dentro de tareas, solo `encargo` |
| Metadata tecnica | Panel secundario |

Encargo vs impresion:

- `encargo`: tareas son parte del trabajo principal porque condicionan avance.
- `impresion`: el area principal debe priorizar especificaciones, archivos y
  estado; las tareas no deben aparecer como ausencia problematica.

Admin/supervisor/trabajador:

- Admin y supervisor gestionan estado, pagos, asignaciones, archivos, tareas y
  comentarios segun permisos.
- Trabajador ve pedidos asignados, puede operar tareas/estado permitidos y
  archivos del pedido, pero no debe gestionar pagos ni asignaciones.
- Los paneles no deben cargar ni mostrar controles no autorizados.

## 14. Mapa de contenido principal y secundario

| Modulo | Principal permanente | Panel contextual | Ruta independiente | Modal confirmacion |
| --- | --- | --- | --- | --- |
| Solicitud | descripcion, estado visible, datos de entrada, archivos importantes | cliente, estado, archivos, comentarios, historial | conversion si se vuelve flujo largo | rechazar/cambios criticos si procede |
| Pedido encargo | descripcion, tareas activas, progreso, archivos clave, entrega | estado, pagos, asignaciones, archivos, comentarios, historial, plantillas | edicion general futura, reportes | eliminar tarea, cambios destructivos |
| Pedido impresion | especificaciones, archivos clave, estado, entrega | estado, pagos, archivos, comentarios, historial, asignaciones | especificaciones normalizadas futuras | cambios criticos |
| Cliente | contacto, notas, metadata minima | pedidos/solicitudes relacionadas futuras | edicion | desactivaciones futuras |

## 15. Comparacion de patrones de paneles y navegacion contextual

| Patron | Ventajas | Desventajas | Recomendacion |
| --- | --- | --- | --- |
| Tabs | Simple, familiar, shareable si usa URL | Puede esconder informacion critica y fragmentar flujo | Util para secciones de lectura, no como base principal |
| Accordion | Bueno en movil y lectura lineal | Poco eficiente para operacion frecuente en desktop | Complemento movil, no base desktop |
| Sidebar interna | Orienta secciones largas | Puede duplicar sidebar principal | Valida para detalle simple, no para acciones frecuentes |
| Action rail | Denso, rapido, apto para workspace | Requiere iconos y accesibilidad cuidadosa | Base recomendada en desktop |
| Drawer lateral | Mantiene contexto y reduce scroll principal | Foco, Escape, scroll interno y permisos deben cuidarse | Recomendado para modulos secundarios |
| Sheet movil | Patron adecuado para acciones contextuales | Puede complicar formularios largos | Base recomendada en movil |
| Dialog/modal | Enfoca decisiones cortas | Malo para trabajo sostenido | Solo confirmaciones o acciones puntuales |
| Panel persistente dividido | Muy productivo en desktop amplio | Consume ancho y puede saturar | Excepcion para pagos/estado si se valida |
| Rutas secundarias | Accesibles, shareables y simples de probar | Pierden contexto inmediato | Usar para flujos largos o complejos |
| Search params | Restauran estado y permiten enlaces | Aumentan acoplamiento URL/UI | Usar para panel activo cuando aporte valor |
| Parallel/Intercepting Routes | Deep linking avanzado de paneles | Complejidad alta y defaults/404 en slots | No elegir por defecto; evaluar solo si paneles deben ser rutas compartibles |

## 16. Recomendacion del modelo de workspace

Base recomendada:

- Cabecera compacta con identidad, estado, prioridad, referencia y acciones
  primarias.
- Area principal server-rendered con datos esenciales y trabajo activo.
- Action rail en desktop con iconos y labels accesibles.
- Panel contextual/drawer para modulos secundarios.
- Sheet o barra inferior en movil con acciones principales y opcion "Mas".
- Estado de panel inicialmente local; usar `searchParams` solo para paneles que
  deban restaurarse o compartirse.

No se recomienda empezar con Parallel Routes o Intercepting Routes. Son utiles
para modales deep-linkeables, pero el primer rediseño debe priorizar claridad,
accesibilidad, bajo acoplamiento y pruebas sencillas.

## 17. Comportamiento desktop, tablet y movil

Desktop 1440 x 1000:

- Sidebar principal persistente.
- Cabecera de entidad compacta.
- Area principal amplia.
- Action rail o panel contextual a la derecha.
- Scroll principal reducido; paneles secundarios con scroll interno solo cuando
  sea claro.

Tablet 1024 x 768 y 768 x 1024:

- Mantener lectura en una o dos columnas segun ancho util real.
- Evitar forzar una pantalla "sin scroll".
- Action rail puede pasar a fila superior compacta o botones segmentados.

Movil 375 x 812:

- Flujo lineal con cabecera, resumen y contenido principal.
- Barra inferior o botonera contextual, cuidando safe areas.
- Paneles como sheets con foco, Escape/cerrar, retorno de foco y titulos
  accesibles.
- No usar el diseño desktop reducido como unica solucion.

## 18. Accesibilidad

Requisitos para futuras tareas:

- Foco visible y retorno de foco al cerrar drawers/sheets.
- Escape y boton cerrar con nombre accesible.
- `aria-label` en botones de solo icono.
- Iconos decorativos con `aria-hidden`.
- Dialogs/sheets con titulo accesible.
- `complementary` para paneles persistentes no modales.
- No depender solo de color o iconos.
- Mantener lectura lineal razonable sin CSS.
- Evitar doble scroll confuso.
- Targets tactiles de al menos 44 px.
- Respetar `prefers-reduced-motion`.

La meta de "pantalla sin scroll" debe entenderse como densidad y priorizacion,
no como prohibicion rigida del scroll.

## 19. Componentes reutilizables

Pueden reutilizarse:

- `Button`, `Card`, `Alert`, `StatusBadge`, `PriorityBadge`, `EmptyState`.
- `PageHeader`, aunque para workspace conviene una cabecera de entidad mas
  compacta.
- `DetailPanel`, `MetadataGrid`, `MetadataItem`.
- `FormField`, `Input`, `Select`, `Textarea`, `FormSection`, `FormActions`.
- `CopyableCode`.
- Listados y secciones de dominio actuales como contenido de paneles.

Fortalezas del sistema visual:

- Tokens en `globals.css`.
- Foco global.
- Movimiento reducido.
- Badges semanticos con texto.
- Cards y formularios normalizados.

## 20. Componentes que deben crearse o evolucionar

Crear o evolucionar en tareas futuras:

- `EntityWorkspaceShell` o equivalente, solo tras prototipo.
- `EntityHeader` compacta para solicitud/pedido.
- `ActionRail` desktop.
- `ContextPanel`/`Drawer` con foco, Escape y retorno.
- `MobileActionBar` con safe area.
- `IconButton` con `aria-label` y tooltip opcional.
- `WorkspaceSummaryGrid` para datos compactos.
- Variantes de `DetailPanel` mas densas para panel contextual.

Evitar crear un design system nuevo desde cero. El actual debe ampliarse.

## 21. Matriz de riesgos y QA

| Cambio futuro | Riesgo | Archivos probables | Spec focal | Validacion manual |
| --- | --- | --- | --- | --- |
| Route Groups | Imports rotos, rutas duplicadas, redirects mal entendidos | `src/app/**`, imports `@/app/**` | smoke, dashboard, public solicitud, public tracking | Navegar URLs publicas/internas |
| Instalacion de iconos | Bundle, imports amplios | `package.json`, componentes UI/layout | verify | Revisar render y a11y |
| Navegacion con iconos | Iconos sin nombre, active state confuso | `src/components/layout/**` | dashboard | Teclado desktop/movil |
| Detalle de solicitud | Perdida de flujo de revision | `InternalSolicitudDetail`, secciones | solicitudes-internas | Admin/supervisor, 375/1440 |
| Detalle de pedido | Permisos, tareas, pago, Storage | `InternalPedidoDetail`, secciones | pedidos, storage | Admin/supervisor/trabajador |
| Action rail | Acciones solo por icono, foco | nuevos workspace components | pedidos/solicitudes | Teclado y lector de pantalla |
| Paneles contextuales | Doble scroll, foco, carga no autorizada | drawer/sheet + secciones | pedidos, solicitudes | Escape, retorno de foco |
| Barra inferior movil | Solapamiento, safe area | mobile action bar | visual/manual | 375 x 812 |
| Permisos por rol | Acciones visibles indebidamente | proxy, permisos, componentes | dashboard, pedidos | roles admin/supervisor/trabajador |
| Archivos | `file_path`, signed URL, descarga | storage components/routes | storage | descarga y ausencia de metadata sensible |
| Comentarios | Escrituras no deseadas, append-only | comments sections/actions | pedidos/solicitudes | mensajes y permisos |
| Historial | Metadata cruda | history sections | pedidos/solicitudes | lectura y truncado |
| Estado pedido | RPC, pago/tareas | status form/actions | pedidos | transiciones validas/invalidas |
| Tareas | mutaciones, plantillas | task sections | pedidos, task-templates | encargo vs impresion |
| Pagos/asignaciones | trabajador no autorizado | payment/worker sections | pedidos | roles y bloqueo entrega |

## 22. Backlog priorizado

Problemas reales:

| Hallazgo | Severidad | Impacto | Esfuerzo | Riesgo | Prioridad |
| --- | --- | --- | --- | --- | --- |
| Detalles de solicitud/pedido mantienen demasiada profundidad vertical | Media | Alto en operacion diaria | Medio | Medio | Alta |
| Falta infraestructura de iconos consistente | Baja | Medio en escaneo | Bajo | Bajo | Media |
| Route Groups aun no separan areas de proyecto | Baja | Mantenibilidad | Bajo/medio | Medio por imports | Media |
| No hay loading/error boundaries por segmento | Baja | UX en latencia | Medio | Bajo | Baja |

Mejoras visuales:

- Action rail, paneles contextuales, barra inferior movil.
- Iconos en navegacion, alertas, vacios y acciones secundarias.
- Cabeceras compactas de entidad.

Deuda tecnica:

- Imports de componentes hacia `@/app/.../actions` hacen mas costoso mover
  carpetas.
- Full visual QA sigue siendo grande para cierre transversal.
- Fixtures de Storage y datos QA siguen aceptados como deuda Beta 2.

Decisiones de producto:

- Que modulos son acciones frecuentes vs consulta secundaria.
- Si comentarios/historial deben ser siempre visibles o bajo panel.
- Si pagos deben tener prominencia por bloqueo de entrega.

Infraestructura:

- Route Groups.
- Iconos.
- Componentes workspace.
- Potencial arquitectura de red/despliegue para separar publico/interno.

## 23. Secuencia recomendada de implementacion

### Tarea posterior A

Reorganizar rutas en `(publico)` e `(interno)` sin cambios funcionales.

### Tarea posterior B

Instalar y configurar `lucide-react`, documentar reglas de iconos y migrar una
tanda pequena sin rediseñar pantallas.

### Tarea posterior C

Definir componentes estructurales del workspace mediante prototipo controlado,
preferiblemente sobre una variante de detalle con datos reales y alcance
acotado.

### Tarea posterior D

Migrar primero el detalle que ofrezca mayor valor y menor riesgo. Recomendacion:
empezar por detalle de solicitud si se quiere validar paneles con menos roles y
menos subdominios; empezar por pedido si Direccion Tecnica prioriza impacto
operativo, aceptando mayor QA.

### Tarea posterior E

Extender el patron validado a las demas pantallas, con QA por rol y responsive.

## 24. Dudas o decisiones pendientes para Direccion Tecnica

- Confirmar si `/acceso-denegado` y `/sin-permisos` deben vivir dentro de
  `(interno)` o quedarse como transversales en raiz. Recomendacion: `(interno)`.
- Decidir si el primer prototipo workspace sera solicitud o pedido.
- Definir que acciones deben estar siempre visibles en desktop y movil.
- Decidir si el estado de panel debe reflejarse en `searchParams` desde el
  primer prototipo o mantenerse local inicialmente.
- Confirmar si el despliegue futuro separara publico/interno por dominio,
  subdominio, proxy, reglas de plataforma o red privada.
- Confirmar si pagos debe ser panel contextual o bloque persistente en pedidos.

## Comandos ejecutados durante la auditoria

| Comando | Resultado |
| --- | --- |
| `Get-Content` de docs obligatorios y docs Beta 2/UI/UX | OK |
| `Get-Content` de skills `ui-ux-pro-max` y `godel-authenticated-visual-qa` | OK |
| `python --version`, `python3 --version`, `py --version` | Fallaron por sesion de logon; no se ejecuto buscador de la skill |
| `rg --files src/app` | OK |
| `rg --files src/components` | OK |
| `rg` sobre imports, actions, iconos, rutas, e2e y revalidation | OK |
| `Get-Content` de docs locales de Next.js route groups/layout/loading/error/not-found/route/parallel/intercepting | OK |
| `git status --short` inicial | Sin salida, limpio |
| `git branch --show-current` | `uiux/pre-redesign-foundation` |
| `git rev-parse HEAD` | `91b9827e9533e4a8111880daedc0b58114509e74` |

Comandos de cierre ejecutados despues de crear el documento:

| Comando | Resultado |
| --- | --- |
| `npm.cmd run verify` | OK: `eslint` y `next build` completaron correctamente con Next.js 16.2.6 |
| `npm.cmd run diff:check` | OK: `git diff --check` sin errores |
| `git status --short` final | `?? docs/ui-ux/AUDITORIA_POST_BETA_2_PRE_REDISENO.md` |

## Confirmacion de alcance

Esta auditoria no implementa Route Groups, no instala iconos, no rediseña UI, no
mueve carpetas, no modifica Server Actions, loaders, servicios, consultas,
permisos, RLS, RPCs, Storage, migraciones ni pruebas. El cambio funcionalmente
neutro esperado es este documento.
