# Fase 14 — Revisión responsive integral

## 1. Alcance revisado

La revisión se ejecutó con Edge sobre la aplicación local, con perfil admin y
perfil trabajador cuando la ruta dependía del rol.

Rutas públicas:

- `/`
- `/solicitud`
- `/login`
- `/acceso-denegado`
- `/sin-permisos`

Rutas internas:

- `/dashboard`
- `/dashboard/solicitudes`
- `/dashboard/solicitudes/[id]`
- `/dashboard/pedidos`
- `/dashboard/pedidos/nuevo`
- `/dashboard/pedidos/[id]`
- `/dashboard/clientes`
- `/dashboard/clientes/nuevo`
- `/dashboard/clientes/[id]`
- `/dashboard/clientes/[id]/editar`
- `/dashboard/usuarios`
- `/dashboard/usuarios/nuevo`
- `/dashboard/usuarios/[id]`
- `/dashboard/usuarios/[id]/editar`
- `/dashboard/configuracion`

El perfil trabajador se comprobó adicionalmente en `/dashboard`,
`/dashboard/pedidos` y un detalle de pedido asignado.

## 2. Matriz de breakpoints

| Ruta | 375 px | 768 px | 1024 px | 1440 px | Observaciones |
| --- | --- | --- | --- | --- | --- |
| `/` | Aprobado | Aprobado | Aprobado | Aprobado | Hero, CTA y header sin overflow. |
| `/solicitud` | Aprobado | Aprobado | Aprobado | Aprobado | Formulario lineal en móvil y ayuda en orden correcto. |
| `/login` | Aprobado | Aprobado | Aprobado | Aprobado | Formulario prioritario y controles completos. |
| `/acceso-denegado` | Aprobado | Aprobado | Aprobado | Aprobado | Mensaje y acciones contenidos. |
| `/sin-permisos` | Corregido | Aprobado | Aprobado | Aprobado | CTA principal elevado a 44 px. |
| `/dashboard` | Corregido | Aprobado | Aprobado | Aprobado | Acciones de cards elevadas a 44 px. |
| `/dashboard/solicitudes` | Aprobado | Aprobado | Corregido | Aprobado | Cards conservadas hasta `xl`. |
| `/dashboard/solicitudes/[id]` | Aprobado | Aprobado | Aprobado | Aprobado | Resumen, paneles y metadata sin overflow. |
| `/dashboard/pedidos` | Aprobado | Aprobado | Corregido | Aprobado | Cards hasta `xl`; tabla desktop con scroll interno controlado. |
| `/dashboard/pedidos/nuevo` | Corregido | Aprobado | Aprobado | Aprobado | Acción de regreso elevada a 44 px. |
| `/dashboard/pedidos/[id]` | Corregido | Aprobado | Aprobado | Aprobado | Enlaces de metadata con área táctil de 44 px. |
| `/dashboard/clientes` | Aprobado | Aprobado | Corregido | Aprobado | Cards conservadas hasta `xl`. |
| `/dashboard/clientes/nuevo` | Corregido | Aprobado | Aprobado | Aprobado | Acción de regreso elevada a 44 px. |
| `/dashboard/clientes/[id]` | Aprobado | Aprobado | Aprobado | Aprobado | Secciones y textos largos contenidos. |
| `/dashboard/clientes/[id]/editar` | Corregido | Aprobado | Aprobado | Aprobado | Acción de regreso elevada a 44 px. |
| `/dashboard/usuarios` | Aprobado | Aprobado | Corregido | Aprobado | Cards conservadas hasta `xl`. |
| `/dashboard/usuarios/nuevo` | Aprobado | Aprobado | Aprobado | Aprobado | Formulario apilado y controles legibles. |
| `/dashboard/usuarios/[id]` | Corregido | Aprobado | Aprobado | Aprobado | Enlace de avatar con área táctil de 44 px. |
| `/dashboard/usuarios/[id]/editar` | Aprobado | Aprobado | Aprobado | Aprobado | Campos y acciones sin desbordamiento. |
| `/dashboard/configuracion` | Aprobado | Aprobado | Aprobado | Aprobado | Contenido estable en los cuatro tamaños. |

## 3. Hallazgos

### Corregidos

- Los listados cambiaban a tabla desde 1024 px, aunque el sidebar dejaba un
  ancho útil insuficiente. Las cards permanecen ahora visibles hasta `xl`.
- Varias acciones de dashboard, formularios y permisos medían 36–40 px. Se
  normalizaron a un mínimo de 44 px.
- Los enlaces de cliente, solicitud y avatar dentro de metadata tenían un área
  clicable limitada a la línea de texto. Ahora alcanzan 44 px de alto.

### Pendientes

- La comprobación con dispositivos físicos, zoom al 200 %, lector de pantalla y
  perfil supervisor queda para la revisión final 14.11.

### No aplican

- No faltaron rutas ni datos para los detalles auditados con admin.
- No fue necesario modificar lógica, consultas, permisos, acciones ni
  contratos de formulario.

## 4. Correcciones realizadas

- `InternalSolicitudesList.tsx`, `InternalPedidosList.tsx`,
  `InternalClientesList.tsx` e `InternalUsersList.tsx`: transición
  cards/tabla movida de `lg` a `xl`.
- `DashboardWorkPanels.tsx` y `DashboardRecentActivity.tsx`: acciones con
  altura mínima de 44 px.
- Páginas de alta de pedido y cliente, edición de cliente y
  `/sin-permisos`: enlaces de regreso con altura mínima de 44 px.
- `InternalPedidoDetail.tsx` e `InternalUserDetail.tsx`: enlaces de metadata
  con área táctil ampliada.

## 5. Riesgos o decisiones

- La tabla de pedidos conserva scroll horizontal interno en desktop porque sus
  columnas operativas no deben comprimirse hasta perder legibilidad. Este
  scroll está contenido en la tarjeta y no produce overflow global.
- No se cambió la visibilidad por rol ni se añadieron variantes cliente para
  resolver responsive.
- No se hicieron cambios de negocio ni refactorizaciones estructurales.

## 6. Resultado

Las rutas revisadas no presentan scroll horizontal global en 375 × 812,
768 × 1024, 1024 × 768 ni 1440 × 1000. La navegación móvil sigue siendo
operable, los listados mantienen una alternativa de cards en anchos reducidos y
las acciones operativas principales alcanzan al menos 44 px. Admin y trabajador
conservan su navegación y contenido correspondientes.
