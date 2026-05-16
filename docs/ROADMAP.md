# Roadmap Oficial del Proyecto Godel Diseño

**Proyecto:** Sistema Web de Gestión para Godel Diseño  
**Repositorio:** `godel-design`  
**Documento:** Roadmap oficial de desarrollo inicial  
**Estado:** Activo  
**Versión:** 1.0  
**Fecha:** 2026-05-12  

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
- asignación de trabajadores;
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

- `profiles`
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

- Leer rol desde `profiles`.
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
- Generar `numero_pedido`.
- Listar pedidos en `/dashboard/pedidos`.
- Ver detalle en `/dashboard/pedidos/[id]`.
- Cambiar estados de pedido.
- Registrar fechas importantes.
- Manejar prioridad.

### Estados de pedido

- `solicitud_recibida`
- `en_revision`
- `cotizado`
- `aprobado_cliente`
- `en_diseno`
- `en_produccion`
- `listo_entrega`
- `entregado`
- `cancelado`

### Criterio de cierre

La empresa puede crear, consultar, actualizar y controlar pedidos reales.

---

## Fase 9 — Asignación de trabajadores

### Objetivo

Permitir asignar uno o varios trabajadores a cada pedido.

### Tareas principales

- Listar trabajadores activos.
- Asignar trabajadores a pedidos.
- Remover trabajadores de pedidos.
- Registrar quién asignó.
- Mostrar trabajadores asignados.
- Permitir que trabajadores vean solo sus pedidos asignados.
- Definir estados que puede actualizar un trabajador.

### Criterio de cierre

Un trabajador autenticado puede consultar y trabajar únicamente sobre los pedidos que tiene asignados.

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

### Decisión pendiente

Definir si la creación de usuarios internos se hará inicialmente desde Supabase manualmente o desde un panel admin con acción segura del servidor.

### Criterio de cierre

Un administrador puede gestionar usuarios internos sin comprometer la seguridad del sistema.

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

---

## Fase 14 — Pulido visual y responsive

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
5. Profiles y roles.
6. Formulario público de solicitudes.
7. Listado y detalle de solicitudes.
8. Conversión de solicitud a pedido.
9. Gestión básica de pedidos.
10. Asignación de trabajadores.
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
| 8 | Pedidos | Pendiente |
| 9 | Asignación de trabajadores | Pendiente |
| 10 | Archivos privados | Pendiente |
| 11 | Comentarios internos e historial | Pendiente |
| 12 | Gestión de usuarios internos | Pendiente |
| 13 | Dashboard operativo | Pendiente |
| 14 | Pulido visual y responsive | Pendiente |
| 15 | Seguridad, pruebas y despliegue inicial | Pendiente |

---

## 12. Próxima fase activa

La próxima fase activa será:

# Fase 8 — Pedidos

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
