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

## 8. Próximos componentes a normalizar

1. `Button`
2. `Card`
3. `Alert`
4. `StatusBadge`
5. `EmptyState`
6. `FormField`

La normalización debe hacerse en pequeñas migraciones, conservando contratos y
Server Components por defecto.
