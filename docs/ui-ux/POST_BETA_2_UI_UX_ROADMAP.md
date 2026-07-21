# Roadmap de Rediseño UI/UX posterior a Beta 2

**Proyecto:** Sistema Web de Gestión para Godel Diseño
**Repositorio:** `godel-design`
**Documento:** Roadmap de rediseño y consolidación UI/UX posterior a Beta 2
**Estado:** Cerrado
**Versión:** 1.0
**Fecha:** 10 de julio de 2026

---

## 1. Propósito del documento

Este documento define el plan oficial de trabajo para el rediseño, consolidación y cierre visual del sistema web de gestión de Godel Diseño después de la estabilización arquitectónica alcanzada en Beta 2.

El objetivo no es reconstruir la aplicación ni modificar nuevamente sus fundamentos funcionales. El sistema ya dispone de los módulos principales, permisos, reglas de negocio, servicios, almacenamiento privado y pruebas por dominio.

Esta iniciativa busca transformar la interfaz existente en una experiencia interna:

* clara;
* operativa;
* consistente;
* responsive;
* accesible;
* mantenible;
* visualmente profesional;
* preparada para el uso real de la empresa.

El roadmap organiza el trabajo visual en etapas pequeñas, revisables y progresivas, evitando introducir cambios masivos sin una arquitectura de interfaz previamente definida.

---

## 2. Relación con el roadmap funcional

Este documento complementa, pero no reemplaza, el roadmap funcional principal:

```text
docs/development/ROADMAP.md
```

El roadmap funcional conserva el historial oficial de las fases de implementación del producto:

* base del proyecto;
* Supabase;
* autenticación;
* permisos;
* solicitudes;
* clientes;
* pedidos;
* personal;
* archivos;
* comentarios;
* usuarios;
* dashboard;
* pulido visual inicial;
* seguridad y despliegue.

Las fases funcionales completadas no se consideran reabiertas.

El presente documento gobierna exclusivamente la evolución UI/UX posterior a Beta 2.

Por tanto:

* una funcionalidad puede estar terminada desde el punto de vista del dominio;
* su interfaz puede seguir pendiente de rediseño o consolidación;
* los cambios visuales no deben alterar contratos funcionales sin una decisión arquitectónica explícita.

---

## 3. Contexto de partida

Después de Beta 2, el proyecto dispone de:

* arquitectura server-first con Next.js App Router;
* Route Groups para separar áreas públicas e internas;
* capa de dominio organizada en `src/lib/<dominio>`;
* Server Actions finas;
* DTO seguros;
* permisos por rol;
* Row Level Security;
* Storage privado;
* solicitudes públicas;
* solicitudes internas;
* clientes;
* pedidos;
* tareas;
* asignación de personal;
* pagos internos;
* comentarios;
* historial;
* usuarios;
* dashboard operativo;
* pruebas E2E por dominio;
* Full Visual QA;
* componentes UI reutilizables.

La revisión posterior a Beta 2 detectó que, aunque la base funcional era estable, varias pantallas internas aún presentaban:

* exceso de información simultánea;
* jerarquía visual débil;
* tablas demasiado anchas;
* formularios extensos dentro del flujo principal;
* diferencias visuales entre módulos;
* detalles internos poco orientados al trabajo diario;
* inconsistencias en responsive;
* estados de carga y error poco especializados;
* oportunidades de mejora en navegación y accesibilidad.

El rediseño se plantea como una evolución progresiva sobre la arquitectura existente.

---

## 4. Principios obligatorios

### 4.1 Preservar el dominio

El rediseño no debe modificar sin necesidad:

* reglas de negocio;
* permisos;
* RLS;
* RPC;
* Storage;
* Server Actions;
* servicios;
* estados de dominio;
* contratos de formularios;
* rutas públicas;
* URLs internas;
* referencias públicas;
* trazabilidad.

### 4.2 Server-first

Las páginas y la carga de datos continúan siendo Server Components siempre que sea posible.

Los Client Components deben limitarse a interacciones reales como:

* formularios;
* dialogs;
* toolbars adaptativas;
* navegación activa;
* control de paneles;
* estados locales de interfaz.

### 4.3 Claridad antes que abstracción

No se crearán componentes universales excesivamente configurables.

Se compartirán:

* primitivas;
* marcos;
* comportamientos;
* estados;
* patrones responsive.

Se mantendrán específicos por dominio:

* filas;
* tarjetas;
* jerarquías;
* acciones;
* paneles;
* formularios.

### 4.4 Responsive desde la composición

El responsive no se resolverá comprimiendo versiones de escritorio.

Cada pantalla debe definir:

* qué información es prioritaria;
* qué puede ocultarse;
* qué pasa a un panel;
* qué cambia de tabla a tarjeta;
* qué conserva scroll documental;
* qué usa scroll interno;
* qué acciones deben permanecer accesibles.

### 4.5 Accesibilidad funcional

Cada etapa debe considerar:

* jerarquía correcta de headings;
* nombres accesibles;
* navegación con teclado;
* foco visible;
* retorno de foco;
* `aria-current`;
* `aria-labelledby`;
* mensajes de error y éxito;
* target mínimo de interacción;
* ausencia de dependencia exclusiva del color.

### 4.6 Sin optimización prematura

No se modificarán consultas, bundles o estrategias de carga únicamente por intuición.

La optimización se realizará después de medir:

* tiempos;
* bundle;
* navegación;
* consultas;
* render;
* serialización;
* carga cliente.

### 4.7 Evidencia antes de cerrar

Una etapa no se considera cerrada únicamente porque compile.

Según el alcance, deben existir:

* revisión de código;
* `diff:check`;
* lint;
* build;
* pruebas E2E focales;
* revisión responsive;
* accesibilidad;
* screenshots;
* documentación actualizada.

---

## 5. Estado general de las etapas

| Etapa | Nombre                                       | Estado    |
| ----- | -------------------------------------------- | --------- |
| 0     | Auditoría posterior a Beta 2                 | Cerrada   |
| 1     | Reorganización mediante Route Groups         | Cerrada   |
| 2     | Sistema local de iconos                      | Cerrada   |
| 3     | Especificación de los workspaces             | Cerrada   |
| 4     | Primitivas compartidas de workspace          | Cerrada   |
| 5     | Workspace de Pedidos                         | Cerrada   |
| 6     | Workspace de Solicitudes                     | Cerrada   |
| 7     | Integración del shell interno                | Cerrada   |
| 8     | Arquitectura común de listados               | Cerrada   |
| 9     | Listados operativos de Pedidos y Solicitudes | Cerrada   |
| 10    | Listados administrativos                     | Cerrada   |
| 11    | Dashboard operativo                          | Cerrada   |
| 12    | Formularios internos y páginas secundarias   | Cerrada   |
| 13    | Área pública                                 | Cerrada |
| 14    | Estados transversales y resiliencia UI       | Cerrada |
| 15    | Optimización basada en mediciones            | Cerrada |
| 16    | QA integral y cierre del rediseño            | Cerrada |

---

# 6. Etapas cerradas

## Etapa 0 — Auditoría posterior a Beta 2

Estado: Completado.

### Objetivo

Analizar el estado real del proyecto antes del rediseño y determinar qué partes podían modificarse sin romper la arquitectura estabilizada.

### Resultados

* Inventario de rutas y pantallas.
* Clasificación entre áreas públicas, internas y transversales.
* Revisión de componentes.
* Revisión de límites Server/Client.
* Revisión de permisos.
* Revisión de Storage.
* Identificación de deuda visual.
* Identificación de riesgos de sobreingeniería.
* Definición del orden inicial del rediseño.

### Documento principal

```text
docs/ui-ux/AUDITORIA_POST_BETA_2_PRE_REDISENO.md
```

### Estado

Cerrada.

---

## Etapa 1 — Reorganización mediante Route Groups

### Objetivo

Separar estructuralmente las rutas públicas e internas sin modificar sus URLs.

### Resultado

```text
src/app/
├── (publico)/
└── (interno)/
```

Se conservaron:

* URLs;
* actions;
* route handlers;
* permisos;
* layouts;
* comportamiento funcional.

### Estado

Cerrada.

---

## Etapa 2 — Sistema local de iconos

### Objetivo

Establecer una infraestructura consistente de iconos para navegación, acciones y workspaces.

### Resultado

* Integración de Lucide.
* Catálogos controlados.
* Iconos decorativos con semántica correcta.
* Consistencia de tamaños y `strokeWidth`.
* Ausencia de dependencias visuales externas.

### Estado

Cerrada.

---

## Etapa 3 — Especificación de los workspaces

### Objetivo

Definir cómo debían evolucionar los detalles internos de Pedidos y Solicitudes desde páginas largas de formularios hacia superficies operativas.

### Resultado

Se definieron:

* cabeceras compactas;
* contenido permanente;
* action rail;
* toolbar tablet;
* barra móvil;
* selector Más;
* dialog contextual;
* modos `scroll` y `fill`;
* matrices por rol;
* acciones prioritarias;
* reglas de foco;
* comportamiento responsive.

### Documento principal

```text
docs/ui-ux/WORKSPACE_INTERACTION_SPEC.md
```

### Estado

Cerrada.

---

## Etapa 4 — Primitivas compartidas de workspace

### Objetivo

Implementar la infraestructura reutilizable para Pedidos y Solicitudes.

### Componentes principales

```text
src/components/workspace/
├── WorkspaceShell.tsx
├── WorkspaceController.tsx
├── WorkspaceActionRail.tsx
├── WorkspaceTabletToolbar.tsx
├── MobileWorkspaceBar.tsx
├── WorkspaceContextDialog.tsx
├── WorkspaceActionTrigger.tsx
├── WorkspaceIcon.tsx
├── workspace-context.tsx
├── workspace-action-presentation.ts
└── types.ts
```

### Resultado

* Un solo dialog contextual.
* Retorno de foco.
* Selector Más sin dialogs anidados.
* Action rail desktop.
* Toolbar tablet adaptativa.
* Barra inferior móvil.
* Badges.
* Tonos de estado.
* Nombres accesibles.
* Modos de contenido.
* Soporte para workspaces contenidos.

### Estado

Cerrada.

---

## Etapa 5 — Workspace de Pedidos

### Objetivo

Transformar el detalle de Pedido en una superficie operativa orientada al trabajo diario.

### Resultado

* Cabecera compacta.
* Diferenciación entre `encargo` e `impresion`.
* Vista rápida de tareas.
* Vista rápida de archivos.
* Action rail.
* Paneles de Estado, Tareas, Archivos, Comentarios, Personal, Pagos, Historial e Información.
* Comentarios con composer fijo.
* Archivos con descarga y subida controladas.
* Flujos por rol.
* Responsive desktop, tablet y móvil.
* QA funcional y visual.

### Estado

Cerrada.

---

## Etapa 6 — Workspace de Solicitudes

### Objetivo

Transformar el detalle de Solicitud en una superficie operativa centrada en revisión, cliente y conversión.

### Resultado

* Cabecera compacta.
* Referencia pública copiable.
* Contenido permanente de descripción, contacto y archivos.
* Action rail.
* Paneles de Estado, Cliente, Conversión, Archivos, Comentarios, Historial e Información.
* Cliente asociado con señal `success`.
* Conversión defensiva.
* Comentarios con composer fijo.
* Descargas privadas.
* Workflows `encargo` e `impresion`.
* Estados aprobada, rechazada y convertida.
* Responsive desktop, tablet y móvil.
* QA por rol.
* Full Visual QA.

### Estado

Cerrada.

---

## Etapa 7 — Integración del shell interno

### Estado

Cerrada.

### Objetivo

Consolidar el marco global que envuelve toda el área interna.

### Alcance

* `DashboardLayout`;
* sidebar de escritorio;
* navegación móvil;
* navegación activa;
* skip link;
* ancho máximo;
* paddings;
* altura;
* scroll;
* convivencia con workspaces;
* visibilidad por rol.

### Tipos de página

#### Flujo normal

* Dashboard.
* Listados.
* Formularios.
* Detalles secundarios.
* Configuración.

Estas páginas utilizan scroll documental natural.

#### Workspace contenido

* Detalle de Pedido.
* Detalle de Solicitud.

Estas páginas utilizan altura contenida en escritorio y scroll interno controlado.

### Subetapas propuestas

#### 7.1 Auditoría y especificación

Crear:

```text
docs/ui-ux/INTERNAL_SHELL_SPEC.md
```

Definir:

* estructura;
* breakpoints;
* page modes;
* scroll;
* ancho;
* padding;
* navegación;
* accesibilidad;
* roles.

#### 7.2 Shell desktop

Revisar:

* sidebar;
* scroll independiente;
* navegación activa;
* logout;
* ancho del contenido;
* integración con workspaces.

#### 7.3 Shell tablet y móvil

Revisar:

* menú global;
* toolbar contextual;
* barra móvil;
* safe area;
* superposiciones;
* teclado;
* foco.

#### 7.4 Integración de modos de página

Comprobar que:

* páginas normales pueden crecer;
* workspaces permanecen contenidos;
* no existen reglas globales de `overflow-hidden`;
* no aparece doble scroll.

#### 7.5 Accesibilidad

Validar:

* skip link;
* orden de tabulación;
* `aria-current`;
* foco visible;
* rutas por rol;
* navegación con teclado.

#### 7.6 QA y cierre

Probar el shell completo en todos los breakpoints y roles.

### Criterio de cierre

* shell server-first;
* navegación correcta por rol;
* ruta activa correcta;
* skip link funcional;
* ausencia de doble scroll;
* ausencia de overflow horizontal;
* workspaces y páginas normales conviven correctamente;
* QA responsive y accesible aprobado.

---

# 7. Etapas activas y pendientes

## Etapa 8 — Arquitectura común de listados

### Objetivo

Definir una arquitectura visual y técnica compartida para los listados internos antes de rediseñar cada dominio.

### Estado

Cerrada.

### Listados incluidos en la auditoría

* Solicitudes.
* Pedidos.
* Clientes.
* Usuarios.
* Plantillas de tareas.
* Listados secundarios dentro de detalles.

### Problemas a resolver

* exceso de columnas;
* scroll horizontal;
* jerarquía visual débil;
* filtros poco visibles;
* ausencia de resumen de resultados;
* acciones repetitivas;
* tarjetas móviles densas;
* diferencias entre dominios;
* estados vacíos inconsistentes.

### Composición conceptual

```text
Página de listado
├── Cabecera
│   ├── título
│   ├── descripción
│   ├── total de registros
│   └── acción primaria opcional
├── Toolbar
│   ├── búsqueda
│   ├── filtros
│   ├── filtros activos
│   └── limpiar filtros
├── Resultados
│   ├── resumen
│   ├── tabla o filas desktop
│   ├── tarjetas móviles
│   └── estados vacío/error
└── Navegación
    └── paginación cuando se justifique
```

### Primitivas candidatas

```text
InternalListPageHeader
ListToolbar
ResultsSummary
ActiveFilters
DataTableFrame
MobileRecordCard
ListEmptyState
Pagination
```

Los nombres definitivos se decidirán después de la auditoría.

### Restricciones

* No crear una DataTable universal excesivamente configurable.
* No convertir las páginas completas en Client Components.
* Mantener búsqueda y filtros server-side.
* No introducir paginación sin necesidad real.
* Mantener filas y tarjetas específicas por dominio.

### Entregables

```text
docs/ui-ux/INTERNAL_LISTINGS_SPEC.md
```

Posibles componentes comunes dentro de:

```text
src/components/listing/
```

### Criterio de cierre

Existe un contrato documentado y probado para construir los listados operativos y administrativos sin duplicación innecesaria.

### Decisiones documentadas en Etapa 8

* búsqueda compacta;
* filtros compactos;
* chips de filtros activos;
* filas y cards clicables;
* columnas reducidas;
* URL con `searchParams`.

La Etapa 9 aplicará este patrón a Pedidos y Solicitudes. La Etapa 10 aplicará el mismo patrón a Clientes, Usuarios y Configuración / plantillas.

---

## Etapa 9 — Listados operativos de Pedidos y Solicitudes

### Estado

Cerrada.

### Objetivo

Rediseñar los dos listados más importantes para la operación diaria.

---

### 9.1 Listado de Pedidos

Estado: Completado.

Debe aplicar la estructura final definida en la especificación de listados:

```text
Pedido | Trabajo | Estado | Pago | Entrega
```

La columna `Pedido` muestra `order_number`. No muestra UUIDs ni referencias internas cortas. El tipo de flujo puede reflejarse mediante color/acento, azul para encargo y naranja para impresión, siempre con texto accesible y nunca solo con color.

La columna `Trabajo` muestra el título del pedido y una descripción breve. La columna `Estado` usa badge. La columna `Pago` usa badge. La columna `Entrega` muestra la fecha estimada de entrega y debe llamarse `Entrega`, no `Entrega estimada`.

Prioridad, progreso, personal, cliente y alertas operativas no son columnas base del listado. Esos datos viven en el workspace del pedido o pueden aparecer solo como señales secundarias puntuales si se justifican durante la Etapa 9.

### Jerarquía orientativa

```text
P-26-0347 · Encargo
Título del pedido · descripción breve
[En producción] [Pago parcial]
Entrega: 18 jul
```

### Casos destacados

* pedido atrasado;
* sin personal;
* tareas pendientes;
* pago pendiente;
* impresión directa;
* pedido cerrado;
* errores parciales.

### Responsive

* escritorio: tabla o filas enriquecidas;
* laptop: reducción de columnas;
* tablet: filas compactas;
* móvil: tarjetas operativas.

---

### 9.2 Listado de Solicitudes

Estado: Completado.

Debe aplicar la estructura final definida en la especificación de listados:

```text
Cliente | Contacto | Servicio | Estado | Recibida
```

La columna `Cliente` muestra el nombre de quien envía la solicitud. La columna `Contacto` muestra el teléfono principal; el email puede mostrarse como texto secundario discreto si existe.

La columna `Servicio` muestra el servicio solicitado y también debe reflejar encargo/impresión con color/acento y texto accesible. La columna `Estado` usa badge. La columna `Recibida` usa `created_at`.

`desired_date` no es columna principal. Referencia pública, asociación de cliente y disponibilidad de conversión tampoco son columnas base del listado. Esos datos viven en el workspace de la solicitud o pueden aparecer solo como señales secundarias justificadas.

### 9.3 QA y cierre de listados operativos

Estado: Completado.

Pedidos y Solicitudes quedan validados en conjunto con el patrón común de `ListingPageHeader`, `ListingToolbar`, filas/cards clicables, columnas reducidas y `WorkflowTypeBadge` común.

### Casos destacados

* pendiente de revisión;
* aprobada sin cliente;
* lista para convertir;
* rechazada;
* convertida;
* archivos recibidos;
* error parcial.

### Criterio de cierre

Pedidos y Solicitudes pueden gestionarse desde sus listados con una jerarquía clara, sin tablas desproporcionadas y con navegación directa a sus workspaces.

---

## Etapa 10 — Listados administrativos

### Estado

Cerrada.

### Objetivo

Reorganizar y rediseñar las superficies administrativas internas, manteniendo Clientes como módulo propio y moviendo Usuarios y Plantillas bajo Configuración.

### 10.1 Plan técnico

Estado: Completado.

Documento:

```text
docs/ui-ux/ADMIN_CONFIG_STAGE_10_PLAN.md
```

### 10.2 Clientes

Estado: Cerrado.

Columnas finales:

```text
Cliente | Teléfono | Correo electrónico | Creación | Actualización
```

Subtareas:

* 10.2.1 Listado de Clientes — Completado.
* 10.2.2 Detalle de Cliente limpio — Completado.
* 10.2.3 Pedidos vinculados en Cliente — Completado.
* 10.2.4 QA de Clientes — Completado.

Priorizar:

* listado con patrón común;
* fila/card clicable hacia detalle;
* detalle más limpio;
* eliminación de textos redundantes;
* identificador interno completo;
* pedidos vinculados al cliente;
* creación y edición existentes.

### 10.3 Configuración hub

Estado: Completado.

Priorizar:

* `/dashboard/configuracion` se convierte en hub;
* muestra acceso a Usuarios;
* muestra acceso a Plantillas;
* cada opción se presenta como card/list item clicable;
* no es un dashboard analítico;
* admin-only.

### 10.4 Usuarios dentro de Configuración

Estado: Cerrado.

Subtareas:

* 10.4.1 Listado de Usuarios dentro de Configuración — Completado.
* 10.4.2 Creación y edición de Usuarios en Configuración — Completado.
* 10.4.3 Limpieza de navegación y rutas legacy de Usuarios — Completado.
* 10.4.4 Eliminación definitiva de legacy y QA de Usuarios — Completado.

Ruta final:

```text
/dashboard/configuracion/usuarios
```

Columnas finales:

```text
Usuario | Rol | Teléfono | Estado | Creación | Actualización
```

Priorizar:

* usuario con avatar/iniciales, nombre y UUID completo;
* rol;
* teléfono;
* estado;
* no mostrar email;
* fila/card abre edición directamente;
* creación en `/dashboard/configuracion/usuarios/nuevo`;
* edición en `/dashboard/configuracion/usuarios/[id]/editar`;
* rutas legacy de Usuarios eliminadas;
* Usuarios eliminado como entrada principal del sidebar.

### 10.5 Plantillas dentro de Configuración

Estado: Cerrado.

Subtareas:

* 10.5.1 Listado de Plantillas dentro de Configuración — Completado.
* 10.5.2 Workspace de gestión de Plantilla — Completado.
* 10.5.3 Reestructuración del workspace de Plantilla — Completado.
* 10.5.4 QA y cierre de Plantillas — Completado.

Ruta final:

```text
/dashboard/configuracion/plantillas
```

Columnas finales:

```text
Plantilla | Descripción | Estado | Tareas | Creación | Actualización
```

Priorizar:

* listado con buscador;
* sin filtros por ahora;
* sin workflow;
* fila/card abre gestión de plantilla;
* creación en `/dashboard/configuracion/plantillas/nueva`;
* gestión de tareas en `/dashboard/configuracion/plantillas/[id]`;
* edición de datos y estado en `/dashboard/configuracion/plantillas/[id]/editar`.

### 10.6 Limpieza y cierre

Estado: Completado.

Priorizar:

* eliminar rutas legacy de usuarios al cierre;
* actualizar sidebar;
* actualizar permisos de rutas sin cambiar matriz de permisos;
* actualizar tests;
* QA responsive y por rol.
* 10.6 Limpieza y cierre — Completado.

### Criterio de cierre

Clientes, Usuarios y Plantillas quedaron integrados en una estructura consistente; Configuración funciona como hub admin-only; Usuarios dejó de ser entrada principal del sidebar; Plantillas tiene listado, creación, workspace de tareas y edición separada; no se modificaron permisos, RLS ni modelo de datos.

---

## Etapa 11 — Dashboard operativo

### Estado

Completada.

### Objetivo

Reorganizar el dashboard para que cada rol identifique rápidamente qué necesita atención y cuál es su siguiente acción.

La Etapa 11 transforma el dashboard desde una página vertical larga hacia un workspace operativo. Los pedidos activos pasan a ser el foco principal y la información secundaria se mueve a paneles.

### Documento principal

```text
docs/ui-ux/DASHBOARD_WORKSPACE_STAGE_11_PLAN.md
```

### Subtareas

* 11.1 Plan técnico del Dashboard Workspace — Completado.
* 11.2 Contrato de datos del dashboard — Completado.
* 11.3 Shell del Dashboard Workspace — Completado.
* 11.3.1 Alineación real con patrón Workspace — Completado.
* 11.4 Tablero principal de pedidos — Completado.
* 11.4.1 Compactación visual del tablero y filtro Nuevo — Completado.
* 11.4.2 Scroll natural, rail fijo y ajuste visual de cards — Completado.
* 11.5 Paneles laterales — Completado.
  Nota: Los paneles de solicitudes pendientes, pedidos listos, historial y resumen quedaron dentro del sistema Workspace; los iconos del dashboard fueron especializados.
* 11.5.1 Corrección visual y datos de paneles — Completado.
* 11.5.2 Badge total y hover de cards en paneles — Completado.
* 11.6 Variante trabajador — Completado.
* 11.7 QA y cierre — Completado.

### Decisiones iniciales de workspace

* Pedidos nuevos incluye `creado` y `solicitud_recibida`.
* El área principal se organiza en Nuevos, En revisión y En producción.
* Pedidos listos para entrega, estado `listo_entrega`, se mueven a panel lateral.
* El orden de paneles laterales es Atención operativa, Solicitudes pendientes, Pedidos listos para entrega, Historial y Resumen operativo.
* Historial conserva origen `pedido` / `solicitud` y pasa a usar navegación icon-only con nombre accesible.
* No se introducen gráficos innecesarios, analítica avanzada, cambios de RLS ni cambios de permisos.

### Admin y supervisor

Jerarquía conceptual:

```text
Cabecera
Indicadores principales
Atención requerida
Trabajo activo
Actividad reciente
Accesos rápidos
```

Debe facilitar:

* solicitudes pendientes;
* solicitudes listas para convertir;
* pedidos sin personal;
* pedidos atrasados;
* tareas bloqueantes;
* pagos pendientes;
* entregas próximas;
* actividad reciente.

### Trabajador

Jerarquía conceptual:

```text
Mi trabajo asignado
Pedidos que requieren acción
Próximas entregas
Progreso de pedidos
Actividad reciente
```

No debe recibir información global innecesaria.

### Restricciones

* No convertir el dashboard en una solución de analítica avanzada.
* No introducir gráficos sin una utilidad operativa clara.
* No implementar reportes fuera de alcance.
* Mantener datos permitidos por RLS.

### Criterio de cierre

El dashboard quedó reorganizado como workspace operativo centrado en pedidos activos, con paneles contextuales para atención, solicitudes, entregas, historial y resumen. La vista diferencia admin/supervisor y trabajador, conserva permisos/RLS existentes, usa el patrón Workspace validado y queda documentada mediante reporte QA de Etapa 11.

---

## Etapa 12 — Formularios internos y páginas secundarias

Estado: Completado.

### Objetivo

Consolidar la experiencia de formularios internos y páginas secundarias que no forman parte de listados principales, dashboard operativo ni área pública.

La decisión principal de esta etapa es avanzar hacia un enfoque modal-first: las acciones internas de crear y editar deben abrirse preferentemente como dialog o drawer contextual cuando sea técnicamente razonable. En 12.8.2 las rutas fallback de crear/editar se retiran durante el desarrollo y los dialogs contextuales quedan como flujo oficial.

Documento principal:

```text
docs/ui-ux/INTERNAL_FORMS_STAGE_12_PLAN.md
```

### Subtareas

* 12.1 Auditoría y especificación de formularios internos — Completado.
* 12.2 Primitivas comunes de formularios internos — Completado.
* 12.3 Clientes: crear/editar en dialog/drawer — Completado.
* 12.4 Usuarios: crear/editar en dialog/drawer — Completado.
* 12.5 Pedido manual: formulario compacto contextual — Completado.
* 12.6 Configuración/plantillas: formularios compactos — Completado.
* 12.7 Formularios operativos en workspaces/paneles — Completado.
* 12.7.1 Pedidos: formularios operativos en paneles — Completado.
* 12.7.2 Solicitudes: formularios operativos en paneles — Completado.
* 12.8 Pantallas internas transversales — Completado.
* 12.8.1 Auditoría de pantallas internas transversales — Completado.
* 12.8.2 Retiro de fallbacks obsoletos y not-found interno — Completado.
* 12.8.2.1 Limpieza de lógica heredada de fallbacks eliminados — Completado.
* 12.8.2.2 Ajuste de flujo de usuario y tipos estrictos — Completado.
* 12.8.2.3 Eliminación de componentes legacy inline de plantillas — Completado.
* 12.9 QA y cierre — Completado.

### Alcance

#### Clientes

* nuevo cliente;
* detalle;
* edición;
* relaciones con solicitudes;
* relaciones con pedidos.

#### Usuarios

* nuevo perfil;
* detalle;
* edición;
* roles;
* estado;
* restricciones del último administrador.

#### Pedidos

* creación manual.

#### Configuración

* detalle de plantilla;
* tareas de plantilla;
* formularios asociados.

#### Formularios operativos en workspaces

* estado de pedido;
* pagos;
* asignación de personal;
* tareas de pedido;
* aplicación de plantillas;
* comentarios;
* archivos;
* estado de solicitud;
* asociación de cliente;
* conversión de solicitud a pedido.

#### Pantallas internas transversales

* acceso denegado;
* sin permisos;
* páginas vacías;
* acciones de regreso;
* cabeceras;
* breadcrumbs cuando aporten valor.

### Aspectos a revisar

* ancho de formularios;
* agrupación por secciones;
* jerarquía;
* botones;
* ayudas;
* errores;
* mensajes de éxito;
* responsive;
* navegación de regreso;
* confirmaciones.

### Restricciones

* No borrar rutas existentes de golpe salvo decisión explícita de etapa, como el retiro de fallbacks obsoletos en 12.8.2.
* Mantener los componentes y Server Actions reutilizados por dialogs aunque se retiren rutas fallback.
* No romper Server Actions.
* Corrección 12.8.2.1: las Server Actions de crear/editar se reubicaron en módulos estables del área correspondiente y se retiraron props/ramas visuales heredadas de página completa.
* Corrección 12.8.2.2: la creación de usuarios ya no redirige a `/editar`; el dialog maneja éxito/cierre/refresco y `TaskTemplateForm` no acepta props desconocidas.
* Corrección 12.8.2.3: los componentes legacy inline `TaskTemplatesList` y `TaskTemplatesSection` fueron eliminados; plantillas usa el listado interno y dialogs contextuales.
* No cambiar permisos, RLS, RPCs, Storage ni modelo de datos.
* No convertir formularios largos en modales pequeños.
* En mobile, usar drawer o full-screen modal cuando el contenido lo requiera.
* Mantener inline los formularios operativos que dependen del contexto permanente del workspace.
* Excluir formularios públicos, login y consulta pública de estado; pertenecen a Etapa 13.

### Criterio de cierre

Los formularios internos siguen una estrategia consistente: crear/editar corto se resuelve de forma contextual mediante dialogs, los formularios largos usan drawer amplio o superficie contextual adecuada, las acciones operativas permanecen cerca del contexto de trabajo y todas las superficies conservan accesibilidad, responsive, permisos y seguridad.

---

## Etapa 13 — Consolidación del área pública

### Estado

Completada.

### Objetivo

Alinear visualmente las pantallas públicas con la calidad alcanzada en el área interna.

La decisión principal de esta etapa es separar visualmente tres zonas sin mover
URLs: área pública para clientes, puerta interna en `/login` y área interna
autenticada en `/dashboard/**`. El login conserva la URL `/login`, pero debe
tratarse como acceso interno, no como página pública de marketing.

Documento principal:

```text
docs/ui-ux/PUBLIC_AREA_STAGE_13_PLAN.md
```

### Alcance

* página principal;
* formulario público de solicitud;
* consulta de estado;
* login como puerta interna;
* 404 pública;
* cabecera pública;
* estados de éxito y error;
* responsive.

### Subtareas

* 13.1 Auditoría y especificación de separación pública / login / interna — Completado.
* 13.2 Marco público y puerta interna — Completado.
* 13.3 Home pública — Completado.
  Nota: 13.3.2 refinó la home hacia una identidad pública más luminosa sin cambiar rutas ni ampliar alcance público.
  Nota: 13.3.3 reforzó azul como protagonista visual, header/footer de marca e iconos SVG sociales sin avanzar subtareas posteriores.
  Nota: 13.3.4 dejó el header sticky, extrajo el footer público reutilizable y limpió el hero moviendo el proceso a sección propia.
* 13.4 Solicitud pública — Completado.
* 13.5 Consulta pública de estado — Completado.
* 13.6 404 pública y estados públicos — Completado.
* 13.7 QA responsive y accesibilidad pública — Completado.
* 13.8 Cierre de Etapa 13 — Completado.

### Restricciones

* No convertir el proyecto en catálogo.
* No añadir carrito.
* No añadir pagos.
* No crear panel de cliente.
* No ampliar datos públicos.
* No cambiar Server Actions.
* No cambiar RLS.
* No cambiar Storage.
* No cambiar permisos.
* No tocar lógica de dominio.
* No mover rutas en esta etapa sin decisión explícita.
* Mantener tracking mínimo y seguro.

### Criterio de cierre

La entrada pública al sistema presenta una experiencia clara, profesional,
segura y coherente con la identidad visual general; `/login` funciona como
puerta interna separada de la navegación pública; `/estado` conserva el DTO
público mínimo; no se introducen catálogo, carrito, pagos, panel de cliente ni
datos públicos adicionales; y el área pública no enlaza visualmente al login.

---

## Etapa 14 — Estados transversales y resiliencia UI

### Estado

Cerrada.

### Objetivo

Especializar los estados de transición, error y ausencia de datos en toda la aplicación.

Documento principal:

```text
docs/ui-ux/TRANSVERSAL_STATES_STAGE_14_PLAN.md
```

### Alcance

* `loading.tsx`;
* `error.tsx`;
* `not-found.tsx` por segmento cuando aporte valor;
* pending;
* skeletons;
* errores parciales;
* estados vacíos;
* reintentos;
* confirmaciones;
* mensajes de éxito;
* errores de acciones;
* degradación segura.

### Principios

* No añadir skeletons donde no mejoren la experiencia.
* No ocultar errores parciales.
* No reemplazar errores útiles por mensajes genéricos.
* Diferenciar error de permisos, error de red, ausencia y recurso inexistente.
* Mantener los datos ya disponibles cuando una carga secundaria falle.

### Subtareas

* 14.1 Auditoría de estados transversales — Completado.
* 14.2 Matriz de estados y decisiones UI — Completado.
* 14.3 App Router states por segmento — Completado.
* 14.4 Estados vacíos y sin resultados — Completado.
* 14.5 Errores de datos y retry seguro — Completado.
* 14.6 Pending y action feedback — Completado.
* 14.7 Fallos parciales en dashboard y workspaces — Completado.
* 14.8 Permisos, acceso denegado y recurso inexistente — Completado.
* 14.9 Confirmaciones y acciones destructivas — Completado.
* 14.10 QA y cierre de Etapa 14 — Completado.

### Nota de auditoría 14.1

La auditoría confirmó que no existen `loading.tsx`, `error.tsx` ni
`global-error.tsx` segmentados; sí existen 404 pública, 404 interna, páginas de
acceso denegado y sin permisos, `EmptyState`, `Alert`, pending states extendidos
con `useActionState`, fallos parciales en workspaces/dashboard y degradación
segura en la solicitud pública cuando fallan archivos adjuntos.

Los problemas principales detectados son falta de estrategia segmentada para
carga/error inicial, ausencia de retry transversal, mezcla de patrones de vacíos
en dashboard, diferencias entre pending de toolbars, confirmaciones destructivas
no normalizadas y fallos parciales resueltos por dominio sin contrato común.

### Nota de implementación 14.2

Se creó `docs/ui-ux/TRANSVERSAL_STATES_DECISION_MATRIX.md` como matriz
documental de decisiones UI. Queda adoptada como contrato base para decidir
entre `loading.tsx`, `error.tsx`, `not-found.tsx`, `EmptyState`, `Alert`,
estado inline, pending, retry, navegación de regreso, confirmación y
conservación de datos parciales antes de implementar las subtareas 14.3 en
adelante.

La matriz separa reglas por zona, retry, skeleton/loading, errores, seguridad y
accesibilidad. Las subtareas futuras permanecen propuestas y no se consideran
implementadas por esta documentación.

### Nota de implementación 14.3

Se implementaron estados App Router segmentados para la entrada operativa
interna y la consulta pública dinámica:

```text
src/app/(interno)/dashboard/loading.tsx
src/app/(interno)/dashboard/error.tsx
src/app/(publico)/estado/loading.tsx
src/app/(publico)/estado/error.tsx
```

Dashboard incorpora fallback de carga y error de render dentro del layout
interno existente, sin duplicar sidebar. `/estado` incorpora fallback de carga y
error público con `PublicHeader currentPage="estado"` y `PublicFooter`. No se
agregaron skeletons globales, componentes genéricos nuevos ni cambios de
Server Actions, RLS, Storage, permisos, DTO público o lógica de dominio.

### Nota de implementación 14.4

Se normalizaron estados vacíos del dashboard sin cambiar dominio ni datos. Los
paneles de solicitudes pendientes y pedidos listos dejaron de usar estado de
búsqueda cuando representan ausencia real, y el tablero de pedidos activos
muestra un único `EmptyState` compacto cuando no existe ningún pedido en sus
grupos. Los listados internos se conservaron porque ya diferencian filtros sin
resultados de ausencia real, y los workspaces mantienen estados inline para
secciones secundarias.

### Nota de implementación 14.5

Se incorporó `ReadErrorAlert` como patrón de retry seguro para errores
controlados de lectura. El retry usa `router.refresh()` con pending visible y
solo aparece cuando `result.reason === "error"`; permisos, acceso denegado,
códigos públicos inválidos, recursos no encontrados, filtros inválidos,
validaciones y mutaciones quedan sin retry. Se aplicó a dashboard, listados
internos principales y error temporal de `/estado`, sin tocar dominio,
servicios, Server Actions, RLS, Storage, permisos ni DTO público.

### Nota de implementación 14.6

Se normalizó el pending y feedback de acciones sin crear componentes nuevos:
pending copy contextual, `aria-busy`, botones deshabilitados, títulos en alerts
de éxito/error, comentarios/archivos/tareas con primitivas existentes, acciones
inline e icon-only con feedback accesible, filtros con estado
`Actualizando resultados...` y chips bloqueados durante transición. La
conversión de solicitud ya no muestra dos éxitos simultáneos. No se agregaron
retry automático, confirmaciones ni cambios de dominio, Server Actions, RLS,
Storage, permisos, queries o DTO público.

### Nota de implementación 14.7

Se consolidaron fallos parciales en dashboard, workspaces de pedidos y
solicitudes, creación manual de pedidos y detalle de plantillas. Las lecturas
secundarias fallidas usan `ReadErrorAlert` con retry solo para
`reason === "error"`, el action rail refleja paneles fallidos, las acciones no
dependientes permanecen disponibles y las acciones que necesitan datos no
cargados se bloquean con explicación localizada. No se modificaron servicios,
Server Actions, permisos, RLS, Storage, queries, DTOs ni lógica de dominio.

### Nota de implementación 14.8

Se alinearon permisos, acceso denegado y recurso inexistente. El proxy conserva
la separación entre `/login`, `/acceso-denegado` y `/sin-permisos`, pero ahora
reescribe rutas internas desconocidas hacia el 404 interno sin cambiar la URL
visible. Las páginas transversales de acceso se validan server-side para evitar
estados imposibles y usan `EmptyState` con un único `h1`, copy seguro, acciones
de regreso y cierre de sesión.

Los Server Components internos clasifican `unauthorized`, `forbidden`,
`invalid_id` y `not_found` antes de mostrar errores de lectura. El 404 interno
evita copy de permisos y el 404 público mantiene solo rutas públicas. En
`/dashboard/pedidos`, trabajadores ven el listado sin cargar clientes ni mostrar
`Nuevo pedido`, porque la creación manual queda como capacidad embebida de
`pedidos.manage`. No se modificaron roles, permisos, RLS, Storage, DTO público,
Server Actions, servicios, queries ni lógica de dominio. La siguiente subtarea
activa es 14.9.

### Nota de implementación 14.9

Se consolidaron confirmaciones inline para eliminaciones permanentes de tareas
de pedido y tareas de plantilla. Ambas muestran el nombre de la tarea, enfocan
`Cancelar` al abrir, permiten cancelar con botón o `Escape`, mantienen el error
de acción dentro de la confirmación, bloquean doble envío durante pending y
muestran feedback success posterior aunque la fila desaparezca por revalidación.

Se conserva `window.confirm` para cerrar dialogs/drawers con cambios sin
guardar. No se añadieron confirmaciones a acciones reversibles o ya explícitas
como mover, editar, completar, reabrir, actualizar progreso, aplicar plantilla,
cambiar estado, actualizar pago, asignar/quitar personal, activar/inactivar o
cerrar workspaces. No se modificaron Server Actions, servicios, permisos, RLS,
Storage, DTO público, queries, rutas ni lógica de dominio. La siguiente subtarea
activa es 14.10.

### Nota de cierre 14.10

La Etapa 14 queda cerrada con QA documentado en:

```text
docs/ui-ux/STAGE_14_QA_CLOSURE.md
```

Resultado final: aprobado. `diff:check`, `verify`, auditorías, Full Visual QA y
suite E2E Chromium serial terminaron con código 0. El resultado final de la
suite serial fue `43 passed`, `3 skipped`, `0 failed`.

Durante el cierre se corrigió únicamente un defecto del harness visual en
`tests/e2e/full-visual-qa.spec.ts`, relacionado con la espera de acciones del
workspace de solicitudes después del loading segmentado. No se modificó código
de aplicación, Server Actions, servicios, permisos, RLS, Storage, DTO público,
queries, rutas ni lógica de dominio.

La etapa siguiente a este cierre fue `Etapa 15 — Optimización basada en
mediciones`, actualmente cerrada.

### Criterio de cierre

La aplicación responde de forma consistente y comprensible ante cargas, errores, resultados vacíos y fallos parciales.

---

## Etapa 15 — Optimización basada en mediciones

### Estado

Cerrada.

### Objetivo

Validar mediante mediciones si existían problemas materiales de rendimiento
antes de introducir optimizaciones.

Documento principal:

```text
docs/performance/PERFORMANCE_STAGE_15_PLAN.md
```

Documentos de cierre:

```text
docs/performance/PERFORMANCE_BASELINE.md
docs/performance/STAGE_15_CLOSURE.md
```

### Resumen

Se estableció una línea base, se ejecutaron experimentos medidos y no se
conservaron optimizaciones de aplicación porque no produjeron una mejora
material. El trabajo adicional queda diferido hasta que exista evidencia de una
necesidad real.

El tooling y la documentación experimental completos fueron archivados en el tag
local:

```text
stage-15-performance-exploration
```

La etapa siguiente fue la Etapa 16, actualmente cerrada.

---

## Etapa 16 — QA integral y cierre del rediseño

### Estado

Cerrada.

### Objetivo

Validar el sistema completo después de todas las etapas visuales.

### Roles

* admin;
* supervisor;
* trabajador;
* usuario no autenticado;
* perfil sin permisos cuando aplique.

### Breakpoints mínimos

```text
1440 × 900
1366 × 768
1024 × 768
900 × 1000
780 × 1000
390 × 844
375 × 812
```

### Aspectos a validar

* navegación;
* permisos;
* rutas activas;
* sidebar;
* menú móvil;
* dashboard;
* listados;
* workspaces;
* formularios;
* área pública;
* loading;
* error;
* empty states;
* Storage;
* responsive;
* overflow;
* foco;
* teclado;
* dialogs;
* retorno de foco;
* contraste;
* reflow;
* datos sensibles;
* roles.

### Pruebas

* `diff:check`;
* lint;
* build;
* E2E focales;
* suite Chromium serial;
* Storage;
* seguridad;
* tracking público;
* Full Visual QA;
* revisión manual de screenshots.

### Entregables

* documento de cierre;
* incidencias resueltas;
* deuda aceptada;
* resultados de pruebas;
* screenshots;
* convenciones finales;
* actualización del roadmap.

### Criterio de cierre

El rediseño se considera terminado cuando todas las rutas críticas son utilizables, consistentes, accesibles y responsive sin regresiones funcionales o de seguridad.

### Resultado de cierre

Resultado final: aprobado.

Documento de cierre:

```text
docs/ui-ux/STAGE_16_FINAL_QA_CLOSURE.md
```

Base validada:

```text
952fc80 docs: cerrar etapa 15 de optimizacion medida
```

Pruebas ejecutadas:

* `npm.cmd run diff:check`;
* `npm.cmd run verify`;
* `npm.cmd run audit:security`;
* `npm.cmd run audit:client-supabase`;
* `npm.cmd run audit:public-tracking`;
* `npx.cmd playwright test tests/e2e/full-visual-qa.spec.ts --project=chromium --workers=1`;
* `npm.cmd run test:e2e:chromium:serial`.

Resultado de pruebas:

* validacion tecnica aprobada;
* auditorias aprobadas o revisadas en contexto;
* Full Visual QA aprobada con `1 passed`;
* suite Chromium serial aprobada con `44 passed`, `3 skipped`, `0 failed`;
* 26 screenshots generados y revisados en `test-results/`.

Roles validados:

* `admin`;
* `supervisor`;
* `trabajador`;
* usuario no autenticado.

Breakpoints validados:

```text
1440 × 900
1366 × 768
1024 × 768
900 × 1000
780 × 1000
390 × 844
375 × 812
```

Incidencias:

* Bloqueantes: ninguno.
* Mayores: ninguno.
* Menores corregidos: se agrego una captura exacta `1024x768` al Full Visual QA.
* Menores corregidos: eliminacion de controles duplicados e IDs repetidos en
  cabeceras responsive de listados.
* Harness o entorno: aviso LF/CRLF de Git en Windows, no bloqueante.

Deuda aceptada:

* No se agrega deuda nueva.
* Permanece la deuda existente de dividir el Full Visual QA en specs mas pequeños
  cuando la suite crezca.

Estado final de la iniciativa:

```text
Etapas 0-16: Cerradas
Proxima etapa activa: Ninguna
Rediseño UI/UX posterior a Beta 2: Completado
```

---

# 8. Política de validación por etapa

## Etapas documentales

Ejecutar como mínimo:

```bash
npm run diff:check
```

## Implementaciones visuales pequeñas

Ejecutar:

```bash
npm run diff:check
npm run verify
```

## Cambios interactivos

Ejecutar:

```bash
npm run diff:check
npm run verify
```

y el spec E2E focal correspondiente.

## Cierre de módulos

Ejecutar:

* E2E del dominio;
* responsive;
* accesibilidad;
* screenshots;
* Full Visual QA cuando corresponda.

## Cierre integral

Ejecutar toda la batería definida en la Etapa 16.

No es necesario ejecutar Full Visual QA completo después de cada subtarea pequeña. Las pruebas pesadas deben concentrarse en los cierres de etapa.

---

# 9. Metodología de trabajo

Cada etapa seguirá este flujo:

1. Auditoría del estado real.
2. Definición del problema.
3. Decisiones arquitectónicas.
4. Especificación visual y funcional.
5. División en subtareas pequeñas.
6. Prompt de implementación para Codex.
7. Implementación.
8. Revisión del código real.
9. Correcciones.
10. Validación.
11. Documentación.
12. Commit.
13. Cierre formal.

---

# 10. Requisitos de los prompts para Codex

Cada prompt debe incluir:

* contexto;
* objetivo;
* archivos esperados;
* archivos prohibidos;
* alcance;
* comportamiento requerido;
* decisiones ya aprobadas;
* restricciones arquitectónicas;
* política de pruebas;
* criterios de aceptación;
* formato del reporte final.

Codex no debe decidir de forma autónoma:

* cambios de dominio;
* nuevos estados;
* permisos;
* RLS;
* estructura de Storage;
* dependencias;
* abstracciones globales;
* cambios de alcance.

Las decisiones estructurales deben aprobarse antes de implementar.

---

# 11. Política de commits

Cada subtarea cerrada debe finalizar con un commit específico.

Formato recomendado:

```text
docs(ui): ...
refactor(ui): ...
feat(ui): ...
fix(ui): ...
test(ui): ...
perf(ui): ...
```

Ejemplos:

```text
docs(ui): definir arquitectura de listados internos
refactor(ui): consolidar shell interno
feat(ui): rediseñar listado operativo de pedidos
feat(ui): rediseñar dashboard por rol
fix(ui): corregir overflow en tarjetas móviles
test(ui): cerrar QA responsive de listados
```

No mezclar en un mismo commit:

* rediseño;
* dominio;
* migraciones;
* optimización;
* pruebas no relacionadas.

---

# 12. Definition of Done visual

Una subtarea UI/UX se considera terminada cuando:

* cumple la especificación;
* no rompe reglas de dominio;
* no introduce dependencias innecesarias;
* no aumenta sin necesidad la superficie cliente;
* funciona con teclado;
* conserva foco visible;
* no depende solo del color;
* no presenta overflow horizontal;
* tiene comportamiento responsive;
* conserva estados vacío, error y pending;
* pasa las validaciones asignadas;
* actualiza documentación cuando corresponde;
* el código fue revisado;
* el commit está versionado.

---

# 13. Riesgos a controlar

## 13.1 Componente genérico excesivo

Crear una DataTable, formulario o workspace universal puede dificultar más el mantenimiento que la duplicación controlada.

## 13.2 Rediseño que altera el dominio

Mover formularios o acciones no debe cambiar reglas de negocio de manera accidental.

## 13.3 Exceso de Client Components

Las mejoras visuales no justifican convertir páginas server-side completas en componentes cliente.

## 13.4 Tablas demasiado densas

Mostrar toda la información disponible no significa mostrarla simultáneamente.

## 13.5 Responsive resuelto mediante ocultación indiscriminada

La información prioritaria debe mantenerse accesible.

## 13.6 Regresiones de permisos

Ocultar un enlace no reemplaza la protección server-side y RLS.

## 13.7 QA demasiado tardío

Las validaciones focales deben ejecutarse durante cada módulo, aunque el cierre completo ocurra al final.

## 13.8 Optimización prematura

No introducir paginación, caché, virtualización o paralelización compleja sin evidencia.

---

# 14. Cierre de la iniciativa

No existe proxima etapa activa para este roadmap.

```text
Etapas 0-16: Cerradas
Proxima etapa activa: Ninguna
Rediseño UI/UX posterior a Beta 2: Completado
```

Godel Diseño cuenta con una interfaz:

* operativamente clara;
* visualmente consistente;
* profesional;
* responsive;
* accesible;
* segura;
* mantenible;
* preparada para el uso real;
* documentada;
* validada por roles;
* respaldada por pruebas automatizadas y evidencia visual.

El resultado final es un sistema que el personal de Godel Diseño puede utilizar
diariamente de forma cómoda, comprensible y confiable.
