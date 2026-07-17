# Etapa 13.1 - Auditoria y especificacion de separacion publica / login / interna

## 1. Objetivo

La Etapa 13 consolida el area publica de Godel Diseno despues del cierre de
formularios internos y paginas secundarias de la Etapa 12.

Esta subtarea documenta el estado actual de las rutas publicas, la puerta de
acceso interno y su relacion con el dashboard autenticado. El objetivo es
separar con claridad tres zonas conceptuales sin modificar codigo de
aplicacion:

- area publica para clientes;
- puerta interna de autenticacion;
- area interna autenticada.

Esta auditoria no redisenia componentes, no mueve rutas, no modifica Server
Actions, no cambia RLS, no cambia Storage, no cambia permisos y no toca logica
de dominio.

## 2. Decision de separacion publica / login / interna

La separacion conceptual aprobada para Etapa 13 es:

| Zona | Rutas | Usuario principal | Proposito |
| --- | --- | --- | --- |
| Area publica para clientes | `/`, `/solicitud`, `/estado`, 404 publica | Cliente externo | Informar, enviar una solicitud y consultar estado minimo por codigo publico. |
| Puerta interna | `/login` | Personal autorizado | Entrar al workspace operativo interno. |
| Area interna autenticada | `/dashboard/**`, `/acceso-denegado`, `/sin-permisos` | Admin, supervisor y trabajador | Gestion operativa de solicitudes, pedidos, clientes, usuarios, configuracion y trabajo diario. |

`/login` conserva su URL actual, pero debe tratarse visualmente como una puerta
interna. No debe competir con la home publica, no debe usar mensajes de
marketing para clientes y no debe formar parte de la navegacion publica como si
fuera una pagina publica mas.

La home publica puede conservar un enlace secundario discreto a `/login` con el
texto `Acceso interno`, pero el login no debe devolver al usuario interno a una
experiencia de captacion publica como ruta principal.

## 3. Inventario de rutas

| Ruta | Ubicacion actual | Tipo | Componentes principales | Observaciones |
| --- | --- | --- | --- | --- |
| `/` | `src/app/(publico)/page.tsx` | Publica | `PublicHeader`, `PublicTrackingSearchForm`, enlaces `Link` | Presenta propuesta de valor, CTA a `/solicitud`, CTA secundario a `/login`, pasos del proceso, consulta rapida de estado y footer publico. |
| `/solicitud` | `src/app/(publico)/solicitud/page.tsx` | Publica | `PublicHeader`, `PublicSolicitudForm` | Explica que la solicitud no confirma pedido, muestra formulario por workflow y aside de pasos. |
| `/estado` | `src/app/(publico)/estado/page.tsx` | Publica dinamica | `PublicHeader`, `PublicTrackingSearchForm`, `PublicTrackingResultCard`, `Alert`, `Card` | Consulta `getPublicTrackingStatus` server-side mediante `ref`; muestra DTO publico minimo, errores seguros y enlaces a `/solicitud` e `/`. |
| 404 publica | `src/app/not-found.tsx` | Publica global | `PublicHeader`, `Card`, enlaces `Link` | Mensaje no tecnico con acciones a `/`, `/solicitud` y `/login`. |
| `/login` | `src/app/(interno)/login/page.tsx` | Puerta interna | `PublicHeader`, `LoginForm`, enlaces `Link` | Vive en route group interno, pero visualmente usa cabecera publica, aparece como pagina activa de navegacion publica y contiene enlace de regreso al inicio. |
| `/dashboard/**` | `src/app/(interno)/dashboard/**` | Interna autenticada | `DashboardLayout`, `DashboardSidebar`, componentes de dominio | Protegida por `src/lib/supabase/proxy.ts`; redirige no autenticados a `/login` y valida perfil activo y permisos. |

## 4. Inventario de componentes

| Componente | Ubicacion | Uso actual | Clasificacion | Hallazgos |
| --- | --- | --- | --- | --- |
| `PublicHeader` | `src/components/layout/PublicHeader.tsx` | `/`, `/solicitud`, `/estado`, 404 publica y `/login` | Publico compartido actualmente tambien por login | Incluye marca, enlace a inicio, CTA a solicitud y enlace a login. `currentPage` admite `home`, `solicitud` y `login`, lo que mezcla el login dentro del modelo de navegacion publica. |
| `PublicSolicitudForm` | `src/components/solicitudes/PublicSolicitudForm.tsx` | `/solicitud` | Formulario publico cliente | Client Component por interaccion real. Usa tabs accesibles, campos con labels, errores por campo, pending, exito con `publicReference`, subida de archivos y mensajes seguros. Es grande y concentra mucho texto de ayuda. |
| `PublicTrackingSearchForm` | `src/components/tracking/PublicTrackingSearchForm.tsx` | Home y `/estado` | Busqueda publica por codigo | Formulario GET simple hacia `/estado`. No consulta Supabase desde cliente. Buen contrato minimo, aunque el helper puede repetirse entre home y estado. |
| `PublicTrackingResultCard` | `src/components/tracking/PublicTrackingResultCard.tsx` | Resultado de `/estado` | Resultado publico seguro | Muestra referencia publica, tipo, flujo, fechas publicas y progreso agregado. No muestra cliente, contacto, archivos, historial, comentarios, pagos, usuarios ni UUIDs internos. |
| `LoginForm` | `src/components/auth/LoginForm.tsx` | `/login` | Autenticacion interna | Client Component por `useActionState`. Usa `login` action, campos email/password, error seguro y CTA `Entrar al workspace`. La microcopy ya apunta a area privada, pero la pagina contenedora todavia comparte navegacion publica. |

## 5. Separacion conceptual

### Pertenece al cliente

- Entender que Godel Diseno recibe solicitudes, no compras directas.
- Enviar una solicitud desde `/solicitud`.
- Adjuntar referencias bajo limites publicos ya definidos.
- Guardar y usar `public_reference`.
- Consultar estado minimo desde `/estado`.
- Recibir mensajes claros de exito, error, formato invalido o codigo no encontrado.

### Pertenece al trabajador interno

- Entrar desde `/login` con credenciales internas.
- Acceder al dashboard si tiene perfil activo.
- Ver solo las secciones permitidas por rol.
- Gestionar el trabajo desde `/dashboard/**`.
- Usar `/acceso-denegado` y `/sin-permisos` como estados internos de sesion y permisos.

### Pertenece al dashboard interno

- Solicitudes completas, contacto del cliente, descripcion, notas y archivos privados.
- Pedidos, tareas, personal, pagos internos, comentarios e historial.
- Usuarios, clientes, configuracion y plantillas segun permisos.
- Descargas privadas mediante route handlers y signed URLs.

### No debe mezclarse

- La navegacion publica no debe presentar `/login` como una seccion publica
  equivalente a solicitud o estado.
- El login no debe explicar servicios para clientes ni funcionar como landing.
- `/estado` no debe exponer `order_number`, cliente, contacto, archivos,
  pagos, historial, comentarios, tareas, usuarios ni UUIDs internos.
- `/solicitud` no debe prometer pedido confirmado, pago, carrito, catalogo o
  panel de cliente.
- El dashboard no debe depender de enlaces publicos para orientacion interna.

## 6. Problemas detectados

### Separacion y navegacion

- `/login` vive correctamente en `src/app/(interno)/login`, pero visualmente usa
  `PublicHeader`.
- `PublicHeaderCurrentPage` incluye `login`, por lo que la puerta interna queda
  modelada como pagina publica activa.
- El login muestra enlaces `Volver al inicio` en desktop y mobile. Puede ser
  util como escape, pero hoy tiene demasiado peso para una puerta interna.
- La 404 publica incluye `Acceso interno`; es aceptable como destino seguro,
  pero debe mantenerse secundario.

### Jerarquia y exceso de texto

- La home comunica bien que la solicitud no confirma compra, pero repite varias
  veces el proceso de revision humana.
- `/solicitud` tiene header, aviso, formulario y aside con pasos; la suma puede
  sentirse extensa en mobile.
- `PublicSolicitudForm` concentra tabs, cuatro secciones, textos de ayuda,
  errores, exito, archivos y reset. Es funcional, pero es candidato a dividirse
  visualmente sin cambiar contratos.
- `/estado` tiene buena seguridad explicita, aunque puede compactar el aside
  para que el formulario y resultado tengan mas protagonismo.
- `/login` usa microcopy interna correcta, pero el bloque lateral `Trabajo
  organizado` puede leerse como promesa de producto y no como puerta de acceso.

### CTA

- La home prioriza `Enviar solicitud` y deja `Acceso interno` como secundario,
  lo cual es correcto.
- `/estado` ofrece `Enviar una solicitud` y `Volver al inicio`; correcto para
  cliente.
- `/login` debe priorizar solo autenticacion. Los enlaces a inicio deben quedar
  como escape secundario, no como parte de navegacion publica.

### Responsive

- Las rutas publicas usan contenedores `max-w-6xl`, grids responsive y acciones
  apilables.
- `PublicSolicitudForm` puede generar scroll largo en mobile, especialmente en
  workflow de impresion por campos, archivos y textos de ayuda.
- `PublicTrackingSearchForm` en layout inline se adapta a stack en mobile.
- No hay evidencia visual en esta subtarea porque no se ejecuta QA visual por
  restriccion; la Etapa 13 debe validar 375, 768, 1024 y 1440 px cuando empiece
  implementacion.

### Estados de exito y error

- `/solicitud` muestra exito con codigo copiable, cantidad de archivos y
  advertencias de subida parcial.
- `/estado` diferencia estado inicial, referencia invalida, no encontrada y
  error temporal con `Alert`.
- `/login` muestra errores seguros sin filtrar detalles de Supabase.
- Falta una especificacion visual unificada para el peso de alerts publicas,
  exito, errores y ayuda contextual.

### Confianza, seguridad y accesibilidad

- `/estado` explica explicitamente que no muestra datos de contacto, archivos,
  historial interno ni identificadores tecnicos.
- `/solicitud` explica uso de archivos y que no confirma pedido.
- `PublicSolicitudForm` usa labels, `aria-describedby`, `aria-invalid` a traves
  de primitivas, tabs con teclado y `aria-live` en alertas.
- `PublicTrackingSearchForm` tiene label visible y helper asociado.
- `LoginForm` conserva labels y error con `aria-live`.
- La home y pagina de solicitud usan acento naranja en varios eyebrows y barras;
  debe controlarse para no parecer decoracion excesiva.

## 7. Riesgos

- Convertir la home en catalogo, tienda o pagina de marketing pesada.
- Aumentar el DTO publico de `/estado` por necesidades visuales.
- Cambiar Server Actions, RLS, Storage o permisos durante un rediseño visual.
- Hacer que `/login` parezca una pagina publica de captacion.
- Ocultar mensajes de seguridad necesarios al compactar textos.
- Dividir `PublicSolicitudForm` sin preservar `name`, `id`, `FormData`,
  `required`, pending, errores y reset.
- Resolver responsive ocultando informacion esencial en vez de priorizarla.
- Introducir componentes genericos globales para una necesidad puntual.

## 8. Decisiones propuestas

1. Mantener las URLs actuales: `/`, `/solicitud`, `/estado`, `/login` y
   `/dashboard/**`.
2. Mantener `/login` dentro del route group interno y tratarlo como puerta
   interna visual.
3. Separar la cabecera publica de la cabecera o marco de login. El login puede
   usar una version minima de marca y un enlace secundario de escape, pero no la
   navegacion publica completa.
4. Mantener `Acceso interno` como enlace secundario en la home publica, no como
   CTA principal.
5. Mantener `Enviar solicitud` como CTA principal publico.
6. Mantener `/estado` como consulta por `public_reference` con DTO minimo.
7. No agregar catalogo, carrito, pagos, panel de cliente ni datos publicos
   adicionales.
8. Compactar microcopy sin eliminar advertencias de seguridad: solicitud no es
   pedido confirmado, archivos son privados, estado publico es limitado.
9. Reusar primitivas UI existentes antes de crear componentes nuevos.
10. Validar implementaciones futuras con foco visible, labels, mensajes seguros
    y targets tactiles.

## 9. Plan de subtareas 13.2-13.8

### 13.2 - Marco publico y puerta interna

- Separar visualmente `PublicHeader` del marco de `/login`.
- Definir navegacion publica para cliente: inicio, solicitud y consulta de
  estado cuando corresponda.
- Definir marco minimo de login: marca, titulo `Acceso interno`, formulario y
  escape secundario.
- No mover rutas ni cambiar autenticacion.

### 13.3 - Home publica

- Consolidar jerarquia de hero, CTA principal y seguimiento.
- Reducir repeticion de proceso sin convertir la home en catalogo.
- Mantener `Acceso interno` como accion secundaria discreta.
- Revisar footer publico y responsive.

### 13.4 - Solicitud publica

- Redisenar composicion de `/solicitud` sin cambiar Server Action ni contrato de
  `FormData`.
- Reducir densidad visual del formulario.
- Preservar tabs, validaciones, archivos, pending, exito y errores.
- Revisar mobile y accesibilidad.

### 13.5 - Consulta publica de estado

- Consolidar formulario, resultado, estado inicial y errores.
- Mantener allowlist de datos publicos.
- Revisar jerarquia del resultado y progreso.
- No exponer pagos, `order_number`, contacto, archivos ni datos internos.

### 13.6 - 404 publica y estados publicos

- Ajustar 404 publica como estado seguro para usuario externo.
- Mantener acciones a inicio y solicitud; `Acceso interno` solo secundario.
- Alinear alerts y estados publicos de exito/error.

### 13.7 - QA responsive y accesibilidad publica

- Validar rutas publicas y login en 375, 768, 1024 y 1440 px.
- Revisar foco, labels, tab order, targets tactiles, overflow y contraste.
- Ejecutar pruebas focales permitidas segun cambios de codigo de esa subtarea.
- No ejecutar Full Visual QA salvo cierre o decision explicita.

### 13.8 - Cierre de Etapa 13

- Documentar resultados, decisiones finales y deuda aceptada.
- Actualizar roadmap.
- Ejecutar validaciones acordadas para el cierre.
- Confirmar que no se alteraron dominio, permisos, RLS, Storage ni datos
  publicos.

## 10. Criterios de cierre de Etapa 13

La Etapa 13 se considera cerrada cuando:

- `/`, `/solicitud`, `/estado` y 404 publica forman una experiencia publica
  clara para clientes.
- `/login` conserva URL, autenticacion y redirect, pero se percibe como puerta
  interna.
- La navegacion publica no mezcla mensajes de cliente con acceso interno.
- El dashboard interno sigue protegido por proxy, perfil activo, permisos y RLS.
- No se agregaron catalogo, carrito, pagos, panel de cliente ni datos publicos
  nuevos.
- `/estado` mantiene DTO publico minimo y seguro.
- `PublicSolicitudForm`, `PublicTrackingSearchForm`,
  `PublicTrackingResultCard` y `LoginForm` conservan sus contratos funcionales.
- Los estados de exito, error, vacio e invalido son comprensibles y seguros.
- Las rutas revisadas funcionan en mobile, tablet y desktop sin overflow
  horizontal.
- La documentacion y el roadmap quedan actualizados.
- Las validaciones asignadas pasan para cada subtarea.
