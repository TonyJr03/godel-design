# Especificación de listados internos

## 1. Propósito

Definir el patrón común vigente para los listados internos de Godel Diseño.

Esta especificación aplica a:

- Pedidos.
- Solicitudes.
- Clientes.
- Usuarios.
- Configuración y plantillas.

El objetivo es mantener una arquitectura visual y funcional compartida para superficies operativas, con páginas server-first, filtros basados en URL y reglas de dominio actuales.

## 2. Problemas del patrón actual

La revisión de los listados actuales de Pedidos y Solicitudes muestra problemas recurrentes:

- `ListFiltersBar` ocupa demasiado espacio visual.
- Los filtros aparecen siempre desplegados.
- El bloque de búsqueda y filtros parece un card pesado.
- En móvil la búsqueda y los filtros se sienten toscos.
- Las tablas muestran demasiadas columnas.
- Las cards móviles son demasiado grandes.
- Hay botones "Ver" repetidos.
- Aparecen referencias internas o UUIDs cortos que no aportan al usuario operativo.
- Se mezclan datos primarios y secundarios.
- Las acciones ocupan una columna innecesaria.

El antiguo `ListFiltersBar` fue retirado después de migrar los listados al patrón `ListingPageHeader` + `ListingToolbar` + `ListingFilterPopover` + `ActiveFilterChips`. Esta sección conserva el contexto del problema que motivó el rediseño.

## 3. Principios de diseño

- Los listados son superficies operativas, no reportes exhaustivos.
- Mostrar solo lo necesario para decidir qué abrir.
- Los detalles viven en el workspace.
- Buscar y filtrar debe ocupar poco espacio.
- La tabla desktop debe ser compacta.
- Las cards móviles deben ser accionables y pequeñas.
- Fila o card completa abre el detalle.
- No mostrar UUIDs ni referencias internas en listados.
- El color puede ayudar, pero nunca ser la única señal.
- Los filtros deben persistir en URL mediante `searchParams`.

## 4. Estructura general de un listado

Un listado interno debe componerse de:

```text
Página de listado
├── Encabezado
│   ├── título
│   ├── descripción
│   └── acción principal opcional
├── Toolbar compacta
│   ├── búsqueda
│   └── botón de filtros
├── Filtros activos
│   ├── chips compactos en una línea desplazable
│   └── acción global icon-only para limpiar
├── Resultados
│   ├── tabla desktop
│   ├── cards mobile/tablet
│   └── estados vacío/error
└── Navegación adicional
    └── paginación solo si hay evidencia de necesidad
```

La página debe seguir siendo un Server Component siempre que sea posible. Los componentes cliente se reservan para interacción real: búsqueda, apertura de filtros, sincronización con URL y navegación local de UI.

## 5. Encabezado y acción principal

El encabezado debe ser compacto y dejar la acción principal visible sin competir con los filtros.

### Desktop

```text
[Título + descripción]       [Buscar] [Filtros] [+]
```

### Mobile/tablet

```text
[Título]                                      [+]

[Descripción]

[Buscar] [Filtros]
```

La acción principal debe usar visualmente el icono `+`, pero conservar un nombre accesible y un título explícito:

```tsx
aria-label="Nuevo pedido"
title="Nuevo pedido"
```

Cada entidad debe usar su equivalente:

- `Nuevo pedido`.
- `Nueva solicitud`, si aplica en un flujo futuro.
- `Nuevo cliente`.
- `Nuevo usuario`.
- `Nueva plantilla`.

## 6. Búsqueda compacta

La búsqueda debe ser un input compacto con icono de búsqueda.

Debe tener:

- placeholder breve;
- label accesible;
- integración con `q` en `searchParams`;
- envío por Enter;
- sin debounce obligatorio en la primera versión;
- sin estado global.

Ejemplos de placeholder:

```text
Buscar pedido
Buscar solicitud
Buscar cliente
```

La búsqueda no debe convertir la página completa en Client Component. La UI puede preparar la navegación, pero la consulta y validación de parámetros siguen perteneciendo al servidor y a la capa de dominio existente.

## 7. Filtros compactos

Los selectores visibles actuales serán reemplazados por un botón compacto de filtros icon-only.

Patrón base:

```text
[Buscar...] [botón Filtros]
```

El botón de filtros debe:

- abrir un panel o dropdown de filtros;
- ser icon-only visualmente, con `aria-label` y `title` explícitos;
- exponer `aria-expanded`, `aria-controls` y `aria-haspopup="dialog"`;
- tener target mínimo de 44 x 44 px;
- mostrar badge flotante decorativo con la cantidad de facetas activas;
- excluir la búsqueda `q` del contador del badge;
- ser accesible por teclado.

Ejemplos:

```text
aria-label="Filtros"
aria-label="Filtros, 1 activo"
aria-label="Filtros, 3 activos"
```

El popover de filtros debe ser compacto, no modal, con `role="dialog"`, nombre accesible, labels asociados a sus selects y cierre mediante el trigger, clic exterior o Escape. Escape devuelve el foco al trigger. El clic exterior cierra el popover sin robar foco artificialmente.

Los selects dentro del popover deben ser compactos. No debe existir un botón interno de limpiar filtros dentro del popover; la limpieza global vive junto a los chips activos.

No se deben introducir librerías externas para este patrón. No se usarán filtros siempre visibles como solución principal.

## 8. Filtros activos y limpieza

Los filtros activos deben mostrarse como chips compactos solo cuando existan búsqueda o filtros aplicados.

Ejemplo:

```text
Búsqueda: agenda
Estado: En producción
Pago: Pendiente
Tipo: Encargo
[botón Limpiar filtros]
```

La banda de filtros activos debe:

- vivir debajo del toolbar sin separar el título de su descripción;
- mantenerse en una sola línea;
- desplazar internamente los chips cuando no quepan;
- mantener visible el botón global de limpieza;
- exponer contenedor `Filtros activos` y lista `Criterios activos`;
- dar a cada chip una acción `Quitar ...` con nombre accesible.

El botón global de limpieza debe ser icon-only, usar una brocha como icono decorativo y conservar nombre accesible y `title`. Durante una actualización pendiente muestra spinner decorativo, `aria-busy` y cambia su nombre accesible a `Actualizando resultados`.

El estado de actualización de resultados debe anunciarse con `role="status"` no visible y no reservar una fila visual. El desplazamiento de resultados al aparecer la banda debe limitarse a una fila compacta.

La acción de limpieza debe retirar `q`, filtros de entidad y `page` cuando exista paginación futura.

## 9. Persistencia en URL con searchParams

Búsqueda y filtros deben seguir usando URL mediante `searchParams`.

Ejemplos:

```text
/dashboard/pedidos?q=agenda&status=en_produccion&workflow_type=encargo&payment_status=pendiente
/dashboard/solicitudes?q=juan&status=nueva&workflow_type=impresion
```

Ventajas:

- la recarga preserva el estado;
- las vistas son compartibles;
- es compatible con Server Components;
- no requiere estado global;
- permite validación server-side de parámetros.

Los parámetros inválidos deben seguir validándose en servidor y mostrarse como advertencias seguras cuando corresponda.

## 10. Tabla desktop

Desktop usa una tabla compacta o estructura tabular equivalente.

Reglas:

- No columna de acción.
- No botón "Ver".
- Fila completa abre detalle.
- No UUID interno.
- No referencia corta interna.
- Columnas estrictamente necesarias.
- Texto largo con `line-clamp`.
- Estado y pago como badges.
- Tipo puede reflejarse por color o acento, pero con texto accesible.
- No depender solo del color.

La tabla debe preservar semántica clara. Si se usa una estructura no nativa de tabla, debe justificarlo por interacción o responsive y mantener navegación con teclado.

## 11. Cards mobile/tablet

Mobile y tablet usan cards compactas.

Reglas:

- Card completa abre detalle.
- No botón "Ver".
- No UUID.
- No descripción larga.
- Máximo dos líneas de información principal.
- Badges mínimos.
- Misma información esencial que la tabla, reorganizada.
- Target táctil amplio.
- Foco visible.

Las cards no deben intentar replicar todas las columnas de escritorio. Deben ayudar a reconocer el registro y abrir su workspace.

### Contrato vigente por debajo de `xl`

El corte responsive real de Pedidos y Solicitudes está en `xl`. Por tanto,
anchos como `1024px` continúan usando cards y no tabla. La tabla desktop
comienza desde `xl` y mantiene sus columnas, datos de dominio, navegación,
filtros y paginación sin cambios.

#### Pedido

La card responsive de Pedido conserva esta jerarquía:

```text
Numero + Estado/Pago
Titulo a ancho completo
Workflow + Servicio
Entrega
```

Reglas vigentes:

- La primera fila contiene el número de pedido y el grupo Estado/Pago.
- Los badges no comparten fila ni ancho con el título.
- El título vive en una fila independiente, ocupa el ancho interno disponible
  de la card y conserva máximo dos lineas.
- La metadata muestra primero workflow y después servicio.
- La fecha de entrega permanece como ultima fila.
- No se muestra descripción ni botón "Ver".
- La card completa sigue abriendo el detalle.

#### Solicitud

La card responsive de Solicitud conserva cliente, contacto, Estado y fecha
recibida. La metadata vigente muestra:

```text
Workflow + Servicio
```

en ese orden. No se duplica el workflow dentro de la presentacion del servicio,
no cambia el fallback del servicio y la card completa sigue abriendo el detalle.

## 12. Fila y card clicable

### Cards

Preferir que la card completa sea un `Link` al detalle.

### Tabla

Usar una primitiva accesible para fila clicable.

Opción propuesta:

```text
ClickableTableRow
```

Con:

- `role="link"`;
- `tabIndex={0}`;
- navegación con click;
- navegación con Enter;
- foco visible;
- `aria-label` claro;
- sin controles interactivos anidados dentro de la fila.

Esta subtarea solo documenta la decisión. La implementación queda para la etapa posterior.

## 13. Columnas por entidad

### Pedidos

Columnas finales:

```text
Pedido | Trabajo | Estado | Pago | Entrega
```

#### Pedido

- Mostrar `order_number`.
- No mostrar UUID.
- No mostrar referencia corta interna.
- El tipo de flujo puede reflejarse mediante color/acento:
  - azul para encargo;
  - naranja para impresión.
- Debe existir texto accesible del tipo, no solo color.

#### Trabajo

- Título del pedido.
- Vista breve de descripción.
- Máximo 1-2 líneas.

#### Estado

- Badge de estado.

#### Pago

- Badge de pago.
- Sin montos detallados en la tabla principal salvo decisión futura.

#### Entrega

- Fecha estimada de entrega.
- Nombre de columna corto: `Entrega`.
- Puede indicar vencimiento visualmente si ya existe lógica o se decide en Etapa 9.

### Solicitudes

Columnas finales:

```text
Cliente | Contacto | Servicio | Estado | Recibida
```

#### Cliente

- Nombre de quien envía la solicitud.

#### Contacto

- Teléfono principal.
- Email secundario si existe, de forma discreta.

#### Servicio

- Servicio solicitado.
- Debe reflejar encargo/impresión con color/acento y texto accesible.

#### Estado

- Badge de estado.

#### Recibida

- Fecha de creación de la solicitud.
- Usar `created_at`.
- No usar `desired_date` como columna principal.

## 14. Estados vacíos

Se definen dos tipos de estado vacío.

### Sin datos

```text
No hay pedidos registrados todavía.
Crea el primer pedido para comenzar a gestionar el trabajo.
```

### Con filtros activos

```text
No encontramos pedidos con estos filtros.
Prueba limpiar los filtros o cambiar la búsqueda.
```

Debe haber acción para limpiar filtros si hay filtros activos.

Los textos deben adaptarse por entidad:

- pedidos;
- solicitudes;
- clientes;
- usuarios;
- plantillas.

## 15. Accesibilidad

Los listados deben cumplir:

- jerarquía de headings clara;
- labels accesibles para búsqueda y filtros;
- botón principal con `aria-label` y `title` cuando sea solo icono;
- foco visible en filas, cards, inputs, botones y chips;
- navegación con teclado para abrir filtros y registros;
- `aria-label` claro en filas clicables;
- indicadores de estado con texto, no solo color;
- targets táctiles amplios;
- mensajes de estado comprensibles;
- ausencia de controles interactivos anidados en filas clicables.

## 16. Responsive

El responsive se define por jerarquía de información, no por ocultación indiscriminada.

### Desktop

- Encabezado, búsqueda, filtros y acción principal pueden compartir una línea.
- Tabla compacta con columnas finales.
- Chips activos debajo del toolbar si ayudan a lectura.

### Tablet

- Encabezado y acción principal se separan.
- Toolbar bajo la descripción.
- Cards compactas o tabla reducida según el dominio.

### Mobile

- Título y acción principal arriba.
- Descripción breve.
- Búsqueda y filtros en una fila o en stack compacto si el ancho no alcanza.
- Cards pequeñas, clicables y sin información secundaria excesiva.

No debe aparecer overflow horizontal en móviles.

## 17. Componentes comunes propuestos

Componentes candidatos. La Etapa 8.2 implementa el subconjunto inicial y el resto se creará solo si hace falta:

```text
src/components/listing/
├── ListingPageHeader.tsx
├── ListingToolbar.tsx
├── ListingSearchInput.tsx
├── ListingFilterButton.tsx
├── ListingFilterPanel.tsx
├── ActiveFilterChips.tsx
├── ClickableTableRow.tsx
├── ListingEmptyState.tsx
└── ListingCardLink.tsx
```

No todos deben crearse de golpe. Se crearán según necesidad para evitar sobreingeniería.

Las filas, cards y columnas específicas deben permanecer cerca de cada dominio cuando contengan reglas o jerarquía propia.

## 18. Plan de implementación posterior

### 8.2

Implementar primitivas comunes mínimas de listados.

### Etapa 9

Aplicar el patrón a:

```text
Pedidos
Solicitudes
```

### Etapa 10

Aplicar el patrón a:

```text
Clientes
Usuarios
Configuración / plantillas
```

## 19. Riesgos

- Crear una tabla universal demasiado configurable.
- Convertir páginas server-first completas en Client Components.
- Reintroducir columnas secundarias por comodidad.
- Ocultar información necesaria en mobile sin alternativa.
- Usar solo color para diferenciar encargo e impresión.
- Implementar filtros con estado global innecesario.
- Cambiar contratos funcionales mientras se rediseña la UI.
- Mezclar esta arquitectura visual con cambios de permisos, consultas o RLS.

## 20. Criterios de aceptación

Esta especificación queda aceptada como contrato vigente de listados internos.
El antiguo `ListFiltersBar` y los criterios de cierre de etapa quedan como
contexto histórico; los planes y reportes completos están en
`../archive/ui-ux-redesign/`.
