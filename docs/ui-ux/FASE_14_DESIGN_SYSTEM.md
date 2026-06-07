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
