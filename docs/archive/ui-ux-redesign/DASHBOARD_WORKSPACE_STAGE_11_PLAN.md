# Etapa 11 — Plan técnico del Dashboard Workspace

## 1. Objetivo

El dashboard dejará de ser una página vertical larga y pasará a ser un workspace operativo. La pantalla debe comportarse como una superficie diaria de trabajo, no como una colección de secciones apiladas.

El objetivo principal es que cada rol identifique rápidamente qué necesita atención y cuál es su siguiente acción.

La Etapa 11 no introduce analítica avanzada ni cambia reglas de dominio. Reorganiza la información ya disponible en un tablero principal de pedidos activos y paneles laterales para información secundaria o de apoyo.

## 2. Problema actual

El dashboard actual renderiza demasiadas secciones verticales:

- Atención operativa.
- Trabajo pendiente.
- Resumen operativo.
- Actividad reciente.

Esto genera varios problemas:

- scroll vertical largo;
- demasiadas tarjetas visibles a la vez;
- los pedidos no tienen suficiente protagonismo;
- resumen e historial compiten con el trabajo operativo;
- no se aprovecha el patrón de workspace ya consolidado en Pedido, Solicitud y gestión de Plantilla.

El resultado es funcional, pero obliga al usuario a escanear demasiado antes de decidir qué abrir.

## 3. Principios de rediseño

1. Priorizar pedidos activos sobre métricas.
2. Reducir scroll vertical.
3. Mover información secundaria a paneles.
4. Mantener navegación directa a pedido/solicitud.
5. Evitar analítica avanzada.
6. No introducir gráficos innecesarios.
7. Mantener RLS y permisos existentes.
8. Diseñar por rol.

El dashboard seguirá siendo server-first. Los componentes cliente solo deben controlar interacción local de paneles, estado activo, foco y comportamiento responsive. No deben consultar Supabase ni decidir permisos.

## 4. Estructura general del workspace

La estructura conceptual del dashboard será:

```text
DashboardWorkspace
├── DashboardWorkspaceHeader
├── DashboardMainBoard
│   ├── Nuevos
│   ├── En revisión
│   └── En producción
└── DashboardSidePanels
    ├── Atención operativa
    ├── Solicitudes pendientes
    ├── Pedidos listos para entrega
    ├── Historial
    └── Resumen operativo
```

El orden de botones laterales debe ser:

1. Atención operativa.
2. Solicitudes pendientes.
3. Pedidos listos para entrega.
4. Historial.
5. Resumen operativo.

El área principal queda dedicada a pedidos activos. Los paneles laterales contienen lo que ayuda a decidir, pero no debe competir visualmente con el tablero.

## 5. Área principal: pedidos activos

El área principal queda dedicada a pedidos. Debe permitir reconocer el trabajo operativo sin abrir métricas ni historial.

### 5.1 Sección Nuevos

Incluye pedidos con estado:

```text
creado
solicitud_recibida
```

Ambos se consideran "nuevo" operativamente porque representan pedidos creados o convertidos que todavía necesitan revisión inicial.

### 5.2 Sección En revisión

Incluye pedidos con estado:

```text
en_revision
```

Debe priorizar pedidos que necesitan tareas, definición operativa o avance hacia producción.

### 5.3 Sección En producción

Incluye pedidos con estado:

```text
en_produccion
```

Debe mostrar barra de progreso. En encargos, el progreso se deriva de tareas existentes. En impresiones, debe evitar tratar la ausencia de tareas como problema.

### 5.4 Listos para entrega

Los pedidos listos para entrega no van en el área principal.

Van en el panel lateral:

```text
Pedidos listos para entrega
```

Estado incluido:

```text
listo_entrega
```

Esta separación mantiene el tablero principal centrado en el trabajo que todavía está en curso.

### 5.5 Card compacta de pedido

La card debe ser simple, completamente clicable y con máximo dos o tres líneas.

Datos visibles:

- número de pedido;
- título;
- fragmento breve de descripción o cliente;
- badge de pago;
- fecha estimada de entrega;
- progreso solo en producción.

Ejemplo conceptual:

```text
#00034 · Tazas personalizadas
Cliente / descripción breve
[Pago pendiente] · Entrega: 12 jun
```

Para producción:

```text
#00041 · Agendas corporativas
Cliente / descripción breve
[Pago parcial] · Entrega: 15 jun
████████░░ 80% · 4/5 tareas
```

Cada card debe navegar a:

```text
/dashboard/pedidos/[id]
```

La implementación debe usar el identificador real del pedido en la URL y un nombre accesible claro para la card.

### 5.6 Límite de elementos y enlace al listado filtrado

Cada sección principal debe tener límite visual.

Propuesta:

- Nuevos: máximo 4.
- En revisión: máximo 4.
- En producción: máximo 6.
- Listos para entrega: máximo 6 en panel.
- Solicitudes pendientes: máximo 6 en panel.
- Historial: máximo 8 en panel.

Si hay más elementos, se debe mostrar un indicador como:

```text
+3 pedidos más
```

o equivalente, con enlace al listado filtrado.

Ejemplos de enlaces:

```text
/dashboard/pedidos?status=creado
/dashboard/pedidos?status=en_revision
/dashboard/pedidos?status=en_produccion
/dashboard/solicitudes?status=nueva
```

La URL exacta debe respetar los filtros reales soportados por los listados actuales.

## 6. Paneles laterales

Los paneles laterales contienen información operativa secundaria. Deben abrirse desde botones en el orden definido y mantener el panel activo identificable.

### 6.1 Atención operativa

Panel tipo menú de prioridades.

Debe mostrar indicadores como:

- Pedidos atrasados.
- Próximos a entrega.
- Pedidos sin tareas.
- Solicitudes pendientes.
- Aprobadas sin convertir.
- Listos para entrega.

Comportamiento:

- Si se toca un indicador de solicitud, abrir el panel `Solicitudes pendientes`.
- Si se toca `Listos para entrega`, abrir el panel `Pedidos listos para entrega`.
- Si se toca un indicador de pedidos activos, cerrar panel o enfocar el tablero principal.
- No navegar fuera del dashboard salvo que el indicador sea un enlace explícito.

### 6.2 Solicitudes pendientes

Incluye toda solicitud que requiera atención:

```text
No convertida
No rechazada
```

Mostrar por card:

- cliente;
- estado;
- servicio;
- teléfono;
- fecha recibida.

La card completa debe navegar a:

```text
/dashboard/solicitudes/[id]
```

Este panel solo aplica para `admin` y `supervisor`.

### 6.3 Pedidos listos para entrega

Incluye pedidos con estado:

```text
listo_entrega
```

Debe mostrar card compacta similar a pedidos principales, con navegación directa al workspace del pedido.

### 6.4 Historial

La actividad reciente actual se mueve a este panel.

Debe mantener diferenciación visual por origen:

```text
pedido
solicitud
```

El botón textual:

```text
Ver pedido
Ver solicitud
```

debe cambiar por botón icon-only con accessible name. El icono no debe ser la única información semántica: el botón necesita `aria-label` o nombre accesible equivalente, por ejemplo `Ver pedido P-26-0347`.

### 6.5 Resumen operativo

Las métricas actuales de `DashboardOverview` se mueven a este panel.

Debe ser compacto y no competir con pedidos activos. No debe convertirse en reporte, gráfico ni panel de analítica avanzada.

## 7. Comportamiento de Atención operativa

Atención operativa actúa como índice de prioridades, no como listado completo.

Debe sintetizar señales ya existentes o derivables:

- pedidos atrasados;
- pedidos próximos a entrega;
- pedidos activos sin tareas cuando el flujo lo requiere;
- solicitudes pendientes;
- solicitudes aprobadas sin convertir;
- pedidos listos para entrega.

Las acciones dentro del panel deben preferir abrir otro panel o enfocar el tablero. Solo deben navegar fuera del dashboard cuando exista un enlace explícito hacia un listado filtrado o un registro específico.

Para `trabajador`, Atención operativa debe limitarse a pedidos asignados y no debe exponer solicitudes ni métricas globales.

## 8. Contrato de datos necesario

El contrato actual del dashboard ya trae:

```text
id
href
numeroPedido
title
status
priority
fechaEntregaEstimada
createdAt
clienteNombre
progress
attention
```

Para el nuevo diseño se necesita extender o derivar:

```text
descriptionSnippet
paymentStatus o paymentSummary
grupos por estado:
  nuevos
  enRevision
  enProduccion
  listosEntrega
counts totales por grupo
```

Reglas para la implementación posterior:

- No duplicar lógica de pago.
- Reutilizar helpers existentes de pedidos si ya existen.
- No consultar más datos de los necesarios.
- Mantener RLS.
- Mantener roles existentes.
- No usar `service_role`.
- No consultar `auth.users`.
- No consultar Supabase desde Client Components.

Los conteos totales por grupo sirven para mostrar límites visuales y enlaces como `+3 pedidos más`.

## 9. Diferencia por rol

### Admin y supervisor

Ven:

```text
Pedidos activos globales
Solicitudes pendientes
Listos para entrega
Historial general
Resumen operativo general
```

También pueden acceder desde cards o enlaces filtrados a los listados y workspaces que ya permiten sus permisos vigentes.

### Trabajador

No debe ver solicitudes ni métricas globales.

Debe ver:

```text
Mis pedidos asignados
En revisión
En producción
Listos para entrega asignados
Historial personal si existe en datos actuales
Resumen personal
```

Si no hay datos suficientes para historial personal, debe documentarse como pendiente o no incluirse inicialmente.

La variante trabajador no cambia la matriz de permisos. RLS y servicios server-side siguen limitando los pedidos a los asignados.

## 10. Responsive

### Desktop

```text
área principal + paneles laterales
sin scroll vertical largo si hay pocos datos
panel lateral persistente
```

El tablero debe dominar el ancho útil. El panel activo debe estar disponible sin desplazar los pedidos fuera de foco.

### Tablet

```text
tablero principal arriba
botonera de paneles horizontal o wrap
panel activo debajo
```

La botonera no debe generar overflow horizontal ni perder nombres accesibles.

### Mobile

```text
secciones apiladas
cards compactas
botones de panel como chips o barra horizontal
sin overflow horizontal
```

Las cards deben mantenerse compactas y accionables. El dashboard puede tener scroll en móvil, pero sin replicar la página vertical larga actual ni esconder acciones prioritarias.

## 11. Accesibilidad

Requisitos:

- cards clicables con nombres accesibles;
- botones icon-only con `aria-label`;
- panel activo identificable;
- no depender solo de color;
- mantener foco visible;
- navegación por teclado;
- indicadores de estado con texto visible o nombre accesible;
- paneles con título claro;
- retorno de foco cuando un panel contextual se cierre, si la implementación usa diálogo o drawer;
- target táctil suficiente en mobile.

El historial debe cambiar los botones textuales de navegación por icon-only solo si el nombre accesible conserva destino y contexto.

## 12. Subtareas de implementación

### 11.1 Plan técnico del Dashboard Workspace

Crear el documento técnico y actualizar el roadmap sin implementar componentes.

### 11.2 Contrato de datos del dashboard

Ajustar o derivar DTOs server-side para grupos de pedidos, conteos, resumen de pago y snippets mínimos.

### 11.3 Shell del Dashboard Workspace

Crear la estructura visual del workspace, header, tablero principal y navegación de paneles sin cambiar reglas de dominio.

### 11.4 Tablero principal de pedidos

Implementar secciones Nuevos, En revisión y En producción con cards compactas, límites visuales y enlaces filtrados.

### 11.5 Paneles laterales

Mover Atención operativa, Solicitudes pendientes, Pedidos listos para entrega, Historial y Resumen operativo a paneles en el orden definido.

### 11.6 Variante trabajador

Adaptar el workspace para pedidos asignados, sin solicitudes ni métricas globales.

### 11.7 QA y cierre

Ejecutar validaciones asignadas, revisar responsive, accesibilidad, roles y ausencia de overflow antes de cerrar la etapa.

## 13. Criterios de cierre

La Etapa 11 se considera cerrada cuando:

- el dashboard ya no es página vertical larga;
- pedidos activos son el foco principal;
- paneles contienen atención operativa, solicitudes, listos para entrega, historial y resumen;
- trabajador no ve información global innecesaria;
- no se modifican RLS ni permisos;
- E2E de dashboard pasan;
- responsive sin overflow;
- la navegación directa a `/dashboard/pedidos/[id]` y `/dashboard/solicitudes/[id]` se mantiene;
- el estado `listo_entrega` queda separado hacia panel lateral;
- `creado` y `solicitud_recibida` se tratan como pedidos nuevos;
- no se introducen gráficos innecesarios ni reportes avanzados.
