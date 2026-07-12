# Especificación del shell interno

## 1. Propósito

El shell interno es la estructura persistente que envuelve el área operativa de Godel Diseño. Incluye el layout de dashboard, el sidebar de escritorio, la navegación móvil, el contenedor principal, el skip link, la navegación activa, la información de sesión, la identidad visual, el comportamiento de scroll y la convivencia entre páginas normales y workspaces.

El shell no contiene lógica de negocio. Su responsabilidad es componer navegación, marco visual, accesibilidad y geometría general. Las reglas de dominio, permisos críticos, mutaciones, consultas y validaciones siguen viviendo en servidor, servicios de `src/lib`, Server Actions, RPCs y RLS según corresponda.

## 2. Principios

- Mantener arquitectura server-first.
- No convertir `DashboardLayout` completo en Client Component.
- Filtrar navegación por rol antes de llegar a la UI interactiva.
- Mantener URLs actuales.
- No modificar permisos ni RLS.
- No mezclar dominio con navegación.
- No resolver responsive con ocultación indiscriminada.
- Preservar accesibilidad por teclado.
- Usar los assets de marca ya versionados.
- No añadir dependencias.

## 3. Inventario actual

### `DashboardLayout`

- Es un Server Component.
- Obtiene el perfil actual con `getCurrentProfile()`.
- Renderiza `SkipLink`.
- Renderiza `DashboardSidebar`.
- Define `main#main-content` con `tabIndex={-1}`.
- Usa `max-w-screen-2xl` para el contenido.
- Aplica padding global mediante clases responsive en `main`.
- Usa una raíz `md:flex` con `min-h-screen`, fondo de aplicación y texto principal.

### `DashboardSidebar`

- Filtra `dashboardNavItems` por `canAccessDashboardRoute(role, item.href)`.
- Renderiza `DashboardMobileNav`.
- Renderiza un sidebar desktop fijo desde `md`.
- Usa el ancho expandido `w-64`, equivalente a `16rem / 256px`.
- Usa `md:sticky`, `md:top-0` y `md:h-screen`.
- Muestra texto plano `Godel Diseño`.
- Muestra el subtítulo `Gestión operativa`.
- Muestra botón de logout mediante `LogoutButton`.

### `DashboardMobileNav`

- Usa `<details>`.
- Muestra el logo horizontal para fondo oscuro.
- Muestra botón `Menú` con icono de Lucide.
- Lista los enlaces visibles por rol.
- Cierra al navegar mediante `DashboardNavLink`.
- Muestra usuario autenticado y rol legible dentro del menú.
- Mantiene logout separado del bloque de usuario.

### `DashboardNavLink`

- Es Client Component.
- Usa `usePathname()`.
- Marca rutas activas con `aria-current="page"`.
- Considera rutas hijas activas.
- Usa iconos Lucide derivados de `DashboardNavIconName`.
- Tiene variantes visuales para desktop y móvil.

### `dashboard-nav-items`

- Define los enlaces principales del dashboard:
  `Dashboard`, `Solicitudes`, `Pedidos`, `Clientes`, `Usuarios` y `Configuración`.
- Cada item declara `href`, `label` e `icon`.
- No contiene reglas de permisos; la visibilidad se decide en `DashboardSidebar`.

### `SkipLink`

- Apunta a `#main-content`.
- Está posicionado con `fixed`, `z-50` y solo se hace visible al recibir foco.
- Usa el texto `Saltar al contenido principal`.

### `auth/current-user`

- `CurrentProfile` actualmente solo trae `id`, `role`, `is_active`.
- El select actual es `id, role, is_active`.
- Para mostrar el usuario autenticado habrá que añadir `full_name`.
- No consulta `auth.users`; obtiene el usuario actual mediante Supabase Auth y lee `public.perfiles`.

## 4. Recursos de marca disponibles

Assets versionados:

```text
public/brand/godel-diseno-horizontal-on-light.png
public/brand/godel-diseno-horizontal-on-dark.png
public/brand/godel-diseno-mark.png
src/app/favicon.ico
src/app/icon.png
src/app/apple-icon.png
```

### `godel-diseno-horizontal-on-dark.png`

Uso:

- Sidebar expandido.
- Header móvil sobre fondo oscuro.

### `godel-diseno-horizontal-on-light.png`

Uso:

- Superficies claras.
- Área pública futura.
- Login futuro.
- Documentación visual.

### `godel-diseno-mark.png`

Uso:

- Sidebar colapsado.
- Icono compacto.
- Fallback visual.
- Posibles botones o headers compactos.

### `src/app/favicon.ico`, `icon.png`, `apple-icon.png`

Uso:

- Metadatos automáticos de Next.js App Router.
- Favicon.
- Icono general.
- Icono Apple.

La implementación debe usar `next/image` solo si aporta valor real. Para imágenes estáticas pequeñas también puede usarse `img` con dimensiones explícitas cuando simplifique el componente y no afecte el layout.

## 5. Arquitectura server/client propuesta

Composición objetivo:

```text
DashboardLayout                    Server Component
|-- lee perfil actual
|-- lee preferencia inicial de sidebar
|-- renderiza SkipLink
|-- renderiza DashboardSidebar      Server Component
|   |-- filtra navegación por rol
|   |-- pasa items visibles
|   |-- pasa usuario/rol visible
|   |-- DashboardMobileNav
|   `-- DashboardDesktopSidebar     Client Component
`-- main#main-content
```

Reglas:

- `DashboardLayout` permanece server-side.
- `DashboardSidebar` puede permanecer server-side.
- Solo el sidebar desktop colapsable debe ser cliente.
- `DashboardNavLink` puede seguir siendo cliente para ruta activa.
- El filtrado de navegación se mantiene fuera del componente cliente.
- La información de sesión mostrada debe venir del perfil actual, no de una llamada nueva en cliente.
- La preferencia inicial de colapso debe leerse en servidor para renderizar la geometría correcta desde la primera respuesta.

## 6. Sidebar desktop expandido y colapsado

El sidebar desktop tendrá dos estados. Ambos deben conservar navegación, logout, estado activo y nombres accesibles.

### Expandido

Ancho conceptual:

```text
16rem / 256px
```

Contenido:

- Logo horizontal para fondo oscuro.
- Botón para colapsar.
- Logo y botón se alinean en la misma fila.
- Navegación con icono y texto.
- Item activo claramente visible.
- Usuario autenticado.
- Rol.
- Botón cerrar sesión.

### Colapsado

Ancho conceptual:

```text
5rem / 80px
```

Contenido:

- Símbolo `godel-diseno-mark.png`.
- Botón para expandir en la misma zona de marca.
- Navegación solo con iconos.
- Item activo claramente visible.
- Icono de usuario.
- Botón/icono de logout.
- Nombres accesibles completos.
- `title` o tooltip sencillo para usuarios de ratón.

El botón de expandir en modo colapsado debe estar centrado sobre la marca y aparecer con hover o foco sobre la zona de marca, sin ocupar una fila propia ni desplazar la navegación. Tras contraer la barra, debe evitar quedar visible inmediatamente hasta que el puntero salga y vuelva a entrar, manteniendo aparición por teclado. Los estilos de foco deben usar indicadores visibles sin combinaciones conflictivas de clases CSS.

El colapso no debe ocultar funcionalidad y no debe aplicarse en móvil. En modo colapsado, un clic en espacios vacíos del sidebar puede expandir la barra, pero no debe interferir con enlaces, botones, formularios ni logout.

## 7. Persistencia del colapso

La preferencia de colapso se persistirá mediante una cookie no sensible.

Nombre sugerido:

```text
godel_sidebar_collapsed
```

Valores:

```text
1 = colapsado
0 o ausente = expandido
```

Motivo:

- Evita salto visual inicial.
- Permite renderizar el estado correcto desde el servidor.
- Conserva preferencia entre recargas y navegación.

Reglas:

- La cookie no contiene información sensible.
- No interviene en permisos.
- No se usa para seguridad.
- Debe tener `sameSite=lax`.
- Puede tener duración larga.
- No requiere `HttpOnly` porque la UI cliente necesita actualizarla.

## 8. Información de sesión

El sidebar mostrará:

- Nombre completo del perfil.
- Rol legible.
- Icono de usuario.
- Fallback `Usuario interno`.

El bloque de usuario no será un enlace. No habrá página de perfil en esta etapa.

Cambios previstos para la etapa de implementación:

```text
src/lib/auth/current-user.ts
src/lib/auth/types.ts
```

Ampliar `CurrentProfile` para incluir:

```text
full_name
```

Actualizar el select:

```text
id, full_name, role, is_active
```

Restricciones:

- No consultar `auth.users`.
- No exponer correo.
- No exponer datos sensibles.
- No hacer llamadas nuevas desde cliente para obtener sesión.

## 9. Navegación por rol

La navegación se sigue derivando de:

```text
dashboardNavItems
canAccessDashboardRoute(role, href)
```

La visibilidad visual no reemplaza:

- Protección de rutas.
- Server Actions.
- Servicios.
- RLS.

Matriz esperada según reglas actuales:

### Admin

- Dashboard.
- Solicitudes.
- Pedidos.
- Clientes.
- Usuarios.
- Configuración.

### Supervisor

- Dashboard.
- Solicitudes.
- Pedidos.
- Clientes.
- Las demás solo si los permisos actuales lo permiten.

### Trabajador

- Dashboard.
- Pedidos asignados.
- Otras secciones solo si los permisos actuales lo permiten.

No se cambiarán reglas de permisos en esta etapa. La implementación debe respetar que las subrutas heredan la regla del prefijo actual y que los permisos reales se validan en servidor y base de datos.

## 10. Navegación móvil

Móvil no usa sidebar colapsable.

La navegación móvil debe:

- Conservar `<details>` inicialmente si sigue siendo suficiente.
- Mostrar logo horizontal compacto.
- Mostrar botón `Menú`.
- Listar enlaces visibles por rol.
- Cerrar al navegar.
- Mostrar información de usuario.
- Mostrar logout.
- Separar solo el logout con una línea, sin poner borde encima del usuario.
- No interferir con la barra móvil de workspaces.
- No producir doble navegación visible.

Pendiente de validación futura:

- Si `<details>` ofrece suficiente control de foco.
- Si se necesita un componente cliente dedicado.

No se debe introducir un drawer avanzado sin evidencia.

La convivencia final con barras móviles de workspace, dialogs y bottom sheets se validará en la QA responsive de 7.6.

## 11. Modos de página

Las páginas internas se clasifican en dos modos.

### Flow

Usan scroll documental natural:

```text
/dashboard
/dashboard/solicitudes
/dashboard/pedidos
/dashboard/pedidos/nuevo
/dashboard/clientes
/dashboard/clientes/nuevo
/dashboard/clientes/[id]
/dashboard/clientes/[id]/editar
/dashboard/usuarios
/dashboard/usuarios/nuevo
/dashboard/usuarios/[id]
/dashboard/usuarios/[id]/editar
/dashboard/configuracion
/dashboard/configuracion/plantillas/[templateId]
```

Este modo corresponde a dashboard, listados, formularios, detalles secundarios y configuración. Pueden crecer verticalmente y usar el scroll del documento.

### Contained workspace

Usan altura contenida en escritorio y scroll interno:

```text
/dashboard/pedidos/[id]
/dashboard/solicitudes/[id]
```

Reglas:

- `DashboardLayout` no detecta rutas ni decide el modo de página.
- El modo se declara por composición: las páginas `flow` renderizan su contenido natural y los workspaces contenidos usan `WorkspaceShell`.
- El shell no debe imponer `overflow-hidden` global a todas las páginas.
- Cada workspace conserva su `WorkspaceShell desktopMode="contained"`.
- Las páginas `flow` no deben heredar padding inferior de barras de workspace.
- La barra móvil de workspace pertenece al workspace, no al shell global.

## 12. Geometría, ancho y scroll

- Sidebar expandido ocupa `16rem`.
- Sidebar colapsado ocupa `5rem`.
- `main` usa `min-w-0`.
- El contenido conserva `max-w-screen-2xl`.
- El cambio de ancho del sidebar debe permitir que el contenido use el espacio liberado.
- No debe aparecer overflow horizontal.
- Los workspaces no deben ganar scroll documental innecesario.
- La altura contenida de `WorkspaceShell` aplica solo en escritorio `xl`; móvil y tablet conservan flujo documental.
- Las páginas `flow` sí pueden crecer verticalmente.
- El sidebar desktop puede tener scroll interno si su contenido excede la altura disponible, sin arrastrar el contenido principal.
- El shell no debe asumir que todas las páginas tienen la misma estrategia de altura.

Viewports mínimos para validar:

```text
1440 x 900
1366 x 768
1024 x 768
900 x 1000
780 x 1000
375 x 812
```

## 13. Accesibilidad

### Botón de colapso

- Debe ser `button`, no `div`.
- Nombre accesible:
  - `Contraer barra lateral`.
  - `Expandir barra lateral`.
- Debe usar `aria-expanded`.
- Debe usar `aria-controls`.
- Target mínimo de 44px.
- Foco visible.
- Icono decorativo.

### Navegación

- `nav` con `aria-label="Navegación principal"`.
- Un solo enlace activo con `aria-current="page"`.
- Iconos decorativos.
- En modo colapsado los enlaces conservan nombres accesibles.
- No depender solo de color.
- `title` o tooltip para modo colapsado.

### Skip link

- Sigue apuntando a `#main-content`.
- Al activarlo debe enfocar el `main`.
- Debe ser visible sobre sidebar y header.

### Usuario

- Bloque informativo, no interactivo.
- Texto truncado visualmente.
- Nombre completo accesible.
- La línea inferior separa solo el logout; no debe aparecer una línea encima del bloque de usuario.

## 14. Movimiento

- Transición breve de ancho y opacidad.
- Duración orientativa `180-220ms`.
- Respetar `prefers-reduced-motion`.
- No bloquear interacción.
- No animar propiedades costosas innecesariamente.
- No producir parpadeo en navegación.
- Mantener transiciones simples, consistentes con el resto del dashboard y sin añadir dependencias.

## 15. Plan de implementación posterior

### 7.2 Marca, perfil y sidebar desktop

- Ampliar `CurrentProfile` con `full_name`.
- Usar logo en sidebar.
- Crear sidebar desktop colapsable.
- Persistir cookie.
- Mostrar usuario y rol.
- Mantener navegación por rol.
- Usar iconos en modo colapsado.

### 7.3 Navegación móvil

- Logo en header móvil.
- Usuario en menú móvil.
- Validar `<details>`.
- Asegurar cierre al navegar.
- Comprobar convivencia con workspaces.

### 7.4 Modos de página y geometría

- Validar `flow` vs `contained`.
- Sidebar expandido/colapsado.
- Scroll.
- Ancho.
- Overflow.

### 7.5 Accesibilidad

- Teclado.
- Foco.
- Skip link.
- `aria-current`.
- Botón de colapso.
- Nombres accesibles.

### 7.6 QA y cierre

- Pruebas por rol.
- Pruebas responsive.
- Screenshots.
- Full Visual QA si corresponde.

## 16. Riesgos

- Convertir todo el layout en cliente.
- Guardar permisos en estado cliente.
- Esconder navegación sin protección real.
- Crear un drawer móvil complejo antes de necesitarlo.
- Usar logo horizontal como favicon.
- Recortar mal el logo en modo colapsado.
- Provocar doble scroll con workspaces.
- Romper `aria-current`.
- Crear animaciones pesadas.
- Introducir dependencias innecesarias.
- Leer datos de sesión desde cliente para resolver información que ya existe en servidor.
- Hacer que el estado colapsado condicione permisos o rutas.

## 17. Política de validación

Para 7.1 ejecutar únicamente:

```bash
npm run diff:check
```

No ejecutar:

- `npm run verify`.
- Playwright.
- Full Visual QA.

Motivo: esta subtarea solo crea documentación.

## 18. Criterios de aceptación

La subtarea 7.1 queda cerrada cuando:

- Existe `docs/ui-ux/INTERNAL_SHELL_SPEC.md`.
- El documento describe el estado actual.
- Define shell expandido y colapsado.
- Define uso de logo y favicon.
- Define información de sesión.
- Define persistencia mediante cookie.
- Define arquitectura server/client.
- Clasifica páginas `flow` y `contained`.
- Define reglas de scroll.
- Define navegación móvil.
- Define accesibilidad.
- Define riesgos.
- Define plan de implementación 7.2-7.6.
- No modifica código.
- No modifica assets.
- `npm run diff:check` pasa.
