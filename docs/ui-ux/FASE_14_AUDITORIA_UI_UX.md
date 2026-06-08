# Fase 14 — Auditoría UI/UX inicial

## 1. Resumen ejecutivo

La interfaz actual de Godel Diseño es funcional, sobria y razonablemente
consistente para un MVP operativo. La arquitectura de presentación respeta la
separación entre Server Components y componentes cliente, los formularios
ofrecen validación visible y estados de envío, y los módulos principales ya
comparten patrones reconocibles de tarjetas, tablas, alertas y encabezados.

La principal deuda no es una ausencia de estilos, sino la falta de un sistema
visual explícito. Colores, botones, inputs, badges, alertas y superficies se
definen mediante cadenas de utilidades repetidas en cada componente. Esto hace
que la UI se perciba como una colección de pantallas funcionales más que como
un workspace propio de Godel Diseño, y aumenta el riesgo de divergencia durante
la fase de rediseño.

La evolución recomendada es conservar la claridad y la ligereza actuales,
reemplazar el teal genérico por una identidad basada en el azul y naranja de la
marca, y construir una estética de "mesa de trabajo organizada": fondos cálidos
tipo papel, superficies limpias, fichas de pedido, etiquetas de estado y una
jerarquía orientada a decidir qué requiere atención.

No se identificaron bloqueos críticos de usabilidad en la revisión estática.
Las prioridades inmediatas son:

1. Definir tokens visuales y estados semánticos.
2. Normalizar componentes UI comunes antes de rediseñar módulos.
3. Mejorar navegación activa, foco visible y accesibilidad transversal.
4. Diseñar una alternativa móvil real para las tablas de alta densidad.
5. Reordenar dashboard y detalles según prioridad operativa.

## 2. Alcance de la auditoría

La auditoría se realizó mediante revisión estática del código, documentación
funcional existente y las áreas de captura indicadas por dirección técnica.
No se ejecutaron cambios visuales ni pruebas con usuarios.

### Rutas públicas revisadas

- `/`
- `/solicitud`
- `/login`
- `/acceso-denegado`
- `/sin-permisos`

### Rutas internas revisadas

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

### Componentes y patrones revisados

- Layout raíz, layout del dashboard, header público y sidebar.
- Navegación filtrada por rol.
- `PageHeader`, placeholders y tarjetas de resumen.
- Búsqueda y filtros.
- Formularios públicos e internos.
- Tablas de solicitudes, pedidos, clientes y usuarios.
- Detalles de solicitud, pedido, cliente y usuario.
- Estados y progreso de pedidos.
- Archivos, comentarios, historial y tareas.
- Estados vacíos, alertas y mensajes de éxito/error.
- Uso de breakpoints, scroll horizontal y composición móvil.
- Etiquetas visibles y estados de dominio en `src/lib`.

### Referencias funcionales revisadas

- Modelo del dashboard operativo.
- Modelo de permisos.
- Flujo de solicitudes públicas.
- Flujo de pedidos.
- Modelo de gestión de usuarios.

## 3. Diagnóstico general

### Claridad visual

La UI es legible y evita decoración innecesaria. El fondo claro, las tarjetas
blancas y el texto zinc ofrecen una base estable. Sin embargo, casi todas las
superficies tienen el mismo peso: borde gris, fondo blanco, radio medio y sombra
ligera. Esta uniformidad reduce la capacidad de distinguir entre resumen,
contenido, acción, advertencia y actividad secundaria.

### Jerarquía de información

Los encabezados de página y secciones son claros, pero el contenido operativo
no siempre está ordenado por urgencia. En el dashboard, todas las métricas usan
la misma tarjeta y el mismo peso visual. En los detalles extensos, módulos de
consulta, edición y registro aparecen como una secuencia vertical de tarjetas
equivalentes, lo que obliga a recorrer mucho contenido para localizar la acción
principal.

### Consistencia

Existe consistencia informal en radios, bordes, sombras y tamaños, pero no una
fuente de verdad reutilizable. Las mismas clases de input, botón, alerta y card
se repiten en numerosos archivos con pequeñas diferencias. `PageHeader` es una
buena primera pieza común, pero no cubre acciones, breadcrumbs, metadata ni
variantes compactas.

### Navegación

La navegación se filtra correctamente por rol y utiliza `Link`. En desktop, el
sidebar es simple y comprensible. No muestra la ruta activa ni utiliza
`aria-current`, por lo que falta orientación espacial. En móvil se transforma
en una franja horizontal con scroll; funciona técnicamente, pero escala mal,
oculta opciones fuera del viewport y compite con el contenido principal.

### Responsive

La base es mobile-first y usa breakpoints de Tailwind de forma coherente. Los
formularios pasan de una a dos columnas y las acciones suelen apilarse. Las
tablas están protegidas con `overflow-x-auto`, lo que evita romper el layout,
pero no resuelve la experiencia de lectura y acción en móvil, especialmente en
pedidos con diez columnas.

### Accesibilidad básica

Fortalezas:

- `lang="es"` en el documento.
- Labels asociados a inputs.
- `aria-invalid` y `aria-describedby` en formularios principales.
- Mensajes con `role="alert"`, `role="status"` y `aria-live`.
- Encabezados de tabla con `scope="col"`.
- Controles nativos para inputs y selects.

Oportunidades:

- No hay estado activo semántico en navegación.
- No se detectó enlace para saltar al contenido.
- Los enlaces y botones no tienen una política común de `focus-visible`.
- Algunos controles de tabla usan una altura de 36 px, inferior al objetivo
  táctil recomendado de 44 px en móvil.
- No se detectó tratamiento global de `prefers-reduced-motion`.
- No hay una estrategia visible de carga por ruta mediante skeletons.

### Formularios

Los formularios son una de las áreas más sólidas. Tienen labels, ayuda,
validación por campo, feedback de envío y estados deshabilitados. Los campos
usan tamaños cómodos, especialmente en los formularios públicos e internos
principales.

La deuda está en la repetición de estilos y estructuras. También falta una
jerarquía más clara para formularios largos, agrupación visual reutilizable,
resumen de errores para envíos extensos y una política uniforme de acciones
primaria/secundaria.

### Listados

Los listados son semánticos, densos y adecuados para desktop. Los filtros se
sincronizan con URL y muestran estado de búsqueda. Sus debilidades son:

- demasiadas columnas para móvil;
- ausencia de resaltado de fila o enlace principal amplio;
- badges de estado casi siempre en teal;
- acciones pequeñas y repetitivas;
- falta de información sobre cantidad de resultados;
- ausencia de ordenamiento visible o paginación en la capa de UI revisada.

### Detalles

Los detalles exponen la información necesaria sin mostrar metadata sensible.
Usan `dl`, títulos y tarjetas de forma comprensible. Los detalles de solicitud y
pedido son muy largos y mezclan lectura, acciones, comentarios, archivos,
historial y gestión de estado en una sola columna. La secuencia actual no ofrece
anclas, resumen lateral ni prioridad clara para la tarea diaria.

### Dashboard

El dashboard usa información real, diferenciada por rol, y mantiene la carga en
servidor. Es una base funcional valiosa. Visualmente, las tarjetas de resumen no
distinguen métricas normales de métricas que requieren atención. Diez tarjetas
para gestión pueden generar fatiga y desplazar los paneles accionables. Falta
una capa visual de prioridad, tendencia o agrupación.

### Estados vacíos

Los estados vacíos son consistentes y explicativos. El borde discontinuo ayuda a
distinguirlos de contenido real. Pueden mejorar con una acción contextual
cuando exista una acción segura, una iconografía discreta y mensajes distintos
para "sin datos todavía", "sin resultados por filtros" y "sin permiso".

### Mensajes de error y éxito

Los mensajes son visibles, próximos a la interacción y, en general, accesibles.
Se utiliza texto además del color, por lo que no dependen exclusivamente de la
paleta. Falta normalizar estructura, icono, título, variante y espaciado.
Actualmente teal se usa tanto para éxito como para información o estado
operativo, lo que debilita el significado.

## 4. Hallazgos principales

### Críticos

No se detectaron problemas críticos que bloqueen el uso de los flujos
principales en la revisión estática. Esta conclusión debe validarse con pruebas
manuales de teclado, zoom, lectores de pantalla y dispositivos reales durante
la subfase 14.11.

### Importantes

#### 4.1 No existe un sistema de tokens visuales completo

- **Problema detectado:** solo existen variables globales para fondo, texto y
  fuentes. Colores, superficies, bordes, sombras y estados se codifican
  directamente con utilidades.
- **Impacto en UX:** inconsistencias progresivas, cambios costosos y ausencia de
  identidad de marca.
- **Recomendación general:** definir tokens semánticos en Tailwind/CSS antes de
  rediseñar componentes.
- **Zona afectada:** toda la aplicación.

#### 4.2 Las tablas no tienen una experiencia móvil suficiente

- **Problema detectado:** el scroll horizontal evita desbordes, pero obliga a
  explorar tablas de 6 a 10 columnas y deja las acciones fuera de vista.
- **Impacto en UX:** comparación difícil, pérdida de contexto y mayor esfuerzo
  táctil.
- **Recomendación general:** mantener tabla en desktop y usar `MobileCardList`
  con campos priorizados en pantallas pequeñas.
- **Zona afectada:** solicitudes, pedidos, clientes y usuarios.

#### 4.3 Falta orientación de navegación y foco transversal

- **Problema detectado:** no hay estado activo en sidebar/header, `aria-current`,
  skip link ni estilo unificado de `focus-visible`.
- **Impacto en UX:** menor orientación y peor uso por teclado.
- **Recomendación general:** incorporar estado activo, foco consistente y salto
  al contenido en el shell.
- **Zona afectada:** navegación pública e interna; enlaces y botones globales.

#### 4.4 Estados operativos sin semántica visual diferenciada

- **Problema detectado:** solicitudes y pedidos de estados distintos comparten
  frecuentemente el mismo badge teal.
- **Impacto en UX:** se pierde reconocimiento rápido de pendiente, producción,
  listo, completado, rechazado o cancelado.
- **Recomendación general:** crear `StatusBadge` y `PriorityBadge` basados en
  mapas semánticos, siempre con texto y no solo color.
- **Zona afectada:** tablas, dashboard, detalles, tareas y progreso.

#### 4.5 El dashboard no prioriza lo accionable

- **Problema detectado:** todas las métricas tienen igual peso y los paneles de
  trabajo aparecen después de una cuadrícula extensa.
- **Impacto en UX:** el usuario debe interpretar demasiadas cifras antes de
  llegar a lo que requiere acción.
- **Recomendación general:** agrupar métricas, destacar alertas operativas y
  colocar trabajo urgente antes de información secundaria.
- **Zona afectada:** `/dashboard`.

#### 4.6 Los detalles extensos tienen exceso de profundidad vertical

- **Problema detectado:** detalles de solicitud y pedido concatenan muchas
  tarjetas de igual jerarquía.
- **Impacto en UX:** aumenta el tiempo para localizar estado, tareas, archivos,
  comentarios o historial.
- **Recomendación general:** crear resumen principal, navegación interna o
  columnas en desktop, conservando flujo lineal en móvil.
- **Zona afectada:** detalles de solicitud y pedido.

#### 4.7 Componentes comunes duplicados de forma implícita

- **Problema detectado:** inputs, botones, alerts, cards, items de detalle y
  estados vacíos se implementan repetidamente.
- **Impacto en UX:** pequeñas diferencias visuales y de accesibilidad entre
  módulos.
- **Recomendación general:** normalizar primitivas pequeñas antes de construir
  componentes complejos.
- **Zona afectada:** formularios, listados, detalles, comentarios, archivos y
  tareas.

#### 4.8 No hay feedback de carga a nivel de ruta

- **Problema detectado:** no se detectaron archivos `loading.tsx` para zonas con
  varias consultas server-side.
- **Impacto en UX:** navegación percibida como lenta o congelada en conexiones
  reales.
- **Recomendación general:** añadir skeletons de ruta compatibles con App
  Router, priorizando dashboard y detalles.
- **Zona afectada:** dashboard, listados y detalles.

### Menores

#### 4.9 Identificadores técnicos demasiado visibles

- **Problema detectado:** varios detalles muestran UUID completos con alto
  protagonismo.
- **Impacto en UX:** ruido para usuarios no técnicos.
- **Recomendación general:** mostrar referencia corta por defecto y dejar el ID
  completo en una zona secundaria o acción de copia.
- **Zona afectada:** solicitud, pedido, cliente y usuario.

#### 4.10 Tamaños táctiles variables

- **Problema detectado:** algunas acciones usan `h-9` o `min-h-9`.
- **Impacto en UX:** objetivos de 36 px pueden ser incómodos en móvil.
- **Recomendación general:** mínimo de 44 px para acciones táctiles principales
  y separación mínima de 8 px.
- **Zona afectada:** tablas, archivos, actividad y tareas.

#### 4.11 Terminología y capitalización mejorables

- **Problema detectado:** conviven "Login", "Acceso interno", "Detalle de
  pedido", "Volver a pedidos" y referencias técnicas con criterios diferentes.
- **Impacto en UX:** tono menos cohesivo.
- **Recomendación general:** definir guía breve de microcopy y nomenclatura.
- **Zona afectada:** header público, login, encabezados, botones y estados.

#### 4.12 El login desaprovecha el contexto de marca

- **Problema detectado:** el formulario es correcto, pero se presenta como una
  tarjeta genérica dentro de una página amplia.
- **Impacto en UX:** baja diferenciación y poca sensación de producto interno.
- **Recomendación general:** incorporar identidad visual sobria, contexto
  operativo y una composición más enfocada.
- **Zona afectada:** `/login`.

## 5. Evaluación por módulo

### Layout general del dashboard

La estructura `aside + main` es simple y compatible con Server Components. El
fondo `zinc-50` y el padding constante crean una base ordenada. Falta un ancho
máximo o estrategia explícita para pantallas muy anchas; tablas y contenidos
pueden expandirse sin una jerarquía de columnas. El shell debe incorporar
tokens, skip link, identificador de `main`, estado de navegación y una cabecera
móvil.

### Sidebar / navegación

La navegación por rol es correcta. Desktop necesita estado activo, iconografía
consistente opcional, agrupación y mejor presentación del usuario actual. En
móvil conviene sustituir la tira horizontal por una barra superior compacta con
menú desplegable o panel lateral. Configuración debe evitar mostrarse como
destino equivalente mientras siga siendo placeholder.

### Dashboard operativo

La información responde al modelo operativo y diferencia gestión de trabajo
asignado. La mejora debe centrarse en jerarquía:

- primer nivel: atrasados, próximos, sin tareas y pendientes;
- segundo nivel: solicitudes y pedidos accionables;
- tercer nivel: métricas de contexto;
- cuarto nivel: actividad reciente.

Las tarjetas deben poder usar tono, icono o descriptor sin convertir el
dashboard en un panel decorativo. No se recomiendan gráficos hasta existir una
pregunta operativa que los justifique.

### Formulario público de solicitud

Es completo, accesible y está bien dividido en contacto y trabajo. En desktop,
la columna lateral explica el proceso; en móvil cae después del formulario, por
lo que la ayuda llega tarde. Conviene adelantar un resumen breve del proceso,
mostrar con claridad formatos/límites de archivo y reforzar el éxito final con
la referencia y próximos pasos. La estética debe ser la versión pública más
cálida del sistema, sin parecer e-commerce.

### Login

El flujo es directo, los campos tienen autocomplete y el error se anuncia. Se
recomienda una composición más centrada, una marca visual clara y una
descripción corta del workspace. El tamaño de texto de los inputs puede
normalizarse con el resto del sistema y el foco debe usar el color de marca.

### Listado de solicitudes

La tabla presenta datos útiles y el filtro por estado es correcto. En desktop
puede mejorar con fila interactiva, estado semántico, contador de resultados y
priorización de fecha deseada. En móvil debe transformarse en tarjetas con:
referencia, cliente, servicio, estado, fecha deseada y acción principal.

### Detalle de solicitud

La información es completa y el flujo de negocio queda expuesto sin mover
lógica al cliente. El orden actual coloca cliente, conversión, archivos,
comentarios, historial, estado, descripción y observaciones en una secuencia
larga. Se recomienda:

- cabecera tipo ficha con referencia, cliente, estado y fecha;
- bloque de acciones operativas visible;
- descripción y archivos cerca de la información principal;
- comentarios e historial como secciones de seguimiento;
- ID completo relegado a metadata secundaria.

### Listado de pedidos

Es el listado más denso y el de mayor riesgo responsive. La tabla mezcla
identidad, origen, trabajo, estado, progreso, personal y fechas. En desktop debe
permitir escaneo por estado, prioridad y entrega. En móvil la ficha debe mostrar
número, título, cliente, estado, prioridad, progreso, entrega y responsables,
ocultando referencias secundarias hasta el detalle.

### Detalle de pedido

Contiene todas las piezas necesarias para operar: estado, tareas, asignaciones,
comentarios, historial y archivos. La página tiene una segunda cabecera dentro
del detalle además de `PageHeader`, lo que diluye la jerarquía. Se recomienda
una única cabecera de ficha, un resumen de progreso y acciones próximas, y una
composición desktop con contenido principal y panel lateral operativo. En móvil
las acciones críticas pueden mantenerse accesibles mediante una barra inferior
no invasiva, solo si las pruebas confirman su utilidad.

### Clientes

Listado, detalle y formularios son simples y claros. El módulo se beneficia de
una ficha de contacto más reconocible, enlaces de teléfono/correo cuando sea
adecuado y acceso contextual a pedidos relacionados en una fase posterior. La
tabla móvil debe ser una lista compacta, no una tabla desplazable.

### Usuarios internos

El listado tiene una identidad visual ligera mediante iniciales y badge de
estado. La explicación sobre Auth es importante, pero ocupa una alerta con el
mismo peso que incidencias operativas. Debe convertirse en información
contextual. En formularios, el UUID de Auth necesita ayuda visual especialmente
clara por ser una operación técnica para un usuario administrativo.

### Formularios internos

Presentan una base consistente y segura. Deben normalizarse mediante
`FormField`, controles comunes y grupos de formulario. Las acciones deben
mantener una posición predecible. Para formularios largos se recomienda:

- secciones con títulos y descripción breve;
- campos requeridos claramente indicados;
- errores por campo y resumen opcional;
- botones con jerarquía primaria/secundaria;
- prevención visible de doble envío;
- ancho máximo de lectura conservador.

### Archivos

La lista evita exponer rutas privadas y utiliza descarga controlada. Visualmente
puede adoptar el concepto de anexos: icono por tipo, nombre, tamaño/fecha,
origen y acción de descarga. En móvil, nombre y acción deben mantenerse
visibles sin depender de una línea demasiado larga.

### Comentarios e historial

Los comentarios son legibles y el historial ya funciona como registro. Ambos
usan tarjetas grises muy similares. Conviene diferenciarlos:

- comentarios como notas internas con autor y contenido;
- historial como timeline cronológico más compacto;
- eventos técnicos traducidos a lenguaje operativo;
- metadata secundaria visualmente contenida.

### Estados vacíos

Son adecuados y no confunden ausencia de datos con error. Deben normalizarse en
un componente con variantes:

- primer uso;
- sin resultados;
- sección opcional vacía;
- acción no disponible;
- carga fallida, que no debe usar el estilo de vacío.

### Responsive móvil

La composición general se apila correctamente, pero la navegación y las tablas
son las dos áreas que requieren diseño específico. También debe revisarse:

- padding de 24 px en pantallas de 320-375 px;
- textos monoespaciados largos;
- acciones de 36-40 px;
- orden de ayudas del formulario público;
- longitud de detalles y formularios de tareas;
- scroll horizontal anidado;
- visibilidad de estados y acciones sin hover.

## 6. Evaluación del sistema visual actual

### Colores

La paleta actual usa zinc/stone como base y teal como acento. Es clara, pero
genérica y no refleja los colores de marca aportados. Teal asume demasiados
significados: foco, acción, estado, éxito e información.

### Tipografía

Geist ofrece excelente legibilidad y debe conservarse inicialmente. Geist Mono
funciona para referencias cortas, pero los UUID completos deben usarse con
moderación. No se recomienda introducir otra familia tipográfica en la primera
subfase: la identidad puede construirse con escala, peso, color y composición.

### Espaciado

La escala basada en 4 px es coherente. Predominan `gap-4/5/6/8`, `p-5/6/8` y
secciones con `space-y-6/8`. El sistema necesita reglas explícitas para:

- separación entre página y secciones;
- padding de cards compactas y amplias;
- densidad de tabla;
- separación de formularios;
- adaptación móvil.

### Bordes

Los bordes `zinc-200/300` son visibles y discretos. Deben convertirse en tokens
para permitir una base cálida de papel sin mezclar grises fríos y cálidos.

### Sombras

`shadow-sm` se usa casi universalmente. Conviene reservar sombra para
superficies elevadas y usar borde o contraste de fondo para superficies
contenidas. Se propone una sombra suave tipo hoja, sin elevación dramática.

### Botones

Existen patrones reconocibles, pero no variantes formales. Se requieren:
primario de marca, secundario, ghost, peligro y enlace. Alturas recomendadas:
40 px compacta en desktop y 44 px por defecto/táctil.

### Inputs

Los inputs tienen buen contraste, labels y feedback. Se debe unificar borde,
radio, altura, foco, error, disabled y texto de ayuda. `focus-visible` debe
preferirse para elementos de acción; los campos pueden conservar foco visible
en cualquier modalidad.

### Cards

Las cards son limpias, pero todas parecen equivalentes. Deben existir variantes:
surface, muted, interactive, work-item, stat y inset. La metáfora de papel debe
ser sutil: fondo cálido, borde fino y sombra corta.

### Tablas

La semántica es correcta. Falta:

- hover/foco de fila;
- caption accesible cuando aporte contexto;
- densidad consistente;
- encabezado o primera columna sticky solo si se valida su necesidad;
- alternativa móvil;
- estados y prioridades más escaneables.

### Badges

Los badges tienen buena forma y legibilidad, pero la semántica de color es
insuficiente. Deben mapear estado y prioridad a tokens, no a clases dispersas.

### Alertas

Las alertas de error, warning y éxito ya tienen texto claro. Se recomienda
normalizar icono, título opcional, cuerpo, acción y rol ARIA. Información
contextual persistente no debe verse igual que una alerta temporal.

### Mensajes

El microcopy es generalmente directo. Debe distinguirse entre:

- error recuperable;
- restricción de negocio;
- advertencia;
- confirmación;
- información persistente;
- estado de carga.

## 7. Propuesta de dirección visual

### Concepto

**Workspace de producción en papel.**

La aplicación debe sentirse como una mesa de trabajo digital organizada:
pedidos como fichas, solicitudes como entradas, archivos como anexos, estados
como etiquetas y el historial como registro de producción. La referencia a
papelería debe aparecer en proporciones, superficies, separadores y detalles,
no mediante texturas fuertes, ilustraciones infantiles o adornos constantes.

### Principios

1. Operación antes que decoración.
2. Azul para navegación, confianza y acción principal.
3. Naranja para atención, prioridad y acentos limitados.
4. Fondos cálidos y superficies claras tipo hoja.
5. Estados reconocibles por texto, color y, cuando aporte valor, icono.
6. Densidad ajustable según el tipo de pantalla.
7. Movimiento mínimo, funcional y respetuoso con `prefers-reduced-motion`.

### Paleta inicial sugerida

Los valores son una base de trabajo y deberán validarse con contraste WCAG en
texto, bordes y estados.

| Token | Valor sugerido | Uso |
| --- | --- | --- |
| `background` | `#F6F4EF` | Fondo cálido general |
| `surface` | `#FFFFFF` | Cards y hojas principales |
| `surface-muted` | `#EEECE6` | Zonas secundarias e inset |
| `surface-raised` | `#FFFEFC` | Superficie elevada sutil |
| `text-primary` | `#2F3034` | Texto principal |
| `text-secondary` | `#5F6268` | Descripciones y metadata |
| `text-muted` | `#777A80` | Texto auxiliar con contraste validado |
| `brand-primary` | `#145D99` | Acción principal y navegación |
| `brand-primary-hover` | `#104E82` | Hover/pressed azul |
| `brand-primary-soft` | `#E8F1F8` | Fondos informativos y selección |
| `brand-accent` | `#E55026` | Atención y detalle de marca |
| `brand-accent-hover` | `#C94420` | Hover/pressed naranja |
| `brand-accent-soft` | `#FCEDE7` | Prioridad o atención suave |
| `border` | `#D9D6CF` | Bordes generales |
| `border-strong` | `#BEBAB1` | Separadores de mayor jerarquía |
| `success` | `#2F7D56` | Éxito y completado |
| `success-soft` | `#E8F5EE` | Fondo de éxito |
| `warning` | `#A86608` | Advertencia y próximo vencimiento |
| `warning-soft` | `#FFF3D8` | Fondo de advertencia |
| `danger` | `#B33A3A` | Error, rechazo y cancelación |
| `danger-soft` | `#FCEBEC` | Fondo de error |
| `info` | `#3171AF` | Información operativa |
| `info-soft` | `#EAF2FA` | Fondo informativo |

### Aplicación de marca

- Sidebar azul profundo, no negro puro.
- Botón primario azul.
- Naranja reservado para prioridad, atención y pequeños acentos.
- Superficies blancas sobre fondo papel.
- Línea o pestaña sutil en fichas de trabajo, sin simular objetos físicos de
  manera literal.
- Logo real cuando exista un asset aprobado; no recrearlo de memoria.

### Estados sugeridos

- Neutral/creado: gris azulado.
- Nueva/solicitud recibida: azul.
- En revisión: índigo o azul medio.
- Contactada/en producción: naranja o ámbar controlado.
- Aprobada/listo para entrega: verde azulado.
- Convertida/entregado: verde.
- Rechazada/cancelado: rojo.
- Prioridad urgente: rojo con texto explícito.
- Prioridad alta: naranja.
- Prioridad normal: azul/gris.
- Prioridad baja: neutral.

## 8. Componentes UI recomendados

| Componente | Propósito y uso | Prioridad | Tipo recomendado |
| --- | --- | --- | --- |
| `AppShell` | Estructura general, skip link, sidebar, header móvil y `main` | Alta | Server, con isla cliente para menú móvil |
| `DashboardSidebar` | Navegación por rol, estado activo y usuario | Alta | Cliente mínimo para pathname/menú, o estado activo pasado desde shell |
| `PageHeader` | Título, descripción, breadcrumbs, metadata y acciones | Alta | Server por defecto |
| `SectionHeader` | Título, ayuda y acción de una sección | Alta | Server |
| `Button` | Variantes primary, secondary, ghost, danger y tamaños | Alta | Server por defecto; cliente solo por interacción requerida |
| `Input` | Estilo y estados comunes de input | Alta | Server-compatible |
| `Select` | Estilo y estados comunes de select | Alta | Server-compatible |
| `Textarea` | Estilo y estados comunes de textarea | Alta | Server-compatible |
| `FormField` | Label, requerido, ayuda, error y `aria-describedby` | Alta | Server-compatible |
| `Card` | Superficies base con variantes de densidad/elevación | Alta | Server |
| `Alert` | Error, warning, info y success normalizados | Alta | Server |
| `StatusBadge` | Estado semántico de solicitud/pedido/tarea | Alta | Server |
| `PriorityBadge` | Prioridad de pedido | Alta | Server |
| `EmptyState` | Primer uso, sin resultados y sección vacía | Alta | Server |
| `DataTable` | Estructura desktop común y accesible | Media | Server |
| `MobileCardList` | Alternativa móvil a tablas densas | Alta | Server |
| `StatCard` | Métrica con intención y énfasis configurable | Media | Server |
| `DetailPanel` | Grupo de datos con `dl`, título y acción | Media | Server |
| `WorkItemCard` | Ficha operativa para solicitud o pedido | Alta | Server |
| `Timeline` | Historial cronológico compacto | Media | Server |
| `FileList` | Anexos con tipo, metadata segura y descarga | Media | Server; formulario de upload cliente separado |
| `CommentList` | Notas internas con autor y fecha | Media | Server; composer cliente separado |
| `Skeleton` | Feedback de carga para rutas y secciones | Media | Server/estático |

Regla de arquitectura: los componentes puramente visuales deben permanecer como
Server Components o componentes compatibles con servidor. Solo deben marcarse
como cliente los controles que necesiten estado, eventos, `useActionState`,
pathname interactivo o comportamiento de menú.

## 9. Estrategia responsive recomendada

### Breakpoints

- **Base / 320-639 px:** móvil, una columna, targets de 44 px.
- **`sm` / 640 px:** formularios simples a dos columnas cuando los campos lo
  permitan.
- **`md` / 768 px:** transición de navegación móvil y mayor densidad.
- **`lg` / 1024 px:** detalles en dos columnas y ayudas laterales.
- **`xl` / 1280 px:** dashboard y paneles operativos amplios.
- **`2xl` / 1536 px:** limitar ancho de lectura; no expandir indefinidamente.

### Sidebar

- Móvil: header compacto con marca, título de sección y botón de menú.
- Tablet: panel lateral colapsable si aporta espacio.
- Desktop: sidebar fija o sticky con estado activo.
- Mantener navegación por rol y no duplicar reglas de permiso en cliente.

### Tablas

- Móvil: ocultar tabla y renderizar `MobileCardList` desde los mismos datos.
- Tablet: tabla simplificada con columnas prioritarias.
- Desktop: tabla completa.
- Evitar que scroll horizontal sea la única solución.

### Filtros

- Móvil: búsqueda visible y filtros en bloque expandible o sheet simple.
- Mostrar filtros activos como resumen textual o chips removibles.
- Mantener sincronización con URL y feedback `aria-live`.
- Evitar crear estado cliente duplicado del estado de URL.

### Formularios

- Una columna por defecto.
- Dos columnas desde `sm` solo para campos relacionados y cortos.
- Textareas y campos conceptualmente principales a ancho completo.
- Acciones apiladas y de ancho completo en móvil.
- Ayuda y errores inmediatamente próximos al campo.

### Dashboard

- Móvil: primero alertas y trabajo pendiente, después métricas.
- Tablet: métricas en dos columnas.
- Desktop: grupos de métricas y paneles en dos columnas.
- No depender de hover para revelar acciones.

### Detalles

- Móvil: flujo vertical con resumen inicial y secciones plegables solo cuando la
  complejidad lo justifique.
- Desktop: contenido principal más panel lateral operativo.
- Usar anclas o índice de secciones en detalles largos.

### Acciones principales

- Acción primaria cerca del título o estado actual.
- Acciones destructivas separadas visualmente.
- En móvil, botones de ancho completo cuando haya pocas acciones.
- Evitar barras sticky que tapen contenido o teclado; validar antes de adoptar.

### Cards en móvil

- Mostrar de 4 a 7 datos prioritarios.
- Mantener título, estado y acción visibles.
- Usar metadata secundaria en dos columnas internas cuando sea legible.
- Toda la card puede ser enlace solo si no contiene controles anidados.

## 10. Riesgos de implementación

1. **Convertir layouts completos en Client Components.** Mantener shell y datos
   en servidor; aislar menú móvil y controles interactivos.
2. **Mover consultas Supabase al cliente.** La fase visual no debe cambiar la
   arquitectura de datos ni permisos.
3. **Duplicar tabla y cards con lógica distinta.** Ambas vistas deben recibir el
   mismo modelo de presentación y labels centralizados.
4. **Crear un componente universal demasiado complejo.** Normalizar primitivas
   pequeñas y variantes reales, no abstraer toda pantalla en una sola API.
5. **Cambiar semántica de estados por estética.** Los colores deben mapear los
   estados existentes sin modificar transiciones ni reglas.
6. **Usar naranja como CTA general.** Reservarlo para atención y marca evita
   fatiga y competencia con alertas.
7. **Reducir contraste por buscar apariencia de papel.** Los fondos cálidos no
   justifican texto gris claro ni bordes invisibles.
8. **Introducir iconos o librerías sin necesidad.** Priorizar SVG locales o una
   decisión explícita posterior; no añadir dependencias en esta fase base.
9. **Aplicar animaciones globales.** Mantener transiciones de 150-250 ms y
   respetar `prefers-reduced-motion`.
10. **Ocultar acciones por hover.** El sistema debe seguir siendo usable con
    teclado y touch.
11. **Romper formularios con wrappers visuales.** Conservar `name`, `id`,
    labels, mensajes y Server Actions.
12. **Alterar metadata sensible.** No mostrar `file_path`, metadata cruda ni
    datos fuera del alcance por rol.
13. **Rediseñar todos los módulos simultáneamente.** Migrar por capas para poder
    comparar, probar y corregir.
14. **Ignorar estados intermedios.** Probar loading, vacío, error, success,
    disabled, permisos y contenido largo.
15. **Afectar lógica crítica.** No modificar RLS, RPCs, Storage, permisos,
    validaciones, conversión, asociación de clientes ni consultas de negocio.

## 11. Plan propuesto de subfases UI/UX

### 14.1 Auditoría

- **Objetivo:** documentar estado, riesgos y dirección visual.
- **Archivos probables:** `docs/ui-ux/FASE_14_AUDITORIA_UI_UX.md`.
- **Impacto esperado:** base compartida para decisiones.
- **Riesgo:** bajo.
- **Criterios de aceptación:** auditoría aprobada, sin cambios de aplicación.

### 14.2 Sistema visual base

- **Objetivo:** definir tokens de color, tipografía, espacio, radio, sombra,
  foco y movimiento.
- **Archivos probables:** `src/app/globals.css`, `src/app/layout.tsx`,
  documentación del design system.
- **Impacto esperado:** identidad y consistencia transversal.
- **Riesgo:** medio por alcance global.
- **Criterios de aceptación:** contraste validado, tokens semánticos disponibles,
  sin cambio funcional.

### 14.3 Componentes UI comunes

- **Objetivo:** crear primitivas para Button, campos, Card, Alert, Badge,
  EmptyState y encabezados.
- **Archivos probables:** `src/components/ui/*` y formularios piloto.
- **Impacto esperado:** menor duplicación y mejor accesibilidad.
- **Riesgo:** medio.
- **Criterios de aceptación:** variantes documentadas, Server Components por
  defecto y migración piloto sin regresiones.

### 14.4 Layout y navegación

- **Objetivo:** implementar AppShell, estado activo, skip link y navegación
  móvil.
- **Archivos probables:** `src/app/dashboard/layout.tsx`,
  `src/components/layout/DashboardSidebar.tsx`, `PublicHeader.tsx`.
- **Impacto esperado:** orientación y responsive global.
- **Riesgo:** medio por permisos y rutas.
- **Criterios de aceptación:** navegación visible correcta por rol, teclado,
  móvil y desktop; sin duplicar permisos.

### 14.5 Dashboard

- **Objetivo:** priorizar trabajo accionable y agrupar métricas.
- **Archivos probables:** `src/app/dashboard/page.tsx`,
  `src/components/dashboard/*`.
- **Impacto esperado:** decisiones diarias más rápidas.
- **Riesgo:** bajo-medio; los datos no deben cambiar.
- **Criterios de aceptación:** jerarquía por rol, alertas visibles, métricas
  secundarias contenidas y estados de carga/vacío.

### 14.6 Listados

- **Objetivo:** normalizar tablas, badges, filtros y cards móviles.
- **Archivos probables:** `InternalSolicitudesList.tsx`,
  `InternalPedidosList.tsx`, `InternalClientesList.tsx`,
  `InternalUsersList.tsx`, `ListFiltersBar.tsx`.
- **Impacto esperado:** escaneo más rápido y uso móvil real.
- **Riesgo:** medio por duplicación de representación.
- **Criterios de aceptación:** mismos datos en desktop/móvil, acciones
  accesibles, sin overflow de página a 375 px.

### 14.7 Detalles

- **Objetivo:** convertir detalles en fichas de trabajo con resumen y secciones.
- **Archivos probables:** `InternalSolicitudDetail.tsx`,
  `InternalPedidoDetail.tsx`, `InternalClienteDetail.tsx`,
  `InternalUserDetail.tsx`.
- **Impacto esperado:** menor tiempo para localizar información y acciones.
- **Riesgo:** medio por páginas extensas.
- **Criterios de aceptación:** una jerarquía de encabezados clara, acciones
  visibles, metadata secundaria contenida y responsive validado.

### 14.8 Formularios

- **Objetivo:** migrar formularios internos a controles comunes.
- **Archivos probables:** formularios de clientes, pedidos, usuarios, estado,
  tareas y asignaciones.
- **Impacto esperado:** consistencia, accesibilidad y mantenimiento.
- **Riesgo:** medio-alto por validaciones y Server Actions.
- **Criterios de aceptación:** mismos nombres y contratos, errores anunciados,
  estados pending/disabled correctos y sin cambios de negocio.

### 14.9 Formulario público

- **Objetivo:** aplicar la identidad pública, mejorar ayuda, confianza y éxito.
- **Archivos probables:** `src/app/solicitud/page.tsx`,
  `PublicSolicitudForm.tsx`, `PublicHeader.tsx`.
- **Impacto esperado:** envío más claro para usuarios externos.
- **Riesgo:** medio por ser flujo público y carga de archivos.
- **Criterios de aceptación:** envío válido/erróneo probado, archivos claros,
  referencia visible, móvil a 375 px y sin exposición de datos.

### 14.10 Responsive

- **Objetivo:** revisión transversal en tamaños reales y corrección de bordes.
- **Archivos probables:** layouts y componentes migrados en 14.2-14.9.
- **Impacto esperado:** coherencia entre móvil, tablet y desktop.
- **Riesgo:** medio por cambios cruzados.
- **Criterios de aceptación:** 375, 768, 1024 y 1440 px; sin scroll horizontal
  global; targets táctiles; contenido largo y zoom revisados.

### 14.11 Revisión final

- **Objetivo:** auditoría visual, accesible y funcional posterior.
- **Archivos probables:** documentación, checklist y correcciones puntuales.
- **Impacto esperado:** cierre seguro de fase.
- **Riesgo:** bajo si no se acumulan cambios tardíos.
- **Criterios de aceptación:** lint/build, flujos críticos manuales, teclado,
  contraste, responsive, permisos por rol y aprobación visual.

## 12. Recomendación de primera tarea de implementación

La primera tarea real debería ser **14.2A: definir tokens visuales semánticos y
documentarlos, sin migrar todavía todas las pantallas**.

Alcance recomendado:

1. Añadir tokens de color, superficie, texto, borde, radio, sombra y foco.
2. Mantener Geist y la escala tipográfica actual.
3. Crear una página o documento de referencia, no un rediseño masivo.
4. Migrar únicamente un componente de bajo riesgo, preferiblemente
   `PageHeader` o `PlaceholderCard`, para validar la integración.
5. Ejecutar contraste, lint y build.

Es una tarea pequeña y segura porque prepara la base sin tocar lógica, datos,
permisos ni formularios críticos. También evita rediseñar páginas con valores
hex y clases que luego habría que reemplazar.

## 13. Checklist final de auditoría

### Sistema visual

- [x] Los colores usan tokens semánticos.
- [x] Azul y naranja tienen funciones diferenciadas.
- [ ] Texto y bordes cumplen contraste.
- [ ] Radios, sombras y espacios siguen escalas definidas.
- [x] Geist se usa de forma consistente.
- [ ] Monoespaciada se reserva para referencias útiles.

### Arquitectura

- [x] Server Components siguen siendo el valor por defecto.
- [x] No hay consultas Supabase nuevas en componentes cliente.
- [x] No se movió lógica sensible al navegador.
- [x] No se duplicaron reglas de permisos.
- [x] No se modificaron RLS, RPCs, Storage ni servicios críticos.
- [x] No se introdujeron dependencias innecesarias.

### Navegación

- [x] La ruta activa es visible y usa `aria-current`.
- [x] Existe skip link al contenido.
- [x] El orden de tabulación es lógico.
- [x] La navegación móvil es clara y operable.
- [x] La visibilidad por rol se conserva.

### Componentes

- [x] Botones tienen variantes y tamaños consistentes.
- [ ] Inputs, selects y textareas comparten estados.
- [x] Alerts, badges y estados vacíos están normalizados.
- [x] Estados y prioridades no dependen solo del color.
- [x] No existen componentes universales innecesariamente complejos.

### Formularios

- [ ] Todos los campos tienen label.
- [ ] Ayuda y error están asociados mediante ARIA.
- [ ] Pending, disabled, success y error son visibles.
- [ ] Los contratos de Server Actions no cambiaron.
- [ ] Los campos usan teclado móvil apropiado.
- [ ] Las acciones son claras y no permiten doble envío accidental.

### Responsive

- [ ] Revisado a 375 px.
- [ ] Revisado a 768 px.
- [ ] Revisado a 1024 px.
- [ ] Revisado a 1440 px.
- [x] No hay scroll horizontal global.
- [x] Las tablas tienen alternativa móvil.
- [x] Los targets táctiles principales alcanzan 44 px.
- [x] Hay al menos 8 px entre acciones táctiles adyacentes.

### Accesibilidad

- [x] El foco visible es consistente.
- [ ] La UI funciona con teclado.
- [ ] Los mensajes importantes se anuncian.
- [ ] La jerarquía de headings es correcta.
- [ ] `prefers-reduced-motion` es respetado.
- [ ] El zoom al 200 % no oculta contenido o acciones.
- [ ] Iconos decorativos están ocultos a tecnologías de asistencia.

### Contenido y estados

- [ ] Loading, vacío, error, éxito y permisos están diseñados.
- [ ] Los mensajes usan lenguaje operativo y no metadata cruda.
- [ ] No se expone `file_path`.
- [ ] Las referencias completas no dominan la pantalla.
- [x] El dashboard prioriza acciones sobre métricas decorativas.
- [ ] Comentarios, historial y archivos se distinguen visualmente.

### Verificación final

- [ ] Flujos públicos revisados.
- [ ] Flujos de admin revisados.
- [ ] Flujos de supervisor revisados.
- [ ] Flujos de trabajador revisados.
- [x] Lint aprobado.
- [x] Build aprobado.
- [ ] Revisión manual en navegador y dispositivos reales completada.

## Avance de implementación UI/UX

### 14.2A — Sistema visual base

- **Fecha:** 7 de junio de 2026.
- **Cambios realizados:** definición de tokens semánticos de color, superficie,
  texto, borde, foco, radio, sombra y movimiento; estilos globales mínimos de
  selección, foco visible y movimiento reducido; migración piloto de
  `PageHeader` y `PlaceholderCard`.
- **Archivos modificados:** `src/app/globals.css`,
  `src/components/ui/PageHeader.tsx`,
  `src/components/ui/PlaceholderCard.tsx`,
  `docs/ui-ux/FASE_14_DESIGN_SYSTEM.md` y este documento.
- **Validaciones ejecutadas:** `npm run lint` aprobado y `npm run build`
  aprobado con Next.js 16.2.6.
- **Observaciones:** Geist se mantiene como fuente principal. No se añadieron
  dependencias, Client Components, consultas, cambios de permisos ni lógica de
  negocio. La migración visual completa queda fuera de esta subfase.

### 14.3A — Componentes UI comunes base

- **Fecha:** 7 de junio de 2026.
- **Cambios realizados:** creación de `Button`, `Card`, `Alert`,
  `StatusBadge`, `PriorityBadge` y `EmptyState`; export público opcional y
  migración piloto de `PlaceholderCard` mediante composición.
- **Archivos modificados:** componentes base en `src/components/ui`,
  `src/components/ui/PlaceholderCard.tsx`,
  `docs/ui-ux/FASE_14_DESIGN_SYSTEM.md` y este documento.
- **Validaciones ejecutadas:** `npm run lint` y `npm run build` aprobados con
  Next.js 16.2.6.
- **Observaciones:** se conservaron Server Components y contratos existentes.
  Los badges reutilizan etiquetas canónicas del dominio, expresan el estado con
  texto además de color y mantienen un fallback neutro. No se tocaron
  permisos, RLS, RPCs, servicios, formularios, pantallas ni dependencias.

### 14.4A — Layout interno y navegación responsive

- **Fecha:** 7 de junio de 2026.
- **Cambios realizados:** refinamiento del shell interno con sidebar desktop
  de marca, navegación activa, `aria-current`, skip link, destino principal
  accesible, ancho de contenido controlado y navegación móvil vertical.
- **Archivos modificados:** `src/app/dashboard/layout.tsx`,
  `src/components/layout/DashboardSidebar.tsx`,
  `src/components/layout/DashboardMobileNav.tsx`,
  `src/components/layout/DashboardNavLink.tsx`,
  `src/components/layout/SkipLink.tsx`,
  `src/components/layout/dashboard-nav-items.ts`,
  `src/components/auth/LogoutButton.tsx`,
  `docs/ui-ux/FASE_14_DESIGN_SYSTEM.md` y este documento.
- **Validaciones ejecutadas:** `npm run lint` y `npm run build` aprobados con
  Next.js 16.2.6. Inspección visual autenticada con perfil admin en Edge 149,
  a 1440 × 1000 px y 375 × 812 px, sobre `/dashboard`,
  `/dashboard/solicitudes`, `/dashboard/pedidos`, `/dashboard/clientes`,
  `/dashboard/usuarios` y `/dashboard/configuracion`.
- **Observaciones:** el filtrado por rol permanece en `DashboardSidebar`, que
  sigue siendo Server Component. Solo `DashboardNavLink` usa `usePathname` en
  cliente para presentar la ruta activa y cerrar el menú móvil tras navegar.
  No se añadieron consultas, permisos, dependencias ni cambios de negocio. No
  se detectó overflow horizontal global ni solapamiento del shell. Las tablas
  conservan su scroll horizontal interno en móvil, pendiente de la subfase de
  listados y fuera del alcance de 14.4A.

### 14.5A — Dashboard operativo

- **Fecha:** 8 de junio de 2026.
- **Cambios realizados:** reorganización del dashboard para situar atención y
  trabajo pendiente antes de las métricas; nueva zona de atención operativa;
  métricas con intención visual; fichas de solicitudes y pedidos con badges
  canónicos; actividad reciente como registro compacto.
- **Archivos modificados:** `src/app/dashboard/page.tsx`, componentes de
  `src/components/dashboard`, `docs/ui-ux/FASE_14_DESIGN_SYSTEM.md` y este
  documento.
- **Validaciones ejecutadas:** `npm run lint` y `npm run build` aprobados con
  Next.js 16.2.6. Inspección visual autenticada con perfil admin de prueba en
  Edge 149 a 1440 × 1000 px y 375 × 812 px.
- **Observaciones:** se conservaron todos los datos, enlaces, loaders,
  consultas, prioridades y variantes por rol existentes. El dashboard y sus
  componentes presentacionales siguen renderizándose en servidor. No se
  añadieron estadísticas, gráficos, dependencias, permisos ni lógica de
  negocio. No se detectó overflow horizontal global en `/dashboard`; la
  jerarquía, fichas, métricas y actividad conservaron legibilidad en ambos
  tamaños. La comprobación visual de otros roles queda pendiente al no disponer
  de credenciales específicas para supervisor y trabajador.

### 14.6A — Listados operativos

- **Fecha:** 8 de junio de 2026.
- **Cambios realizados:** tablas desktop normalizadas y cards móviles para
  solicitudes, pedidos, clientes y usuarios; filtros migrados a tokens
  semánticos; estados, prioridades, alertas y vacíos normalizados; acciones de
  detalle con targets de 44 px.
- **Archivos modificados:** páginas de listado de solicitudes, pedidos,
  clientes y usuarios; sus componentes `Internal*List`;
  `src/components/common/ListFiltersBar.tsx`,
  `src/components/ui/StatusBadge.tsx`,
  `docs/ui-ux/FASE_14_DESIGN_SYSTEM.md` y este documento.
- **Validaciones ejecutadas:** `npm run lint` y `npm run build` aprobados con
  Next.js 16.2.6. Inspección visual autenticada en Edge 149 con perfil admin
  sobre los cuatro listados a 1440 × 1000 px, 768 × 1024 px y 375 × 812 px.
  El listado de pedidos también se validó con perfil trabajador en los tres
  tamaños. No se detectó scroll horizontal global y todos los controles
  visibles mantuvieron un alto mínimo de 44 px.
- **Observaciones:** las cards y tablas reciben los mismos arrays cargados en
  servidor. No se modificaron consultas, filtros funcionales, rutas, permisos,
  servicios ni acciones. Las tablas se reservan desde `lg` y conservan scroll
  interno cuando su densidad lo requiere; tablet y móvil usan cards y ya no
  dependen de ese scroll. Supervisor comparte estos listados operativos con
  admin salvo las áreas exclusivas de usuarios y configuración.
