# Fase 14 — Sistema visual base

## 1. Concepto visual

El sistema visual de Godel Diseño parte del concepto **Workspace de producción
en papel**: una mesa de trabajo digital organizada para gestionar solicitudes,
pedidos, tareas, archivos y actividad operativa.

La referencia a papelería e impresión se expresa mediante fondos cálidos,
superficies claras, bordes suaves, sombras discretas y etiquetas de estado. No
se busca imitar papel de forma literal ni añadir decoración que compita con la
operación.

## 2. Principios visuales

1. Operación antes que decoración.
2. Azul como color operativo principal.
3. Naranja como acento de atención, prioridad y marca.
4. Superficies claras tipo hoja sobre un fondo cálido.
5. Jerarquía visible mediante contraste, espacio y peso tipográfico.
6. Estados comunicados con texto además de color.
7. Movimiento breve, funcional y reducible.
8. Geist como familia principal para conservar legibilidad y rendimiento.

## 3. Tokens definidos

Los tokens viven en `src/app/globals.css`. Los colores están expuestos a
Tailwind CSS v4 mediante `@theme inline`.

| Token | Valor | Uso recomendado |
| --- | --- | --- |
| `background` | `#F6F4EF` | Fondo cálido general |
| `foreground` | `#2F3034` | Color base heredado del documento |
| `surface` | `#FFFFFF` | Cards y hojas principales |
| `surface-muted` | `#EEECE6` | Zonas secundarias e interiores |
| `surface-raised` | `#FFFEFC` | Superficies con elevación sutil |
| `text-primary` | `#2F3034` | Títulos y contenido principal |
| `text-secondary` | `#5F6268` | Descripciones y metadata |
| `text-muted` | `#6B6D72` | Texto auxiliar con uso limitado |
| `brand-primary` | `#145D99` | Navegación y acciones principales |
| `brand-primary-hover` | `#104E82` | Hover y estado presionado azul |
| `brand-primary-soft` | `#E8F1F8` | Selección y fondos azules suaves |
| `brand-accent` | `#E55026` | Atención, prioridad y marca |
| `brand-accent-hover` | `#C94420` | Hover y estado presionado naranja |
| `brand-accent-soft` | `#FCEDE7` | Fondo de atención suave |
| `border` | `#D9D6CF` | Bordes generales |
| `border-strong` | `#B8B4AA` | Separadores y bordes destacados |
| `success` | `#2F7D56` | Acción completada o éxito |
| `success-soft` | `#E8F5EE` | Fondo de éxito |
| `warning` | `#9A5F06` | Advertencia o próximo vencimiento |
| `warning-soft` | `#FFF3D8` | Fondo de advertencia |
| `danger` | `#B33A3A` | Error, rechazo o cancelación |
| `danger-soft` | `#FCEBEC` | Fondo de error |
| `info` | `#3171AF` | Información operativa |
| `info-soft` | `#EAF2FA` | Fondo informativo |
| `focus-ring` | `#3171AF` | Contorno global de foco visible |
| `shadow-soft` | Dos capas de baja opacidad | Elevación tipo hoja |
| `radius-card` | `0.75rem` | Cards y paneles |
| `radius-control` | `0.5rem` | Inputs, botones y controles |

## 4. Uso de colores

- **Azul:** navegación, selección, foco, enlaces operativos y CTA principal.
- **Naranja:** prioridad, atención y pequeños detalles de marca. No se usa como
  CTA general.
- **Neutros cálidos:** estructura, fondos, superficies, bordes y texto.
- **Éxito:** confirmaciones y estados completados.
- **Warning:** situaciones que necesitan revisión sin ser errores.
- **Danger:** errores, acciones destructivas y estados negativos.
- **Info:** ayuda operativa y mensajes informativos.

Los estados siempre deben incluir texto. El color refuerza el significado, pero
no puede ser su única señal.

## 5. Superficies

- `background` representa la mesa o plano general de trabajo.
- `surface` es la hoja estándar para cards, formularios y paneles.
- `surface-muted` contiene información secundaria o grupos internos.
- `surface-raised` se reserva para elementos con una elevación mínima.

Las sombras deben ser sutiles y no sustituir un borde necesario. No todas las
cards requieren elevación.

## 6. Foco y accesibilidad

Los elementos interactivos reciben un contorno global de 3 px mediante
`:focus-visible`, usando `focus-ring` y un offset de 3 px. Los componentes no
deben eliminarlo sin proporcionar una alternativa de contraste equivalente.

La interfaz debe:

- mantener contraste suficiente entre texto y fondo;
- usar labels y mensajes asociados a controles;
- comunicar estados mediante texto además de color;
- conservar navegación completa por teclado;
- respetar `prefers-reduced-motion`.

La regla global de movimiento reducido minimiza transiciones y animaciones sin
desactivar la interfaz.

## 7. Reglas de implementación

1. No usar valores hex sueltos cuando exista un token semántico adecuado.
2. No usar naranja como CTA general.
3. No convertir Server Components en Client Components por motivos de estilo.
4. No introducir dependencias visuales sin aprobación.
5. No tocar lógica de negocio para resolver estilos.
6. Usar colores Tailwind semánticos como `bg-surface`,
   `text-text-primary`, `border-border` y `text-brand-primary`.
7. Usar `radius-card`, `radius-control` y `shadow-soft` mediante sus variables
   CSS hasta que existan componentes UI normalizados.
8. Validar estados normal, hover, focus, disabled, error y éxito al migrar cada
   componente.

## 8. Secuencia de normalización

La subfase 14.3A incorpora `Button`, `Card`, `Alert`, `StatusBadge`,
`PriorityBadge` y `EmptyState`. `FormField` y los controles de formulario
quedan para una subfase posterior.

La adopción debe hacerse en pequeñas migraciones, conservando contratos y
Server Components por defecto.

## 9. Componentes UI base

Los componentes viven en `src/components/ui` y se exportan también desde
`src/components/ui/index.ts`. No contienen consultas, permisos, estado local ni
lógica de negocio.

### Button

- Variantes: `primary`, `secondary`, `ghost`, `danger` y `link`.
- Tamaños: `sm`, `md` y `lg`, con altura mínima de 40, 44 y 48 px.
- Acepta las props nativas de `button`, incluidos `type`, `disabled` y eventos.
- `primary` usa azul; `danger` queda reservado para acciones destructivas.

```tsx
<Button type="submit">Guardar cambios</Button>
<Button type="button" variant="danger">
  Eliminar pedido
</Button>
```

### Card

- Variantes: `default`, `muted`, `raised` e `interactive`.
- Padding: `sm`, `md` y `lg`.
- Puede renderizar `div`, `section` o `article` mediante `as`.
- `interactive` aporta feedback visual, pero el consumidor debe conservar la
  semántica de enlace o botón cuando toda la tarjeta sea accionable.

### Alert

- Variantes: `info`, `success`, `warning` y `danger`.
- Acepta título opcional y contenido libre.
- `danger` usa `role="alert"` y `success` usa `role="status"` por defecto.
- El texto siempre acompaña al color; no depende de iconos.

### StatusBadge y PriorityBadge

- Muestran una etiqueta textual además del tono semántico.
- Reutilizan las etiquetas canónicas de solicitudes y pedidos.
- Los valores desconocidos se humanizan y usan un estilo neutro.
- `PriorityBadge` contempla `baja`, `normal`, `alta` y `urgente`.

```tsx
<StatusBadge status="en_produccion" />
<PriorityBadge priority="urgente" />
```

### EmptyState

- Variantes: `default`, `search`, `permission` y `error`.
- Requiere `title` y `description`; acepta `action` y `eyebrow`.
- Sirve para ausencia de datos, búsquedas sin resultados, restricciones de
  acceso y errores recuperables.
- La acción debe ser concreta y solo mostrarse cuando exista una recuperación
  real para la persona usuaria.

### Restricciones

1. No usar estos componentes para encapsular permisos o transiciones de estado.
2. No convertirlos en Client Components solo para resolver estilos.
3. No añadir iconografía decorativa hasta definir el sistema de iconos.
4. No usar `Card interactive` como sustituto de semántica HTML accionable.
5. No extender variantes para casos aislados si `className` y los tokens
   existentes resuelven el caso de forma clara.

## 10. Layout y navegación

### Sidebar desktop

- El shell interno usa un lateral azul profundo de marca sobre el fondo cálido
  general.
- La marca y el subtítulo ocupan una cabecera estable; el cierre de sesión se
  mantiene separado en la zona inferior.
- Los enlaces visibles se calculan en servidor mediante las reglas de permisos
  existentes.
- El sidebar puede ser `sticky` en desktop, pero no debe ocultar contenido ni
  forzar el ancho de las páginas hijas.

### Navegación móvil

- En móvil se utiliza una cabecera compacta con navegación vertical
  desplegable mediante `details` y `summary`.
- Las rutas no dependen de scroll horizontal, hover, overlays ni iconos.
- Los targets principales mantienen una altura mínima de 44 px.
- El menú se cierra al elegir una ruta y conserva el comportamiento normal de
  `Link`.

### Navegación activa

- La ruta actual debe distinguirse mediante contraste, superficie y borde, no
  solo mediante color.
- El enlace activo expone `aria-current="page"`.
- Las rutas índice usan coincidencia exacta. Las secciones admiten sus rutas
  hijas, por ejemplo `/dashboard/pedidos/[id]`.
- `usePathname` queda aislado en un Client Component pequeño; el layout, el
  sidebar, los datos y el filtrado por rol permanecen en servidor.

### Acceso por teclado

- El shell incluye un enlace “Saltar al contenido principal” antes de la
  navegación.
- El contenido principal usa `id="main-content"` y puede recibir foco al usar
  el enlace de salto.
- El orden del DOM sigue el recorrido visual: skip link, navegación y
  contenido.
- El foco visible global no debe eliminarse en enlaces, `summary` ni botones.

### Restricciones

1. No duplicar reglas de permisos en componentes cliente.
2. No enviar el rol ni mapas de permisos al cliente para calcular navegación.
3. No consultar Supabase desde el shell cliente.
4. No convertir el layout completo en Client Component.
5. No usar negro puro cuando un azul profundo o grafito de marca sea adecuado.

## 11. Dashboard operativo

### Jerarquía

El dashboard debe ordenar la información según su utilidad diaria:

1. Encabezado y contexto del rol.
2. Atención operativa.
3. Solicitudes o pedidos que requieren acción.
4. Métricas de contexto.
5. Actividad reciente.

Las acciones y excepciones aparecen antes que las cifras generales. El
dashboard no debe obligar a recorrer una cuadrícula extensa para localizar el
trabajo pendiente.

### Atención operativa

- Solo muestra indicadores existentes con valor mayor que cero.
- Atrasos usan `danger`; entregas próximas, conversiones y falta de tareas usan
  `warning`; solicitudes pendientes pueden usar `info`.
- Cada indicador combina valor, etiqueta y explicación. El color nunca es la
  única señal.
- Cuando no existen incidencias se muestra un estado tranquilo de operación al
  día, sin crear una alerta falsa.

### Métricas

- Todas las métricas conservan título, valor y descripción.
- Las variantes `neutral`, `info`, `warning`, `danger` y `success` expresan
  intención, no tendencia ni análisis estadístico.
- Las métricas de atención pueden repetirse como contexto después de los
  paneles accionables, pero no deben dominar la parte superior.
- No añadir porcentajes, comparativas o tendencias que no existan en los datos.

### Fichas de trabajo

- Solicitudes: referencia, cliente, servicio, estado, fechas y acceso directo.
- Pedidos: número, trabajo, cliente, estado, prioridad, atención, progreso,
  entrega estimada y acceso directo.
- `StatusBadge` y `PriorityBadge` mantienen las etiquetas canónicas del
  dominio.
- Las fichas no modifican el orden ni la selección calculados por los loaders.

### Actividad reciente

- Se presenta como registro compacto ordenado cronológicamente.
- El origen `Pedido` o `Solicitud`, la fecha, el título, la descripción y la
  acción permanecen visibles.
- Azul identifica eventos de pedidos y naranja eventos de solicitudes, siempre
  acompañados por texto.

### Responsive

- Móvil: una columna; atención y trabajo pendiente antes que métricas.
- Tablet: métricas y datos internos pueden usar dos columnas.
- Desktop: solicitudes y pedidos pueden compartir dos columnas, mientras las
  métricas se distribuyen sin perder jerarquía.
- Las acciones deben alcanzar al menos 40 px y no depender de hover.
- El dashboard no debe introducir overflow horizontal global.

### Restricciones

1. No inventar estadísticas, tendencias, gráficos ni reportes.
2. No convertir el dashboard en un panel analítico avanzado.
3. No modificar consultas, orden de prioridad ni visibilidad por rol por
   motivos visuales.
4. No mover carga de datos o permisos a componentes cliente.
5. No rediseñar listados, detalles o formularios desde el dashboard.

## 12. Listados operativos

### Tabla desktop y cards móviles

- Cada listado recibe un único array desde servidor y renderiza dos
  representaciones presentacionales de esos mismos datos.
- Base móvil: cards operativas en una columna.
- Desde `lg`: tabla semántica con encabezados `scope="col"`.
- Las tablas densas pueden conservar scroll horizontal dentro de su propia
  superficie, pero nunca deben producir overflow global de la página.
- No duplicar consultas, permisos, ordenamiento ni transformación de dominio
  para construir la vista móvil.

### Datos prioritarios en cards

- **Solicitud:** referencia corta, cliente, servicio, estado, creación, fecha
  deseada y acceso a la solicitud.
- **Pedido:** número, trabajo, cliente, estado, prioridad, progreso, personal,
  entrega estimada y acceso al pedido.
- **Cliente:** nombre, teléfono, correo disponible, actualización y acceso al
  cliente.
- **Usuario:** nombre, referencia corta secundaria, rol, estado, teléfono,
  actualización y acceso al usuario.

Los UUID técnicos no deben dominar la card. Pueden mostrarse como referencia
corta y secundaria cuando ya formen parte del listado.

### Estados y prioridades

- `StatusBadge` representa estados de solicitudes, pedidos y usuarios.
- `PriorityBadge` representa prioridad de pedidos.
- Progreso usa texto explícito y un tono semántico; no depende solo del color.
- Las etiquetas visibles reutilizan los mapas canónicos del dominio.

### Filtros

- La búsqueda permanece visible y conserva sincronización con la URL.
- Los filtros se apilan en móvil y se distribuyen horizontalmente cuando existe
  espacio.
- Inputs, selects y limpiar filtros mantienen targets mínimos de 44 px.
- La superficie de filtros usa borde, fondo y sombra del sistema visual.
- El feedback de búsqueda continúa anunciado mediante `aria-live`.

### Acciones

- La acción de detalle siempre tiene texto específico: `Ver solicitud`,
  `Ver pedido`, `Ver cliente` o `Ver usuario`.
- En móvil ocupa el ancho disponible y alcanza al menos 44 px de alto.
- En desktop permanece en la última columna con foco y hover visibles.
- Acciones adyacentes deben conservar al menos 8 px de separación.

### Estados vacíos

- Sin datos: `EmptyState` con variante `default` y explicación de primer uso.
- Sin resultados: `EmptyState` con variante `search` y referencia explícita a
  los filtros actuales.
- No inventar una acción de recuperación cuando el listado no dispone de una.

### Restricciones

1. No cambiar consultas ni servicios para crear cards móviles.
2. No ocultar datos críticos de la tabla desktop.
3. No convertir los listados completos en Client Components.
4. No duplicar reglas de permisos o visibilidad.
5. No añadir paginación, ordenamiento o métricas que no existan.

## 13. Detalles operativos

### Concepto de ficha de trabajo

- Los detalles se presentan como fichas operativas, no como una pila uniforme
  de tarjetas.
- La cabecera identifica el registro con título, referencia corta, estado y
  prioridad cuando corresponde.
- El resumen superior concentra los datos necesarios para orientarse antes de
  entrar en formularios, anexos o actividad.
- Los UUID completos quedan dentro de paneles de metadata secundaria y nunca
  compiten con el título.

### Composición desktop

- Desde `xl`, los detalles complejos pueden usar una columna principal flexible
  y una columna secundaria de contexto.
- La columna principal contiene trabajo, tareas, archivos, comentarios e
  historial.
- La columna secundaria contiene estado, asignaciones, cliente, origen,
  acciones y metadata técnica.
- Los detalles simples de cliente y usuario usan una ficha principal y un
  panel lateral de registro sin simular complejidad inexistente.

### Composición móvil

- Una sola columna, con cabecera, resumen y acciones antes de las secciones de
  trabajo.
- Las acciones principales alcanzan 44 px y las acciones adyacentes mantienen
  al menos 8 px de separación.
- Textos largos, nombres de archivo e identificadores pueden romper línea sin
  ampliar el viewport.
- Ninguna acción depende de hover ni se introduce scroll horizontal global.

### Secciones operativas

- **Archivos:** se muestran como anexos con nombre, categoría, tamaño, fecha y
  descarga controlada.
- **Comentarios:** se presentan como notas internas, con autor, rol, fecha y
  contenido legible.
- **Historial:** usa un timeline compacto y cronológico, con resumen operativo
  y actor como contexto secundario.
- **Tareas:** combinan progreso textual, barra de avance y controles existentes
  sin reinterpretar sus reglas.
- **Estados vacíos:** explican la ausencia de información sin inventar acciones
  de recuperación.

### Restricciones

1. No cambiar lógica de negocio, transiciones, permisos ni Server Actions.
2. No exponer `file_path` ni construir enlaces directos a Storage.
3. No mover consultas o acciones sensibles a Client Components.
4. No ampliar consultas únicamente para decorar una ficha.
5. No duplicar reglas de acceso en componentes presentacionales.
6. No mostrar metadata cruda cuando exista una etiqueta operativa.

## 14. Formularios internos

### Campo y controles

- `FormField` agrupa label, indicador requerido u opcional, ayuda, error y
  control.
- `Input`, `Select` y `Textarea` aceptan las props nativas y no incorporan
  estado local ni validación propia.
- Los controles comparten superficie, borde, tipografía, foco global, estado
  inválido y estado disabled mediante tokens semánticos.
- Los errores se muestran junto al campo y se asocian mediante
  `aria-describedby`.
- La ayuda permanece próxima al control y nunca sustituye un label visible.

### Estados

- **Required:** asterisco textual visible y nota general del formulario.
- **Optional:** etiqueta `(opcional)` junto al label.
- **Error:** borde `danger`, texto de error y `aria-invalid`.
- **Disabled:** superficie secundaria, menor énfasis y cursor no permitido.
- **Pending:** el formulario conserva `aria-busy`, desactiva el submit y cambia
  su texto cuando el flujo ya lo hacía.
- **Success/error general:** `Alert` con rol y tono semánticos.

### Composición

- `FormSection` presenta el formulario como hoja de trabajo con ancho máximo
  razonable.
- Móvil usa una columna; desde `sm` pueden agruparse dos campos cortos
  relacionados.
- Textareas, títulos, nombres y campos de contexto ocupan el ancho completo.
- `FormActions` apila acciones en móvil y las alinea horizontalmente cuando hay
  espacio, con separación mínima de 8 px.
- Los botones principales usan azul, tienen al menos 44 px de alto y muestran
  claramente el estado pending o disabled.

### Restricciones

1. No cambiar `name`, `id`, `defaultValue`, tipo, límites ni atributos nativos.
2. No cambiar Server Actions ni la estructura de `FormData`.
3. No mover validación, permisos o consultas al navegador.
4. No convertir controles presentacionales en Client Components.
5. No introducir librerías de formularios ni dependencias.
6. No migrar el formulario público de solicitud dentro de esta subfase.

## 15. Formulario público de solicitud

### Objetivo de la experiencia

- La página pública guía al cliente para explicar un trabajo personalizado sin
  presentar el flujo como una compra o checkout.
- El mensaje principal es: se envía una solicitud, el equipo revisa la
  información y después contacta al cliente para confirmar alcance, precio y
  fecha.
- La estética conserva el fondo papel y las hojas de trabajo del sistema, con
  un tono más cálido, explicativo y accesible que el dashboard interno.
- Azul comunica confianza y acción principal; naranja se reserva para pequeños
  acentos de marca y orientación.

### Estructura

1. Cabecera pública con marca y acceso claro al formulario.
2. Introducción que diferencia solicitud de pedido confirmado.
3. Formulario principal dividido en contacto, detalles, archivos y envío.
4. Panel `Cómo funciona` con los pasos de revisión y contacto.
5. Recordatorio de información útil antes de comenzar.

En móvil, el formulario aparece antes que los bloques secundarios. En desktop,
la hoja principal comparte espacio con un panel lateral estrecho y sticky sin
ampliar excesivamente los campos.

### Campos y ayudas

- Todos los campos conservan label visible, indicador requerido u opcional y
  controles de al menos 44 px.
- Las ayudas explican qué información resulta útil sin convertir campos
  opcionales en obligatorios.
- Ayuda y error pueden coexistir en `aria-describedby`; el error también activa
  `aria-invalid`.
- El submit conserva feedback pending, bloqueo de doble envío y texto explícito.

### Archivos

- El input nativo permanece visible, accesible y compatible con selección
  múltiple.
- La ayuda muestra el límite de 5 archivos, 20 MB por archivo y los formatos
  permitidos definidos por la implementación existente.
- Se sugieren diseños, referencias, logos y documentos únicamente como apoyo
  para entender el trabajo.
- La interfaz no muestra bucket, rutas, metadata interna ni `file_path`.

### Éxito y error

- Los errores generales usan `Alert` con lenguaje recuperable y los errores de
  campo permanecen junto al control correspondiente.
- El éxito explica los próximos pasos y destaca la referencia abreviada
  existente sin inventar información.
- Las advertencias de archivos distinguen una solicitud registrada de un
  adjunto que no pudo procesarse.
- Los mensajes importantes conservan `role` semántico y `aria-live`.

### Restricciones

1. No convertir el flujo en catálogo, carrito, pago, checkout o panel de
   cliente.
2. No cambiar Server Actions, `FormData`, nombres, ids, tipos ni validaciones.
3. No cambiar límites, formatos, bucket, paths, metadata o visibilidad de
   Storage.
4. No mover consultas, validación sensible o lógica de archivos al navegador.
5. No introducir librerías de formularios, iconos ni dependencias.

## 16. Pantallas públicas complementarias

### Página inicial

- `/` funciona como entrada breve al sistema, no como catálogo ni página de
  comercio.
- El hero explica que Godel Diseño recibe trabajos de impresión, diseño y
  personalización mediante solicitudes revisadas por el equipo.
- Siempre se distingue una solicitud de una compra o pedido confirmado.
- La página prioriza dos acciones: `Enviar solicitud` como CTA principal azul y
  `Acceso interno` como acción secundaria.
- El contenido complementario resume el proceso y aporta confianza sin listar
  productos, precios o promociones.

### Login

- `/login` se presenta como acceso al workspace de producción y comunica que es
  exclusivo para personal autorizado.
- La jerarquía es: contexto operativo, formulario de acceso e información
  secundaria.
- En móvil el formulario aparece inmediatamente después del título; las notas
  sobre organización y autorización quedan después.
- Email y contraseña usan `FormField` e `Input`; el error general usa `Alert` y
  el submit usa `Button` con estado pending y disabled.
- No se muestran opciones de registro, recuperación o acceso de clientes cuando
  esas funciones no existen.

### Header público

- La marca enlaza a inicio y conserva el acento naranja discreto.
- La navegación contiene Inicio, Enviar solicitud y Acceso interno.
- Cada ruta declara su estado actual mediante `aria-current="page"` y énfasis
  azul.
- Las etiquetas se acortan en móvil para evitar overflow sin cambiar destinos.
- El header se mantiene compatible con `/`, `/solicitud` y `/login`.

### Responsive y accesibilidad

- Los CTA principales alcanzan al menos 44 px y pasan a ancho completo cuando
  mejora la lectura móvil.
- Cada pantalla mantiene un único `h1`, contraste alto y foco visible global.
- Los campos de login conservan labels, tipos, autocomplete y required.
- El error de autenticación se anuncia mediante `role="alert"`, `aria-live` y
  asociación con el formulario.
- Las páginas permanecen como Server Components; solo el formulario conserva
  su frontera cliente existente.

### Restricciones

1. No crear catálogo, carrito, pagos, checkout ni listado comercial extenso.
2. No añadir signup público, recuperación de contraseña o panel de cliente.
3. No cambiar acciones, redirects, consultas, permisos ni Supabase Auth.
4. No cambiar nombres, ids, tipos, autocomplete, validaciones ni `FormData`.
5. No introducir librerías, iconos o dependencias.

## 17. Reglas responsive finales

### Breakpoints de referencia

- **375 px:** referencia móvil principal; contenido lineal y acciones cómodas.
- **768 px (`md`):** navegación interna desktop y composiciones tablet.
- **1024 px (`lg`):** detalles en columnas cuando el ancho útil lo permite.
- **1280 px (`xl`):** tablas operativas desktop con sidebar visible.
- **1440 px:** referencia desktop de validación; limitar lectura y conservar
  scroll interno cuando una tabla de alta densidad lo requiera.

### Navegación móvil

- Bajo `md`, usar el menú móvil vertical existente y mantener cada destino con
  al menos 44 px de alto.
- El menú no debe solaparse con el contenido ni alterar la visibilidad por rol.
- Foco, estado activo y orden de tabulación deben permanecer visibles.

### Tablas y cards

- Solicitudes, pedidos, clientes y usuarios usan cards por debajo de `xl`.
- Desde `xl` pueden usar tabla; cualquier overflow horizontal debe quedar
  contenido en el wrapper de la tabla, nunca en la página.
- Cards y tablas deben representar los mismos datos y destinos.

### Detalles

- En móvil, mantener un flujo vertical con resumen y acciones principales al
  inicio.
- Las columnas laterales solo se activan cuando existe ancho útil suficiente.
- Cada columna y panel debe usar `min-w-0`; UUIDs, emails y metadata extensa
  deben envolver sin ampliar el viewport.

### Formularios

- Una columna es el valor por defecto en móvil.
- Dos columnas se usan desde tablet solo cuando la relación entre campos y su
  longitud lo permiten.
- Labels, ayuda y errores permanecen visibles; acciones apiladas en móvil y
  file inputs contenidos.

### Acciones táctiles

- Acciones operativas principales, navegación y enlaces de regreso alcanzan un
  mínimo de 44 px.
- Mantener al menos 8 px entre acciones táctiles adyacentes.
- Ninguna acción necesaria puede depender solo de `hover`.

### Textos largos y metadata

- Aplicar `min-w-0`, wrapping semántico y `break-words` donde corresponda.
- No ocultar UUIDs, errores o referencias mediante `overflow-hidden` si esa
  información es necesaria.
- Los enlaces de metadata deben conservar un área táctil suficiente sin cambiar
  su destino ni jerarquía.

### Restricciones

1. No resolver responsive moviendo consultas, permisos o lógica sensible al
   cliente.
2. No duplicar datos ni reglas de negocio entre variantes desktop y móvil.
3. No modificar `name`, `id`, `action`, `FormData` o contratos de Server
   Actions por motivos visuales.
