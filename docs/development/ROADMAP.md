# Roadmap Oficial del Proyecto Godel Diseño

**Proyecto:** Sistema Web de Gestión para Godel Diseño  
**Repositorio:** `godel-design`  
**Documento:** Roadmap oficial de desarrollo inicial  
**Estado:** Activo  
**Versión:** 1.1
**Fecha:** 2026-06-12

---

## 1. Propósito del roadmap

Este documento define el plan oficial de desarrollo inicial del sistema web de gestión para **Godel Diseño**.

El objetivo del proyecto es construir una plataforma web para centralizar el flujo de trabajo de la empresa, desde la entrada de solicitudes de clientes hasta la gestión interna de pedidos, archivos, usuarios, roles, estados, notas e historial.

Este roadmap servirá como guía de trabajo para:

- mantener ordenado el desarrollo;
- dividir el trabajo en fases claras;
- evitar implementar funcionalidades fuera de alcance;
- orientar las tareas que serán enviadas al agente Codex en VS Code;
- conservar una visión técnica coherente del proyecto completo.

---

## 2. Alcance oficial del proyecto

La primera versión del sistema incluirá:

- canal público para solicitudes de clientes;
- autenticación de usuarios internos;
- roles iniciales;
- panel interno;
- gestión de solicitudes;
- conversión de solicitudes en pedidos;
- gestión de pedidos;
- asignación de personal interno a pedidos;
- gestión básica de clientes;
- subida y gestión de archivos;
- estados básicos de solicitudes y pedidos;
- notas internas;
- historial básico de actividad;
- diseño responsive para computadora y teléfono.

---

## 3. Fuera de alcance en la primera versión

No forman parte de este proyecto inicial:

- catálogo digital;
- tienda online;
- pagos automáticos;
- carrito de compras;
- facturación automática;
- panel de cliente;
- consulta pública del estado del pedido;
- notificaciones por WhatsApp;
- notificaciones por correo;
- inventario;
- reportes avanzados;
- estadísticas de producción;
- chat interno;
- chat con clientes;
- aplicación móvil nativa;
- sincronización híbrida avanzada;
- automatizaciones complejas.

Estas funcionalidades podrán evaluarse en fases futuras si el sistema base queda estable y la empresa realmente las necesita.

---

## 4. Stack tecnológico oficial

El sistema se desarrollará con:

- Next.js;
- React;
- TypeScript;
- Tailwind CSS;
- Supabase Auth;
- Supabase PostgreSQL;
- Supabase Storage;
- Vercel como opción inicial de despliegue en la nube.

La aplicación usará **Next.js App Router** dentro de la carpeta `src/app`.

---

## 5. Principios arquitectónicos

Durante todo el desarrollo se respetarán estos principios:

### 5.1 Claridad antes que complejidad

La arquitectura debe ser profesional, pero no innecesariamente compleja.

### 5.2 Separación de responsabilidades

La interfaz visual, la lógica de negocio, las consultas a base de datos, las validaciones, los permisos y la gestión de archivos deben mantenerse separados.

### 5.3 Seguridad desde el inicio

El sistema manejará datos de clientes y archivos reales. La seguridad debe formar parte del diseño desde las primeras fases.

### 5.4 Archivos privados por defecto

Los archivos enviados por clientes o generados internamente deben considerarse privados por defecto.

### 5.5 Escalabilidad razonable

La arquitectura debe permitir crecer, pero sin construir funcionalidades futuras antes de tiempo.

### 5.6 Trazabilidad básica

Los cambios importantes en solicitudes y pedidos deben quedar registrados para saber qué ocurrió, cuándo ocurrió y quién realizó la acción.

---

## 6. Estado actual del proyecto

### Fase 0 — Base del proyecto

**Estado:** Completada.

Se completó la base inicial del proyecto:

- proyecto Next.js creado;
- TypeScript configurado;
- Tailwind CSS configurado;
- App Router configurado dentro de `src/app`;
- rutas placeholder creadas;
- layout inicial del dashboard creado;
- componentes base creados;
- constantes iniciales creadas;
- tipos mínimos creados;
- servicios placeholder creados;
- estructura principal de carpetas creada;
- README inicial actualizado;
- `npm run lint` ejecutado correctamente;
- `npm run build` ejecutado correctamente.

---

# 7. Roadmap maestro

## Fase 1 — Fundamentos de dominio y base de datos

### Objetivo

Diseñar correctamente el modelo de datos, enums, relaciones, restricciones e infraestructura inicial de Supabase.

### Tareas principales

- Diseñar esquema SQL inicial.
- Definir tablas base.
- Definir enums.
- Definir relaciones y claves foráneas.
- Definir restricciones básicas.
- Crear índices necesarios.
- Preparar campos `created_at` y `updated_at`.
- Preparar estrategia inicial de Row Level Security.
- Diseñar estructura inicial de buckets privados para Storage.

### Tablas base

- `perfiles`
- `clientes`
- `solicitudes`
- `pedidos`
- `pedido_trabajadores`
- `archivos`
- `comentarios`
- `historial_pedidos`

### Criterio de cierre

La base de datos debe poder crearse desde cero sin errores y representar correctamente el flujo operativo principal de Godel Diseño.

---

## Fase 2 — Configuración de Supabase en Next.js

### Objetivo

Conectar el proyecto Next.js con Supabase de forma ordenada y segura.

### Tareas principales

- Instalar dependencias necesarias de Supabase.
- Crear `.env.example`.
- Configurar variables públicas necesarias.
- Crear cliente Supabase para navegador.
- Crear cliente Supabase para servidor.
- Organizar la configuración dentro de `src/lib/supabase`.
- Evitar cualquier exposición de claves privadas en frontend.

### Criterio de cierre

El proyecto debe compilar correctamente y quedar conectado a Supabase sin implementar todavía flujos funcionales completos.

---

## Fase 3 — Autenticación interna

### Objetivo

Permitir que usuarios internos accedan al dashboard mediante Supabase Auth.

### Tareas principales

- Implementar login funcional.
- Implementar logout funcional.
- Leer sesión activa.
- Proteger rutas internas.
- Redirigir usuarios no autenticados a `/login`.
- Asociar usuarios autenticados con perfiles internos.
- Manejar errores básicos de autenticación.

### Criterio de cierre

Un usuario interno puede iniciar sesión, acceder al dashboard y cerrar sesión. Un usuario no autenticado no puede acceder al área interna.

---

## Fase 4 — Roles y permisos internos

### Objetivo

Diferenciar correctamente los permisos de `admin`, `supervisor` y `trabajador`.

### Tareas principales

- Leer rol desde `perfiles`.
- Crear helpers de permisos en `src/lib/permissions`.
- Ajustar navegación por rol.
- Proteger acciones sensibles.
- Proteger rutas sensibles.
- Preparar políticas RLS acordes a los roles.
- Evitar que los permisos dependan solo del frontend.

### Reglas iniciales

- `admin` puede acceder a todo.
- `supervisor` puede gestionar solicitudes y pedidos.
- `trabajador` solo puede ver pedidos asignados.
- `trabajador` no puede gestionar usuarios.
- `trabajador` no puede convertir solicitudes en pedidos.

### Criterio de cierre

Cada rol tiene acceso únicamente a las secciones y acciones que le corresponden.

---

## Fase 5 — Solicitudes públicas

### Objetivo

Construir el formulario público para que clientes envíen solicitudes.

### Tareas principales

- Crear formulario real en `/solicitud`.
- Validar datos de entrada.
- Guardar solicitud en Supabase.
- Crear o asociar cliente básico.
- Mostrar pantalla o mensaje de éxito.
- Manejar errores.
- Preparar subida de archivos de solicitud.

### Campos mínimos

- nombre del cliente;
- teléfono;
- correo electrónico opcional;
- tipo de servicio;
- descripción;
- cantidad opcional;
- fecha deseada opcional;
- observaciones;
- archivos opcionales.

### Criterio de cierre

Un cliente puede enviar una solicitud y esta queda registrada con estado `nueva`.

---

## Fase 6 — Gestión interna de solicitudes

### Objetivo

Permitir que usuarios internos autorizados revisen y gestionen solicitudes recibidas.

### Tareas principales

- Crear listado real en `/dashboard/solicitudes`.
- Crear detalle real en `/dashboard/solicitudes/[id]`.
- Implementar filtros básicos por estado.
- Permitir cambio de estado.
- Mostrar datos del cliente.
- Mostrar archivos asociados.
- Registrar usuario revisor cuando corresponda.

### Estados de solicitud

- `nueva`
- `en_revision`
- `contactada`
- `aprobada`
- `rechazada`
- `convertida`

### Criterio de cierre

Un supervisor puede revisar una solicitud, cambiar su estado y prepararla para conversión en pedido.

---

## Fase 7 — Clientes

### Objetivo

Implementar una gestión básica de clientes sin convertir el sistema en un CRM complejo.

### Tareas principales

- Crear o actualizar cliente al recibir solicitud.
- Listar clientes en `/dashboard/clientes`.
- Ver detalle básico de cliente.
- Ver solicitudes asociadas.
- Ver pedidos asociados cuando ya exista el módulo de pedidos.
- Permitir notas simples sobre clientes si aplica.

### Criterio de cierre

La empresa puede consultar clientes y ver su relación con solicitudes y pedidos.

---

## Fase 8 — Pedidos

### Objetivo

Construir el núcleo operativo del sistema: la gestión de pedidos oficiales.

### Tareas principales

- Crear pedidos manualmente.
- Convertir solicitudes aprobadas en pedidos.
- Generar `order_number`.
- Listar pedidos en `/dashboard/pedidos`.
- Ver detalle en `/dashboard/pedidos/[id]`.
- Cambiar estados de pedido.
- Registrar fechas importantes.
- Manejar prioridad.

### Estados de pedido

- `creado`
- `solicitud_recibida`
- `en_revision`
- `en_produccion`
- `listo_entrega`
- `entregado`
- `cancelado`

### Criterio de cierre

La empresa puede crear, consultar, actualizar y controlar pedidos reales.

### Cierre de fase

La Fase 8 quedó completada con listado de pedidos, detalle interno, creación manual, conversión desde solicitud aprobada, cambio de estado, asignación de trabajador responsable, visibilidad controlada de cliente y solicitud para trabajadores asignados, y documentación oficial del flujo en `docs/ORDERS_FLOW.md`.

---

## Fase 9 — Asignación de personal a pedidos

### Objetivo

Permitir asignar uno o varios usuarios internos a cada pedido.

### Tareas principales

- Listar personal interno activo asignable.
- Asignar personal interno a pedidos.
- Remover asignaciones concretas de pedidos.
- Registrar quién asignó.
- Mostrar personal asignado.
- Permitir que trabajadores vean solo sus pedidos asignados.
- Definir estados que puede actualizar un trabajador.

### Criterio de cierre

Un trabajador autenticado puede consultar y trabajar únicamente sobre los pedidos que tiene asignados.

### Cierre de fase

La Fase 9 quedó completada con asignaciones múltiples de personal interno a pedidos, asignación de usuarios activos con rol `admin`, `supervisor` o `trabajador`, remoción de asignaciones concretas, visualización completa del personal asignado, visibilidad controlada para trabajador asignado, permisos de cambio de estado con múltiples asignados y documentación oficial en `docs/ORDER_ASSIGNMENTS_FLOW.md`.

---

## Fase 10 — Archivos privados

### Objetivo

Implementar gestión real y segura de archivos mediante Supabase Storage.

### Tareas principales

- Crear bucket privado.
- Definir estructura de rutas internas.
- Subir archivos desde solicitudes públicas.
- Subir archivos internos a pedidos.
- Categorizar archivos.
- Registrar archivos en la tabla `archivos`.
- Validar tamaño y tipo de archivo.
- Descargar archivos según permisos.
- Evitar URLs públicas permanentes.

### Categorías iniciales de archivos

- `cliente_solicitud`
- `interno_pedido`
- `avance`
- `final_entrega`

### Criterio de cierre

Los archivos quedan asociados a solicitudes o pedidos y solo usuarios autorizados pueden acceder a ellos.

### Cierre de fase

La Fase 10 quedó completada con bucket privado `godel-files`, estructura de rutas internas, utilidades reutilizables de Storage, validación de tamaño y formato, sanitización de nombres, subida pública controlada de archivos opcionales en solicitudes, subida interna de archivos en pedidos, metadatos registrados en `archivos`, visualización interna de archivos de solicitudes y pedidos, descargas mediante URLs firmadas de corta duración, y policies/RLS como defensa final. No se usan buckets públicos, URLs públicas permanentes ni service role key.

---

## Fase 11 — Comentarios internos e historial

### Objetivo

Dar trazabilidad básica al trabajo interno.

### Tareas principales

- Agregar comentarios internos en pedidos.
- Registrar eventos importantes en historial.
- Mostrar actividad dentro del detalle del pedido.
- Impedir edición manual del historial desde la interfaz.

### Eventos iniciales de historial

- `pedido_creado`
- `estado_cambiado`
- `trabajador_asignado`
- `trabajador_removido`
- `archivo_subido`
- `nota_agregada`
- `fecha_entrega_actualizada`
- `pedido_entregado`
- `pedido_cancelado`

### Criterio de cierre

Cada pedido tiene una línea de actividad clara y confiable.

### Cierre de fase

La Fase 11 quedó completada con modelo técnico documentado, normalización de `pedido_comentarios` y `pedido_historial`, tablas base para `solicitud_comentarios` y `solicitud_historial`, comentarios internos append-only en pedidos y solicitudes, historial visible en pedidos y solicitudes, RPCs estrechas para exponer datos mínimos de autor/actor en pedidos, triggers privados de historial automático, eventos automáticos relevantes de pedidos y solicitudes, y documentación técnica actualizada. No se implementan comentarios públicos, edición/eliminación de comentarios o historial, notificaciones ni auditoría legal completa.

---

## Fase 12 — Gestión de usuarios internos

### Objetivo

Permitir que administradores gestionen usuarios internos.

### Tareas principales

- Listar usuarios internos.
- Ver perfil de usuario.
- Cambiar rol.
- Activar o desactivar usuario.
- Definir mecanismo seguro para creación de usuarios.
- Evitar uso de claves privadas en frontend.

### Decisión adoptada

La Fase 12 usa gestión de perfiles únicamente:

- los usuarios Auth se crean manualmente desde Supabase Studio o CLI;
- la app gestiona registros en `public.perfiles`;
- la app no crea credenciales;
- la app no consulta `auth.users`;
- la app no usa service role key.

### Criterio de cierre

Un administrador puede gestionar usuarios internos sin comprometer la seguridad del sistema.

### Cierre de fase

La Fase 12 quedó completada con diagnóstico y decisión arquitectónica, listado interno de usuarios, filtros por nombre/teléfono, rol y estado, detalle read-only, edición controlada de `full_name`, `phone`, `avatar_url`, `role` e `is_active`, creación de perfiles internos para usuarios Auth ya existentes, validaciones server-side, protección contra dejar el sistema sin administrador activo y documentación actualizada. La app gestiona solo `public.perfiles`: no crea usuarios Auth, no consulta `auth.users`, no pide email ni contraseña, no implementa invitaciones, no elimina usuarios y no usa service role key.

---

## Fase 13 — Dashboard operativo

### Objetivo

Convertir `/dashboard` en una pantalla realmente útil para el trabajo diario.

### Tareas principales

- Mostrar solicitudes nuevas.
- Mostrar pedidos activos.
- Mostrar pedidos en producción.
- Mostrar pedidos listos para entrega.
- Mostrar pedidos próximos a vencer.
- Mostrar actividad reciente.
- Crear accesos rápidos.
- Adaptar contenido según rol.

### Criterio de cierre

Al entrar al dashboard, cada rol entiende rápidamente qué necesita atender.

### Cierre de fase

La Fase 13 quedó completada con diagnóstico y modelo técnico documentado, servicios server-side de resumen por rol, tarjetas reales en `/dashboard`, paneles operativos para solicitudes pendientes y pedidos que requieren atención, vista específica de pedidos asignados para `trabajador` y actividad reciente mínima basada en `pedido_historial` y `solicitud_historial`. El dashboard se adapta a `admin`, `supervisor` y `trabajador`, respeta RLS como defensa final, no consulta `auth.users`, no usa service role key, no expone rutas privadas de archivos ni `metadata` cruda y no implementa gráficos, reportes avanzados, exportaciones ni notificaciones.

### Cierre de fase puente 13.6

La fase puente 13.6 quedó completada como reajuste operativo de solicitudes y pedidos antes de iniciar la Fase 14. El cierre incluye eliminación definitiva de `quantity` en solicitudes, conversión a pedido con título obligatorio, pedidos manuales con o sin cliente asociado, simplificación de estados de pedido, modelo `pedido_tareas`, tareas simples y cuantificadas, progreso agregado por promedio, reglas de estado condicionadas por tareas, historial automático de tareas y dashboard/listados ajustados al progreso operativo. No se iniciaron trabajos de pulido visual ni responsive.

### Cierre de fase puente 13.7

La fase puente 13.7 quedó completada con el refinamiento operativo final previo
a la Fase 14. El cierre incluye textos y labels visibles corregidos, estados de
solicitud con transiciones controladas, validación centralizada de fechas,
conversión a pedido con prioridad y fecha estimada, numeración secuencial
`P-YY-XXXX`, estado inicial `creado` para pedidos manuales, categoría automática
de archivos según el estado del pedido, historial operativo legible y búsquedas
y filtros uniformes con consultas server-side. RLS continúa como defensa final;
no se añadió service role key, no se consulta `auth.users` y no se inició el
pulido visual o responsive de la Fase 14.

### Cierre de fase puente 13.8

La fase puente 13.8 quedó completada el 6 de junio de 2026 con el hardening
técnico pre-UI/UX. El cierre incluye operaciones críticas transaccionales,
control de concurrencia en estados y tareas, fechas SQL de negocio,
endurecimiento de Storage público, actions enlazadas a IDs de ruta, limpieza
documental y revisión final de schema, RLS, RPCs, permisos, flujos y dashboard.
Las verificaciones de lint, build, diff y esquema local finalizaron
correctamente. Al cerrar esta fase puente, la Fase 14 quedó habilitada como
siguiente etapa, todavía sin iniciar en ese momento.

---

## Fase 14 — Pulido visual y responsive

**Estado:** Completada.

### Objetivo

Mejorar la experiencia visual y de uso del sistema.

### Tareas principales

- Mejorar estilos generales.
- Revisar responsive en computadora y teléfono.
- Crear estados vacíos.
- Crear mensajes de carga.
- Crear mensajes de error.
- Crear mensajes de éxito.
- Agregar confirmaciones en acciones críticas.
- Revisar accesibilidad básica.

### Criterio de cierre

El sistema se puede usar cómodamente desde computadora y teléfono.

### Cierre de fase

La Fase 14 quedó completada el 11 de junio de 2026 con un sistema visual
semántico y consistente, componentes UI reutilizables, navegación responsive,
dashboard y módulos operativos rediseñados, formularios normalizados, pantallas
públicas, estados de permisos y página 404 personalizada. La revisión final
incluyó los breakpoints 375, 768, 1024 y 1440 px, flujos de `admin` y
`trabajador`, navegación por teclado, foco visible y reflow equivalente al
200 % en pantallas críticas. No se modificaron reglas de negocio, permisos,
RLS, RPCs, Storage, autenticación ni contratos de Server Actions.

Las convenciones permanentes para futuras interfaces están documentadas en
`docs/CONVENCIONES_UI_UX_GODEL.md`; el detalle y la evidencia de cierre se
encuentran en `docs/ui-ux/FASE_14_CIERRE_UI_UX.md`.

---

## Fase 15 — Seguridad, pruebas y despliegue inicial

### Objetivo

Preparar una primera versión estable y utilizable por Godel Diseño.

### Tareas principales

- Revisar políticas RLS.
- Probar permisos por rol.
- Probar subida y descarga de archivos.
- Probar flujo completo del sistema.
- Revisar variables de entorno.
- Preparar despliegue en Vercel.
- Documentar instalación y uso básico.

### Flujo completo a probar

1. Cliente envía solicitud.
2. Supervisor revisa solicitud.
3. Supervisor contacta al cliente fuera del sistema.
4. Supervisor convierte solicitud en pedido.
5. Supervisor asigna trabajador.
6. Trabajador consulta pedido asignado.
7. Trabajador sube avance o archivo final.
8. Supervisor marca pedido como listo.
9. Supervisor marca pedido como entregado.
10. El historial conserva los eventos principales.

### Criterio de cierre

El MVP inicial queda listo para ser usado en operación real de forma controlada.

---

## 8. Orden recomendado para tareas de Codex

Aunque el roadmap completo contiene muchas fases, las tareas enviadas a Codex deben ser pequeñas, concretas y revisables.

Orden inicial recomendado:

1. Modelo SQL inicial y enums.
2. Configuración Supabase en Next.js.
3. Login y logout.
4. Protección de dashboard.
5. Perfiles y roles.
6. Formulario público de solicitudes.
7. Listado y detalle de solicitudes.
8. Conversión de solicitud a pedido.
9. Gestión básica de pedidos.
10. Asignación de personal a pedidos.
11. Archivos privados.
12. Comentarios e historial.
13. Pulido visual.
14. Pruebas y despliegue.

---

## 9. Riesgos principales a controlar

### 9.1 Row Level Security mal diseñada

Si las políticas quedan débiles, usuarios no autorizados podrían acceder a información sensible.

### 9.2 Archivos públicos por comodidad

Los archivos no deben exponerse públicamente para resolver rápido. Deben usarse mecanismos controlados.

### 9.3 Lógica de negocio dentro de componentes

Los componentes deben enfocarse en renderizar interfaz. La lógica debe estar en servicios, acciones o módulos especializados.

### 9.4 Funcionalidades futuras antes de tiempo

No se deben implementar catálogo, pagos, WhatsApp, reportes avanzados, inventario ni panel de cliente en esta primera versión.

### 9.5 Gestión de usuarios demasiado pronto

La creación y administración de usuarios debe diseñarse con cuidado para no comprometer claves privadas ni permisos.

---

## 10. Convenciones de trabajo

### Para Codex

Cada tarea debe incluir:

- contexto del proyecto;
- objetivo concreto;
- archivos esperados;
- qué puede modificar;
- qué no debe modificar;
- criterios de aceptación;
- obligación de ejecutar `npm run lint` y `npm run build` cuando corresponda.

### Para revisión

Después de cada tarea de Codex se revisará:

- si respetó la arquitectura;
- si evitó sobreingeniería;
- si no mezcló lógica de negocio en componentes;
- si el código compila;
- si los nombres son consistentes;
- si no introdujo dependencias innecesarias.

---

## 11. Estado de fases

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Base del proyecto | Completada |
| 1 | Fundamentos de dominio y base de datos | Completada |
| 2 | Configuración de Supabase en Next.js | Completada |
| 3 | Autenticación interna | Completada |
| 4 | Roles y permisos internos | Completada |
| 5 | Solicitudes públicas | Completada |
| 6 | Gestión interna de solicitudes | Completada |
| 7 | Clientes | Completada |
| 8 | Pedidos | Completada |
| 9 | Asignación de personal a pedidos | Completada |
| 10 | Archivos privados | Completada |
| 11 | Comentarios internos e historial | Completada |
| 12 | Gestión de usuarios internos | Completada |
| 13 | Dashboard operativo | Completada |
| 14 | Pulido visual y responsive | Completada |
| 15 | Seguridad, pruebas y despliegue inicial | Pendiente |

---

## 12. Próxima fase activa

La próxima fase activa será:

# Fase 15 — Seguridad, pruebas y despliegue inicial

Estado: siguiente fase habilitada, todavía no iniciada.

La Fase 1 quedó completada con el modelo de datos inicial, migraciones base, políticas RLS iniciales y modelo de Storage documentado.

La Fase 2 quedó completada con Supabase configurado en Next.js, clientes tipados para navegador y servidor, variables públicas documentadas, tipos generados integrados y guía de desarrollo local.

La Fase 3 quedó completada con login, logout, proxy de sesión, protección básica del dashboard, validación de perfil interno activo y documentación local de autenticación.

La Fase 4 quedó completada con helpers de perfil y permisos, matriz de permisos por rol, navegación filtrada por rol, protección de rutas internas por rol y documentación del modelo de permisos.

La Fase 5 quedó completada con formulario público en `/solicitud`, validación server-side, Server Action, servicio de creación de solicitudes, inserción segura con estado `nueva`, referencia corta de seguimiento y documentación del flujo público.

Quedan fuera de Fase 5 y se abordarán en fases posteriores: archivos privados, captcha o anti-spam avanzado, gestión interna de solicitudes, conversión a pedido, asociación inteligente con clientes y notificaciones.

La Fase 6 quedó completada con listado interno de solicitudes, filtro por estado, detalle interno, cambio manual de estado, registro de usuario revisor mediante `reviewed_by`, permisos server-side, protección por RLS y documentación del flujo interno.

Quedan fuera de Fase 6 y se abordarán en fases posteriores: conversión de solicitud a pedido, archivos privados, gestión de clientes, historial avanzado, notificaciones y reglas estrictas de transición de estados. En la arquitectura actual, los archivos privados quedan reservados para Fase 10.

La Fase 7 quedó completada con listado interno de clientes, búsqueda básica, creación manual de clientes, detalle de cliente, edición de datos básicos, asociación de solicitudes con clientes existentes, creación de cliente desde solicitud, documentación del flujo de clientes, permisos server-side y protección por RLS.

Quedan fuera de Fase 7 y se abordarán en fases posteriores: pedidos, conversión de solicitud a pedido, archivos privados, eliminación de clientes, historial avanzado, deduplicación inteligente y notificaciones.

Las validaciones de permisos en acciones server-side concretas se aplicarán al implementar los módulos reales de solicitudes, pedidos, clientes y usuarios internos.

La Fase 8 quedó completada con listado de pedidos, detalle, creación manual, conversión desde solicitud aprobada, cambio de estado, asignación de trabajador responsable, visibilidad controlada de cliente y solicitud para trabajadores asignados, y documentación del flujo.

La Fase 9 quedó completada con asignaciones múltiples de personal interno a pedidos, asignación de `admin`, `supervisor` o `trabajador` activos, remoción de asignaciones concretas, visualización completa del personal asignado, visibilidad controlada para trabajador asignado, permisos de cambio de estado con múltiples asignados y documentación oficial de asignaciones.

La Fase 10 quedó completada con infraestructura privada de Supabase Storage, bucket privado `godel-files`, policies de `storage.objects`, helpers y validadores de archivos, rutas privadas para solicitudes y pedidos, subida de archivos internos en pedidos, subida pública controlada de archivos opcionales en solicitudes, visualización interna de archivos de solicitud, registro de metadatos en `archivos`, descargas mediante URLs firmadas de corta duración y documentación actualizada. Los archivos permanecen privados, no hay URLs públicas permanentes, no se usa service role key y RLS/policies siguen como defensa final.

La Fase 11 quedó completada con comentarios internos e historial operativo para pedidos y solicitudes, reglas append-only, RLS como defensa final, RPCs estrechas para datos mínimos de autor/actor en pedidos, triggers privados de historial automático y documentación actualizada.

La Fase 12 quedó completada con gestión de perfiles internos para `admin`: listado, filtros, detalle, edición, creación de perfiles para usuarios Auth existentes, validaciones server-side, guardas del último administrador activo y documentación actualizada. Se mantiene la Opción A: la app no crea credenciales, no consulta `auth.users`, no pide email ni contraseña, no implementa invitaciones ni eliminación, y no usa service role key.

La Fase 13 quedó completada con dashboard operativo real en `/dashboard`: tarjetas de resumen por rol, paneles operativos por rol y actividad reciente mínima. La fase puente 13.6 cerró el reajuste operativo de solicitudes y pedidos: solicitudes sin `quantity`, conversión con título obligatorio, pedidos manuales sin cliente asociado, estados simplificados, tareas de pedido, progreso por promedio, reglas de estado según tareas, historial de tareas y dashboard/listados ajustados a ese modelo. La fase puente 13.7 completó los labels y textos visibles, transiciones controladas de solicitudes, fechas centralizadas, conversión con prioridad y fecha estimada, numeración `P-YY-XXXX`, estado `creado`, archivos por estado e interfaz uniforme de búsquedas y filtros server-side. `admin` y `supervisor` reciben información operativa global permitida por RLS; `trabajador` recibe únicamente métricas, paneles y actividad de pedidos asignados. No se implementan gráficos, reportes avanzados, exportaciones, notificaciones reales ni pulido visual/responsive.

La Fase 14 quedó completada con sistema visual semántico, componentes UI
reutilizables, layout y navegación responsive, dashboard, listados, detalles y
formularios normalizados, experiencia pública, pantallas de permisos, 404
personalizada y revisión final de responsive y accesibilidad básica. La guía
permanente para nueva UI es `docs/CONVENCIONES_UI_UX_GODEL.md`.

La próxima fase activa es Fase 15 — Seguridad, pruebas y despliegue inicial. No
debe iniciarse hasta recibir una tarea específica para esa fase.
