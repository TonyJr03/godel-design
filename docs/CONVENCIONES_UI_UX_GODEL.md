# Convenciones UI/UX — Godel Diseño

## 1. Propósito del documento

Este archivo define las convenciones visuales, responsive, accesibles y
arquitectónicas que deben seguir las futuras pantallas y componentes de Godel
Diseño.

Es una guía viva para el trabajo diario de desarrolladores y agentes IA. Resume
decisiones aprobadas durante la Fase 14, pero no reemplaza el design system
detallado ni la documentación funcional. Debe consultarse antes de implementar,
revisar o ampliar cualquier interfaz.

## 2. Concepto visual del sistema

El concepto rector es **workspace de producción en papel**: una mesa de trabajo
digital organizada, sobria y orientada a completar tareas.

- Los pedidos se presentan como fichas de trabajo.
- Las solicitudes funcionan como entradas que deben revisarse.
- Los archivos son anexos del trabajo.
- Los comentarios son notas internas.
- El historial es un registro operativo.
- Los estados son etiquetas claras y escaneables.

La interfaz no debe:

- usar decoración excesiva, texturas pesadas o efectos que compitan con el
  contenido;
- adoptar estilos infantiles o lúdicos que reduzcan la claridad operativa;
- parecer una tienda online, catálogo o checkout;
- añadir elementos visuales sin una función de lectura, orientación o acción.

## 3. Principios de diseño

1. Operación antes que decoración.
2. Claridad antes que densidad.
3. Consistencia antes que creatividad aislada.
4. Azul para acciones principales, navegación y confianza.
5. Naranja solo para atención, prioridad o acento limitado.
6. Estados siempre con texto, no solo color.
7. Móvil primero para lectura y acciones.
8. Server Components por defecto.
9. No mover lógica sensible al cliente por motivos visuales.
10. Mantener accesibilidad básica desde el inicio.

## 4. Tokens visuales

La fuente de valores visuales es
[`src/app/globals.css`](../src/app/globals.css). Deben usarse los tokens
semánticos expuestos a Tailwind para:

- fondo: `background`;
- superficies: `surface`, `surface-muted`, `surface-raised`;
- texto: `text-primary`, `text-secondary`, `text-muted`;
- bordes: `border`, `border-strong`;
- marca: `brand-primary`, `brand-primary-hover`, `brand-primary-soft`;
- acento: `brand-accent`, `brand-accent-hover`, `brand-accent-soft`;
- estados: `success`, `warning`, `danger`, `info` y sus fondos suaves;
- foco: `focus-ring`;
- radios: `--radius-card`, `--radius-control`;
- sombras: `--shadow-soft`.

Reglas:

- No usar valores hex sueltos si existe un token adecuado.
- No volver al teal genérico anterior.
- No mezclar grises fríos con superficies cálidas sin una razón documentada.
- Usar `brand-primary` para CTA principales.
- Usar `brand-accent` con moderación; no es un CTA general.
- Validar contraste antes de añadir un color o combinación nuevos.

En Tailwind v4, usar:

```text
rounded-(--radius-card)
rounded-(--radius-control)
shadow-(--shadow-soft)
```

Evitar:

```text
rounded-[var(--radius-card)]
rounded-[var(--radius-control)]
shadow-[var(--shadow-soft)]
```

## 5. Componentes UI oficiales

Los componentes base viven en `src/components/ui` y se exportan desde
`src/components/ui/index.ts`.

### Botones

Usar `Button` con sus variantes `primary`, `secondary`, `ghost`, `danger` o
`link`.

- `primary`: acción principal azul.
- `secondary` o `ghost`: acciones alternativas.
- `danger`: acciones destructivas.
- No usar naranja como botón principal genérico.
- Las acciones táctiles deben alcanzar 44 px. `size="md"` ya cumple esta
  regla; `size="sm"` solo debe usarse donde 40 px sea apropiado y no actúe como
  objetivo táctil principal.

### Cards

Usar `Card` para superficies tipo hoja. Sus variantes oficiales son `default`,
`muted`, `raised` e `interactive`.

- Mantener una jerarquía clara entre superficie base y elevada.
- No abusar de sombras.
- No combinar cards con pesos visuales contradictorios.
- Una card interactiva debe tener un destino y feedback claros.

### Alerts

Usar `Alert` con variantes `info`, `success`, `warning` o `danger`.

- Mostrar lenguaje claro y accionable.
- No exponer errores técnicos crudos.
- Conservar `role` o `aria-live` cuando el mensaje deba anunciarse.
- No usar una alerta como decoración.

### Badges

- Usar `StatusBadge` para estados.
- Usar `PriorityBadge` para prioridades.
- Mantener siempre una etiqueta textual.
- No representar información únicamente mediante color.

### EmptyState

Usar `EmptyState` y distinguir correctamente:

- `default`: no hay datos;
- `search`: no hay resultados;
- `permission`: no hay permiso;
- `error`: no se pudo cargar.

No inventar una acción si el sistema no ofrece un destino o flujo real.

### Encabezados y detalles

- `PageHeader`: título y descripción principal de una pantalla.
- `DetailPanel`: sección diferenciada dentro de una ficha de detalle.
- `MetadataGrid` y `MetadataItem`: pares semánticos de etiqueta y valor.

La metadata secundaria debe envolver texto largo y no dominar la jerarquía.

### Formularios

Usar:

- `FormField`, `FieldHelp` y `FieldError`;
- `Input`, `Select` y `Textarea`;
- `FormSection`;
- `FormActions`.

Conservar siempre los contratos existentes:

- `name`;
- `id`;
- `defaultValue`;
- `required`;
- `type`;
- `autoComplete`;
- `aria-describedby`;
- `aria-invalid`;
- estructura de `FormData`;
- Server Action.

`FormField` debe asociar label, ayuda y error. Los controles deben recibir
`describedBy` e `invalid` cuando se use su API de render.

## 6. Reglas por tipo de pantalla

### Página pública de inicio

- Orientar al cliente sobre qué hace Godel Diseño.
- Priorizar el CTA hacia `/solicitud`.
- Mantener `Acceso interno` como acción secundaria.
- No crear catálogo, tienda, carrito, pagos o checkout.

### Formulario público de solicitud

- Explicar que se envía una solicitud, no un pedido confirmado.
- Mostrar el proceso y los próximos pasos con claridad.
- Explicar formatos y límites de archivos.
- El éxito debe mostrar referencia y siguiente paso.
- No cambiar validaciones, límites ni lógica de subida por motivos visuales.

### Login

- Presentarlo como `Acceso interno`.
- Indicar que es solo para personal autorizado.
- No añadir signup público o recuperación de contraseña si esas funciones no
  existen.
- Conservar acción, campos, errores, pending y redirect.

### Dashboard

- Mostrar primero la atención operativa.
- Usar métricas como contexto, no como decoración.
- Presentar la actividad reciente como registro compacto.
- Mantener las acciones pendientes visibles sin depender de hover.

### Listados

- Usar cards móviles hasta `xl` cuando el sidebar reduzca el ancho útil.
- Usar tablas en desktop.
- Mantener filtros claros y cómodos.
- Las acciones táctiles principales deben alcanzar 44 px.
- El scroll de una tabla debe quedar dentro de su contenedor, nunca en la
  página.

### Detalles

- Tratarlos como fichas de trabajo.
- Mostrar resumen y acciones principales al inicio.
- Separar metadata secundaria en paneles claros.
- Tratar comentarios como notas internas.
- Presentar historial como timeline o registro cronológico.
- Tratar archivos como anexos.
- No exponer `file_path`.

### Formularios internos

- Una columna por defecto en móvil.
- Usar dos columnas solo para campos relacionados y con ancho suficiente.
- Mostrar ayuda y errores cerca del campo.
- Mantener acciones predecibles y estados pending/disabled.
- No cambiar contratos de Server Actions.

### Pantallas de permisos

- Usar mensajes humanos y no culpabilizar al usuario.
- No revelar nombres de permisos o reglas internas.
- Ofrecer destinos seguros y existentes.
- Diferenciar:
  - acceso denegado: la cuenta no tiene acceso interno habilitado;
  - sin permisos: la sesión es válida, pero la sección no está disponible.

### 404

- Mostrar un mensaje no técnico.
- Ofrecer acciones hacia inicio, solicitud y acceso interno.
- No consultar datos.
- No modificar auth, permisos o middleware para resolver su presentación.

## 7. Responsive

### Breakpoints

- **Base / 320–639 px:** móvil, una columna y acciones táctiles de 44 px.
- **`sm` / 640 px:** formularios simples pueden usar dos columnas.
- **`md` / 768 px:** mayor densidad; evitar todavía tablas complejas cuando el
  ancho útil sea limitado.
- **`lg` / 1024 px:** detalles pueden usar dos columnas si existe ancho real.
- **`xl` / 1280 px:** tablas desktop y layouts operativos amplios.
- **`2xl` / 1536 px:** limitar el ancho de lectura; no expandir
  indefinidamente.

### Reglas

- No debe existir overflow horizontal global.
- Las tablas densas deben tener una alternativa móvil.
- Usar `min-w-0`, `break-words`, `break-all` o contención semántica para
  metadata, emails, referencias y UUID largos.
- Los botones móviles deben ser cómodos y las acciones pueden apilarse.
- No depender de hover para descubrir o ejecutar acciones necesarias.
- Probar toda pantalla nueva a 375, 768, 1024 y 1440 px.

## 8. Accesibilidad mínima obligatoria

- Mantener el foco visible global.
- Usar labels en todos los campos.
- Asociar ayuda y errores mediante `aria-describedby`.
- Usar `aria-invalid` cuando corresponda.
- Usar `aria-current="page"` en navegación activa.
- Mantener el skip link al contenido principal.
- Comunicar estados con texto además de color.
- Mantener targets táctiles principales de 44 px.
- Mantener al menos 8 px entre acciones táctiles adyacentes.
- Respetar `prefers-reduced-motion`.
- Conservar un orden lógico de tabulación.
- No ocultar acciones críticas solo por hover.
- No mostrar errores técnicos crudos a usuarios finales.

## 9. Arquitectura UI

- Usar Server Components por defecto.
- Crear un Client Component únicamente cuando requiera:
  - estado local;
  - eventos;
  - `usePathname`;
  - `useFormStatus`;
  - `useActionState`;
  - menús interactivos;
  - previews o interacción real.
- No consultar Supabase desde componentes cliente por razones visuales.
- No duplicar reglas de permisos en el cliente.
- No mover lógica sensible al navegador.
- No cambiar RLS, RPCs, Storage, permisos o Server Actions por UI.
- No instalar dependencias visuales sin aprobación.
- No crear abstracciones universales innecesarias.

## 10. Microcopy y tono

El tono debe ser claro, humano, operativo y directo. Evitar lenguaje técnico
cuando el usuario no necesita conocer la implementación.

- Usar `Acceso interno` en lugar de `Login` en texto visible.
- Diferenciar solicitud, pedido y trabajo.
- Explicar próximos pasos.
- No culpar al usuario.
- No usar metadata cruda como mensaje principal.
- Usar verbos de acción claros:
  - `Enviar solicitud`;
  - `Ver detalle`;
  - `Volver al dashboard`;
  - `Guardar cambios`;
  - `Crear pedido`.

## 11. Seguridad y datos visibles

- No exponer `file_path`.
- No mostrar metadata sensible sin necesidad operativa.
- Mostrar UUID completos solo como metadata secundaria.
- No mostrar información fuera del rol actual.
- No cambiar visibilidad por comodidad visual.
- No consultar `auth.users` desde la UI normal.
- No usar service role en componentes.
- No filtrar datos en cliente como sustituto de permisos server-side.

## 12. Checklist antes de aceptar nueva UI

- [ ] Usa tokens visuales existentes.
- [ ] Usa componentes UI existentes antes de crear nuevos.
- [ ] No introduce colores sueltos innecesarios.
- [ ] Conserva Server Components por defecto.
- [ ] No mueve lógica sensible al cliente.
- [ ] No cambia `name`, `id`, `FormData` ni Server Actions.
- [ ] Tiene labels en formularios.
- [ ] Muestra errores y ayuda de forma accesible.
- [ ] No depende solo del color.
- [ ] Tiene foco visible.
- [ ] Funciona a 375 px.
- [ ] Funciona a 768 px.
- [ ] Funciona a 1024 px.
- [ ] Funciona a 1440 px.
- [ ] No tiene overflow horizontal global.
- [ ] Las acciones principales tienen 44 px.
- [ ] Respeta visibilidad por rol.
- [ ] No expone `file_path`.
- [ ] Lint aprobado.
- [ ] Build aprobado.

## 13. Cuándo crear un componente nuevo

Crear un componente nuevo solo cuando:

- el patrón se repita en dos o más lugares;
- mejore accesibilidad o consistencia;
- no mezcle lógica de negocio con presentación;
- no cree una abstracción demasiado amplia;
- pueda seguir siendo Server Component o server-compatible.

Para un caso aislado, preferir composición con componentes existentes.

## 14. Validaciones recomendadas

Para toda UI nueva:

```powershell
npm run lint
npm run build
git diff --check
```

Revisión visual mínima:

- 375 × 812;
- 768 × 1024;
- 1024 × 768;
- 1440 × 1000.

Si toca formularios:

- probar errores;
- probar pending/disabled si aplica;
- no usar datos reales.

Si toca permisos:

- probar admin;
- probar trabajador;
- probar supervisor si existen credenciales.

## 15. Relación con otros documentos

- [`docs/ui-ux/FASE_14_AUDITORIA_UI_UX.md`](ui-ux/FASE_14_AUDITORIA_UI_UX.md):
  diagnóstico, checklist y avance de implementación.
- [`docs/ui-ux/FASE_14_DESIGN_SYSTEM.md`](ui-ux/FASE_14_DESIGN_SYSTEM.md):
  definición detallada del sistema visual.
- [`docs/ui-ux/FASE_14_REVISION_RESPONSIVE.md`](ui-ux/FASE_14_REVISION_RESPONSIVE.md):
  matriz y hallazgos responsive.
- [`docs/ui-ux/FASE_14_CIERRE_UI_UX.md`](ui-ux/FASE_14_CIERRE_UI_UX.md):
  evidencia y conclusión de la Fase 14.

Este archivo resume las convenciones aplicables al trabajo diario. El design
system contiene mayor detalle; la auditoría, la revisión responsive y el cierre
documentan el proceso y las decisiones que originaron estas reglas.
