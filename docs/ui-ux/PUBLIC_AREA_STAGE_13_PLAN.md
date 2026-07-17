# Etapa 13.1 - Auditoría y especificación de separación pública / login / interna

## 1. Objetivo

La Etapa 13 consolida el área pública de Godel Diseño después del cierre de
formularios internos y páginas secundarias de la Etapa 12.

Esta subtarea documenta el estado actual de las rutas públicas, la puerta de
acceso interno y su relación con el dashboard autenticado. El objetivo es
separar con claridad tres zonas conceptuales sin modificar código de
aplicación:

- área pública para clientes;
- puerta interna de autenticación;
- área interna autenticada.

Esta auditoría no rediseña componentes, no mueve rutas, no modifica Server
Actions, no cambia RLS, no cambia Storage, no cambia permisos y no toca lógica
de dominio.

## 2. Decisión de separación pública / login / interna

La separación conceptual aprobada para Etapa 13 es:

| Zona | Rutas | Usuario principal | Propósito |
| --- | --- | --- | --- |
| Área pública para clientes | `/`, `/solicitud`, `/estado`, 404 pública | Cliente externo | Informar, enviar una solicitud y consultar estado mínimo por código público. |
| Puerta interna | `/login` | Personal autorizado | Entrar al workspace operativo interno. |
| Área interna autenticada | `/dashboard/**`, `/acceso-denegado`, `/sin-permisos` | Admin, supervisor y trabajador | Gestión operativa de solicitudes, pedidos, clientes, usuarios, configuración y trabajo diario. |

`/login` conserva su URL actual, pero debe tratarse visualmente como una puerta
interna. No debe competir con la home pública, no debe usar mensajes de
marketing para clientes y no debe formar parte de la navegación pública como si
fuera una página pública más.

El área pública no expone enlaces visibles hacia `/login`. El acceso interno se
mantiene por URL directa y redirecciones de protección.

## 3. Inventario de rutas

| Ruta | Ubicación actual | Tipo | Componentes principales | Observaciones |
| --- | --- | --- | --- | --- |
| `/` | `src/app/(publico)/page.tsx` | Pública | `PublicHeader`, `PublicTrackingSearchForm`, enlaces `Link` | Presenta propuesta de valor, CTA a `/solicitud`, CTA secundario a `/estado`, pasos del proceso, consulta rápida de estado y footer público. |
| `/solicitud` | `src/app/(publico)/solicitud/page.tsx` | Pública | `PublicHeader`, `PublicSolicitudForm` | Explica que la solicitud no confirma pedido, muestra formulario por workflow y aside de pasos. |
| `/estado` | `src/app/(publico)/estado/page.tsx` | Pública dinámica | `PublicHeader`, `PublicTrackingSearchForm`, `PublicTrackingResultCard`, `Alert`, `Card` | Consulta `getPublicTrackingStatus` server-side mediante `ref`; muestra DTO público mínimo, errores seguros y enlaces a `/solicitud` e `/`. |
| 404 pública | `src/app/not-found.tsx` | Pública global | `PublicHeader`, `Card`, enlaces `Link` | Mensaje no técnico con acciones a `/`, `/solicitud` y `/estado`. |
| `/login` | `src/app/(interno)/login/page.tsx` | Puerta interna | `LoginForm` | Vive en route group interno, muestra marca interna dentro de la pantalla y no tiene header ni enlaces al sitio público. |
| `/dashboard/**` | `src/app/(interno)/dashboard/**` | Interna autenticada | `DashboardLayout`, `DashboardSidebar`, componentes de dominio | Protegida por `src/lib/supabase/proxy.ts`; redirige no autenticados a `/login` y valida perfil activo y permisos. |

## 4. Inventario de componentes

| Componente | Ubicación | Uso actual | Clasificación | Hallazgos |
| --- | --- | --- | --- | --- |
| `PublicHeader` | `src/components/layout/PublicHeader.tsx` | `/`, `/solicitud`, `/estado` y 404 pública | Público | Incluye marca, enlace a inicio, CTA a solicitud y acceso a estado. `currentPage` admite `home`, `solicitud` y `estado`; `/login` no participa como página activa de navegación pública ni aparece como enlace visible. |
| `PublicSolicitudForm` | `src/components/solicitudes/PublicSolicitudForm.tsx` | `/solicitud` | Formulario público cliente | Client Component por interacción real. Usa tabs accesibles, campos con labels, errores por campo, pending, éxito con `publicReference`, subida de archivos y mensajes seguros. Es grande y concentra mucho texto de ayuda. |
| `PublicTrackingSearchForm` | `src/components/tracking/PublicTrackingSearchForm.tsx` | Home y `/estado` | Búsqueda pública por código | Formulario GET simple hacia `/estado`. No consulta Supabase desde cliente. Buen contrato mínimo, aunque el helper puede repetirse entre home y estado. |
| `PublicTrackingResultCard` | `src/components/tracking/PublicTrackingResultCard.tsx` | Resultado de `/estado` | Resultado público seguro | Muestra referencia pública, tipo, flujo, fechas públicas y progreso agregado. No muestra cliente, contacto, archivos, historial, comentarios, pagos, usuarios ni UUIDs internos. |
| `LoginForm` | `src/components/auth/LoginForm.tsx` | `/login` | Autenticación interna | Client Component por `useActionState`. Usa `login` action, campos email/password, error seguro y CTA `Entrar al workspace`. La microcopy apunta a área privada y la página contenedora no muestra navegación pública. |

## 5. Separación conceptual

### Pertenece al cliente

- Entender que Godel Diseño recibe solicitudes, no compras directas.
- Enviar una solicitud desde `/solicitud`.
- Adjuntar referencias bajo límites públicos ya definidos.
- Guardar y usar `public_reference`.
- Consultar estado mínimo desde `/estado`.
- Recibir mensajes claros de éxito, error, formato inválido o código no encontrado.

### Pertenece al trabajador interno

- Entrar desde `/login` con credenciales internas.
- Acceder al dashboard si tiene perfil activo.
- Ver solo las secciones permitidas por rol.
- Gestionar el trabajo desde `/dashboard/**`.
- Usar `/acceso-denegado` y `/sin-permisos` como estados internos de sesión y permisos.

### Pertenece al dashboard interno

- Solicitudes completas, contacto del cliente, descripción, notas y archivos privados.
- Pedidos, tareas, personal, pagos internos, comentarios e historial.
- Usuarios, clientes, configuración y plantillas según permisos.
- Descargas privadas mediante route handlers y signed URLs.

### No debe mezclarse

- La navegación pública no debe presentar `/login` como una sección pública ni
  como enlace visible.
- El login no debe explicar servicios para clientes ni funcionar como landing.
- `/estado` no debe exponer `order_number`, cliente, contacto, archivos,
  pagos, historial, comentarios, tareas, usuarios ni UUIDs internos.
- `/solicitud` no debe prometer pedido confirmado, pago, carrito, catálogo o
  panel de cliente.
- El dashboard no debe depender de enlaces públicos para orientación interna.

## 6. Problemas detectados

### Separación y navegación

- En 13.1, `/login` vivía correctamente en `src/app/(interno)/login`, pero
  visualmente usaba `PublicHeader`. En 13.2 queda separado del header público.
- En 13.1, `PublicHeaderCurrentPage` incluía `login`. En 13.2 queda limitado a
  páginas públicas de cliente.
- En 13.2.1 se elimina la exposición visible de `/login` desde el área pública
  y se elimina el enlace de `/login` hacia el sitio público.
- En 13.2.1, la 404 pública deja de incluir `Acceso interno`.

### Jerarquía y exceso de texto

- La home comunica bien que la solicitud no confirma compra, pero repite varias
  veces el proceso de revisión humana.
- `/solicitud` tiene header, aviso, formulario y aside con pasos; la suma puede
  sentirse extensa en mobile.
- `PublicSolicitudForm` concentra tabs, cuatro secciones, textos de ayuda,
  errores, éxito, archivos y reset. Es funcional, pero es candidato a dividirse
  visualmente sin cambiar contratos.
- `/estado` tiene buena seguridad explícita, aunque puede compactar el aside
  para que el formulario y resultado tengan más protagonismo.
- `/login` usa microcopy interna correcta, pero el bloque lateral `Trabajo
  organizado` puede leerse como promesa de producto y no como puerta de acceso.

### CTA

- En 13.2.1, la home prioriza `Enviar solicitud` y deja solo destinos públicos
  como acciones secundarias.
- `/estado` ofrece `Enviar una solicitud` y `Volver al inicio`; correcto para
  cliente.
- `/login` debe priorizar solo autenticación. Los enlaces a inicio deben quedar
  como escape secundario, no como parte de navegación pública.

### Responsive

- Las rutas públicas usan contenedores `max-w-6xl`, grids responsive y acciones
  apilables.
- `PublicSolicitudForm` puede generar scroll largo en mobile, especialmente en
  workflow de impresión por campos, archivos y textos de ayuda.
- `PublicTrackingSearchForm` en layout inline se adapta a stack en mobile.
- No hay evidencia visual en esta subtarea porque no se ejecuta QA visual por
  restricción; la Etapa 13 debe validar 375, 768, 1024 y 1440 px cuando empiece
  implementación.

### Estados de éxito y error

- `/solicitud` muestra éxito con código copiable, cantidad de archivos y
  advertencias de subida parcial.
- `/estado` diferencia estado inicial, referencia inválida, no encontrada y
  error temporal con `Alert`.
- `/login` muestra errores seguros sin filtrar detalles de Supabase.
- Falta una especificación visual unificada para el peso de alerts públicas,
  éxito, errores y ayuda contextual.

### Confianza, seguridad y accesibilidad

- `/estado` explica explícitamente que no muestra datos de contacto, archivos,
  historial interno ni identificadores técnicos.
- `/solicitud` explica uso de archivos y que no confirma pedido.
- `PublicSolicitudForm` usa labels, `aria-describedby`, `aria-invalid` a través
  de primitivas, tabs con teclado y `aria-live` en alertas.
- `PublicTrackingSearchForm` tiene label visible y helper asociado.
- `LoginForm` conserva labels y error con `aria-live`.
- La home y página de solicitud usan acento naranja en varios eyebrows y barras;
  debe controlarse para no parecer decoración excesiva.

## 7. Riesgos

- Convertir la home en catálogo, tienda o página de marketing pesada.
- Aumentar el DTO público de `/estado` por necesidades visuales.
- Cambiar Server Actions, RLS, Storage o permisos durante un rediseño visual.
- Hacer que `/login` parezca una página pública de captación.
- Ocultar mensajes de seguridad necesarios al compactar textos.
- Dividir `PublicSolicitudForm` sin preservar `name`, `id`, `FormData`,
  `required`, pending, errores y reset.
- Resolver responsive ocultando información esencial en vez de priorizarla.
- Introducir componentes genéricos globales para una necesidad puntual.

## 8. Decisiones propuestas

1. Mantener las URLs actuales: `/`, `/solicitud`, `/estado`, `/login` y
   `/dashboard/**`.
2. Mantener `/login` dentro del route group interno y tratarlo como puerta
   interna visual.
3. Separar la cabecera pública de la cabecera o marco de login. El login puede
   usar una versión mínima de marca y un enlace secundario de escape, pero no la
   navegación pública completa.
4. No mostrar enlaces visibles a `/login` desde el área pública.
5. Mantener `Enviar solicitud` como CTA principal público.
6. Mantener `/estado` como consulta por `public_reference` con DTO mínimo.
7. No agregar catálogo, carrito, pagos, panel de cliente ni datos públicos
   adicionales.
8. Compactar microcopy sin eliminar advertencias de seguridad: solicitud no es
   pedido confirmado, archivos son privados, estado público es limitado.
9. Reusar primitivas UI existentes antes de crear componentes nuevos.
10. Validar implementaciones futuras con foco visible, labels, mensajes seguros
    y targets táctiles.

## 9. Plan de subtareas 13.2-13.8

### 13.2 - Marco público y puerta interna

- Separar visualmente `PublicHeader` del marco de `/login`.
- Definir navegación pública para cliente: inicio, solicitud y consulta de
  estado cuando corresponda.
- Definir marco mínimo de login: marca, título `Acceso interno`, formulario y
  escape secundario.
- No mover rutas ni cambiar autenticación.

Nota de implementación 13.2:

- `PublicHeader` queda reservado para rutas públicas de cliente.
- `/login` usa una composición propia de acceso interno dentro de la pantalla.
- `/login` no participa como `currentPage` de la navegación pública.

Corrección 13.2.1:

- El área pública no expone enlaces visibles hacia `/login`.
- El acceso interno se mantiene por URL directa y redirecciones de protección.
- `/login` no muestra header ni enlace al sitio público.
- `LoginAccessHeader` queda eliminado porque ya no existe marco de navegación para login.

### 13.3 - Home pública

- Consolidar jerarquía de hero, CTA principal y seguimiento.
- Reducir repetición de proceso sin convertir la home en catálogo.
- Mantener solo acciones públicas como alternativas secundarias.
- Revisar footer público y responsive.

Nota de implementación 13.3:

- La home pública fue compactada y orientada a solicitud y seguimiento.
- Se eliminaron repeticiones del proceso.
- Se mantuvieron solo acciones públicas.
- No se agregó catálogo, carrito, pagos, panel de cliente ni acceso interno.

Corrección 13.3.1:

- Se redefinió la home pública hacia una identidad visual más atractiva.
- Se tomó inspiración del logo: azul, naranja, gris carbón y geometría diagonal.
- Se mantuvo la separación estricta con el área interna.
- Se mantuvieron solo acciones públicas.
- No se agregó catálogo, carrito, pagos, panel de cliente ni datos públicos nuevos.

Corrección 13.3.2:

- Se refinó la home hacia una identidad pública más luminosa.
- Se redujo el uso de carbón/negro dominante.
- Se consolidó azul como color principal y naranja como acento.
- Se mejoraron header, footer, seguimiento y CTA final.
- Se añadieron placeholders visuales para redes sociales porque no existen URLs oficiales configuradas.
- Se mantuvo la separación estricta con el área interna.

Corrección 13.3.3:

- Se adoptó azul como fondo protagonista de la landing.
- Se eliminaron fondos hueso/beige y bloques carbón dominantes.
- Se reforzó header y footer como elementos de marca.
- Se añadieron iconos SVG para redes sociales en el footer.
- Se mantuvo separación estricta con el área interna.
- No se agregó catálogo, carrito, pagos, panel de cliente ni datos públicos nuevos.

Corrección 13.3.4:

- El header público quedó sticky para permanecer visible durante el scroll.
- El footer público se extrajo como componente reutilizable.
- El hero se limpió para priorizar mensaje y marca.
- El proceso se movió a una sección propia debajo del hero.
- Se mantuvo separación estricta con el área interna.
- No se agregó catálogo, carrito, pagos, panel de cliente ni datos públicos nuevos.

Corrección 13.3.5:

- Se integró la pieza de marca del hero con el fondo azul.
- Se eliminó la caja blanca dominante del logo.
- Se mantuvo el hero limpio y orientado a marca.

Corrección 13.3.6:

- Se eliminó el contenedor translúcido del logo del hero.
- El logo quedó integrado directamente sobre el fondo azul.
- Se aumentó el protagonismo visual de la marca.

Corrección 13.3.7:

- El logo grande del hero se definió como recurso decorativo solo para desktop.
- En mobile/tablet se oculta para priorizar mensaje, CTAs y velocidad de lectura.
- Se mantiene la jerarquía responsive sin añadir contenido nuevo.

### 13.4 - Solicitud pública

- Rediseñar composición de `/solicitud` sin cambiar Server Action ni contrato de
  `FormData`.
- Reducir densidad visual del formulario.
- Preservar tabs, validaciones, archivos, pending, éxito y errores.
- Revisar mobile y accesibilidad.

### 13.5 - Consulta pública de estado

- Consolidar formulario, resultado, estado inicial y errores.
- Mantener allowlist de datos públicos.
- Revisar jerarquía del resultado y progreso.
- No exponer pagos, `order_number`, contacto, archivos ni datos internos.

### 13.6 - 404 pública y estados públicos

- Ajustar 404 pública como estado seguro para usuario externo.
- Mantener acciones a inicio, solicitud y consulta de estado.
- Alinear alerts y estados públicos de éxito/error.

### 13.7 - QA responsive y accesibilidad pública

- Validar rutas públicas y login en 375, 768, 1024 y 1440 px.
- Revisar foco, labels, tab order, targets táctiles, overflow y contraste.
- Ejecutar pruebas focales permitidas según cambios de código de esa subtarea.
- No ejecutar Full Visual QA salvo cierre o decisión explícita.

### 13.8 - Cierre de Etapa 13

- Documentar resultados, decisiones finales y deuda aceptada.
- Actualizar roadmap.
- Ejecutar validaciones acordadas para el cierre.
- Confirmar que no se alteraron dominio, permisos, RLS, Storage ni datos
  públicos.

## 10. Criterios de cierre de Etapa 13

La Etapa 13 se considera cerrada cuando:

- `/`, `/solicitud`, `/estado` y 404 pública forman una experiencia pública
  clara para clientes.
- `/login` conserva URL, autenticación y redirect, pero se percibe como puerta
  interna.
- La navegación pública no mezcla mensajes de cliente con acceso interno.
- El dashboard interno sigue protegido por proxy, perfil activo, permisos y RLS.
- No se agregaron catálogo, carrito, pagos, panel de cliente ni datos públicos
  nuevos.
- `/estado` mantiene DTO público mínimo y seguro.
- `PublicSolicitudForm`, `PublicTrackingSearchForm`,
  `PublicTrackingResultCard` y `LoginForm` conservan sus contratos funcionales.
- Los estados de éxito, error, vacío e inválido son comprensibles y seguros.
- Las rutas revisadas funcionan en mobile, tablet y desktop sin overflow
  horizontal.
- La documentación y el roadmap quedan actualizados.
- Las validaciones asignadas pasan para cada subtarea.
