# Plan técnico de administración y configuración

## 1. Propósito

Fijar el contrato definitivo de la Etapa 10 antes de mover rutas, rediseñar pantallas o modificar consultas. Esta etapa cubre Clientes, Configuración, Usuarios dentro de Configuración y Plantillas dentro de Configuración.

El documento es deliberadamente contractual: define rutas finales, columnas, navegación, restricciones y riesgos para que la implementación posterior sea incremental, server-first y sin cambios accidentales de dominio.

## 2. Decisión estructural principal

Clientes sigue siendo módulo propio.
Usuarios y Plantillas pasan a vivir dentro de Configuración.

Esta decisión mantiene Clientes como módulo operativo usado por admin y supervisor, mientras concentra las superficies admin-only bajo Configuración.

## 3. Rutas actuales detectadas

Rutas actuales detectadas en `src/app/(interno)/dashboard`:

| Área | Ruta actual | Estado |
| --- | --- | --- |
| Clientes | `/dashboard/clientes` | Listado existente. |
| Clientes | `/dashboard/clientes/nuevo` | Creación existente. |
| Clientes | `/dashboard/clientes/[id]` | Detalle existente. |
| Clientes | `/dashboard/clientes/[id]/editar` | Edición existente. |
| Usuarios | `/dashboard/usuarios` | Listado existente admin-only. |
| Usuarios | `/dashboard/usuarios/nuevo` | Creación de perfil interno existente admin-only. |
| Usuarios | `/dashboard/usuarios/[id]` | Detalle existente admin-only. |
| Usuarios | `/dashboard/usuarios/[id]/editar` | Edición existente admin-only. |
| Configuración | `/dashboard/configuracion` | Pantalla existente de configuración/plantillas. |
| Plantillas | `/dashboard/configuracion/plantillas/[templateId]` | Gestión existente de plantilla y tareas. |

No se detectaron rutas actuales para:

- `/dashboard/configuracion/usuarios`;
- `/dashboard/configuracion/usuarios/nuevo`;
- `/dashboard/configuracion/usuarios/[id]/editar`;
- `/dashboard/configuracion/plantillas`;
- `/dashboard/configuracion/plantillas/nueva`.

## 4. Rutas finales propuestas

| Área | Ruta final |
| --- | --- |
| Clientes | `/dashboard/clientes` |
| Clientes | `/dashboard/clientes/nuevo` |
| Clientes | `/dashboard/clientes/[id]` |
| Clientes | `/dashboard/clientes/[id]/editar` |
| Configuración hub | `/dashboard/configuracion` |
| Usuarios | `/dashboard/configuracion/usuarios` |
| Usuarios | `/dashboard/configuracion/usuarios/nuevo` |
| Usuarios | `/dashboard/configuracion/usuarios/[id]/editar` |
| Plantillas | `/dashboard/configuracion/plantillas` |
| Plantillas | `/dashboard/configuracion/plantillas/nueva` |
| Plantillas | `/dashboard/configuracion/plantillas/[id]` |

## 5. Rutas legacy temporales

Durante la migración pueden existir rutas legacy para evitar cortes bruscos:

| Ruta legacy | Comportamiento temporal propuesto |
| --- | --- |
| `/dashboard/usuarios` | Redirigir a `/dashboard/configuracion/usuarios`. |
| `/dashboard/usuarios/nuevo` | Redirigir a `/dashboard/configuracion/usuarios/nuevo`. |
| `/dashboard/usuarios/[id]` | Redirigir a `/dashboard/configuracion/usuarios/[id]/editar` si se elimina el detalle intermedio. |
| `/dashboard/usuarios/[id]/editar` | Redirigir a `/dashboard/configuracion/usuarios/[id]/editar`. |
| `/dashboard/configuracion/plantillas/[templateId]` | Mantener o redirigir a `/dashboard/configuracion/plantillas/[id]` si se renombra el segmento. |

Las rutas legacy deben ser temporales, sin duplicar lógica de negocio ni crear dos fuentes de verdad.

## 6. Clientes

### 6.1 Listado

Columnas finales:
Cliente | Teléfono | Correo electrónico | Creación | Actualización

Reglas:

- mantener búsqueda;
- no añadir filtros en esta definición salvo decisión posterior;
- fila/card abre el detalle;
- no mostrar acciones repetidas si la fila completa navega;
- mantener el módulo en `/dashboard/clientes`.

### 6.2 Detalle

- quitar textos redundantes;
- mostrar identificador completo;
- añadir pedidos vinculados.

El detalle debe seguir orientado a consulta interna de admin/supervisor. La edición permanece en `/dashboard/clientes/[id]/editar`.

### 6.3 Riesgos

- pedidos vinculados puede requerir ampliar la consulta del detalle.
- esa ampliación debe conservar DTO interno controlado y no convertir el detalle en reporte amplio.
- no introducir deduplicación, eliminación ni estadísticas de cliente dentro de esta etapa.

## 7. Configuración hub

Debe mostrar:

- Usuarios;
- Plantillas.

Cada opción debe ser una card/list item clicable con flecha o indicador de navegación.

El hub debe funcionar como entrada admin-only a superficies de administración. No debe convertirse en dashboard analítico ni mezclar métricas operativas.

## 8. Usuarios dentro de Configuración

### 8.1 Rutas finales

```text
/dashboard/configuracion/usuarios
/dashboard/configuracion/usuarios/nuevo
/dashboard/configuracion/usuarios/[id]/editar
```

No se define ruta final de detalle read-only independiente para usuarios. La fila/card del listado abre edición directamente.

### 8.2 Columnas finales

Usuario | Rol | Teléfono | Estado | Creación | Actualización

### 8.3 Celda Usuario

- avatar o iniciales;
- nombre;
- UUID completo.

### 8.4 Nota sobre correo

El modelo actual de perfiles internos no incluye email. No mostrar email salvo decisión posterior de modelo/seguridad.

La app no debe consultar `auth.users`, no debe crear credenciales y no debe introducir `service_role` para resolver email en esta etapa.

### 8.5 Navegación

Fila/card abre edición directamente.

La pantalla de edición debe mantener las protecciones vigentes: admin-only, validación server-side de `usuarios.manage`, guardas de último admin y ausencia de eliminación física.

## 9. Plantillas dentro de Configuración

### 9.1 Rutas finales

```text
/dashboard/configuracion/plantillas
/dashboard/configuracion/plantillas/nueva
/dashboard/configuracion/plantillas/[id]
```

### 9.2 Columnas finales

Plantilla | Descripción | Estado | Tareas | Creación | Actualización

### 9.3 Sin workflow

El workflow no influye en esta pantalla.

La pantalla de plantillas no debe mostrar ni filtrar por workflow durante la Etapa 10.

### 9.4 Listado

- buscador sí;
- filtros no.

### 9.5 Gestión de plantilla

La pantalla [id] debe unificar:

- editar datos;
- activar/desactivar;
- gestionar tareas.

Debe evitarse separar edición y tareas en rutas distintas salvo decisión posterior. La ruta `[id]` será la superficie principal de gestión.

## 10. Navegación y sidebar

- Clientes se mantiene.
- Configuración se mantiene.
- Usuarios se elimina como entrada principal al cierre.
- `/dashboard/usuarios` puede redirigir temporalmente durante migración.

La navegación visible no sustituye permisos. Las rutas finales deben quedar alineadas con `canAccessDashboardRoute` cuando se implemente la migración.

## 11. Permisos

No cambiar permisos ni RLS.
Configuración y usuarios siguen siendo admin-only.

Reglas vigentes:

- Clientes conserva acceso de `admin` y `supervisor` según `clientes.view` y `clientes.manage`.
- Usuarios conserva acceso exclusivo de `admin` según `usuarios.view` y `usuarios.manage`.
- Configuración y Plantillas conservan acceso exclusivo de `admin` según `configuracion.view` y `configuracion.manage`.
- No usar `service_role`.
- No consultar `auth.users` desde la aplicación.
- No consultar Supabase desde Client Components.

## 12. Orden de implementación

1. Actualizar protección de rutas y navegación para reconocer las rutas finales sin quitar aún las legacy.
2. Convertir `/dashboard/configuracion` en hub con entradas a Usuarios y Plantillas.
3. Migrar Usuarios a `/dashboard/configuracion/usuarios` conservando servicios, permisos y guardas existentes.
4. Convertir filas/cards de Usuarios para abrir edición directamente.
5. Crear listado de Plantillas en `/dashboard/configuracion/plantillas`.
6. Mover creación de Plantillas a `/dashboard/configuracion/plantillas/nueva`.
7. Consolidar gestión de Plantilla en `/dashboard/configuracion/plantillas/[id]`.
8. Rediseñar Clientes con columnas finales y detalle más limpio.
9. Añadir pedidos vinculados al detalle de Cliente si la consulta lo permite dentro del alcance.
10. Activar redirecciones legacy temporales.
11. Quitar entrada principal de Usuarios del sidebar cuando las rutas finales estén validadas.
12. Ejecutar QA focal por rol y responsive al cierre de la etapa.

## 13. Criterios de aceptación de Etapa 10

- Existe hub de Configuración con Usuarios y Plantillas como opciones navegables.
- Clientes permanece como módulo propio.
- Usuarios vive bajo `/dashboard/configuracion/usuarios`.
- Plantillas vive bajo `/dashboard/configuracion/plantillas`.
- La entrada principal Usuarios desaparece del sidebar al cierre.
- Las rutas legacy de Usuarios redirigen temporalmente o quedan documentadas como removidas.
- Las columnas finales de Clientes, Usuarios y Plantillas quedan aplicadas.
- Usuarios no muestra email.
- Plantillas no muestra ni usa workflow en su listado.
- Fila/card abre el destino definido para cada módulo.
- No cambian permisos, RLS, RPCs ni modelo de datos salvo una decisión posterior explícita.
- No se introduce `service_role` ni consultas a `auth.users`.
- No se consulta Supabase desde Client Components.
- La etapa pasa las validaciones asignadas para cambios visuales y de rutas.

## 14. Riesgos

- La migración de Usuarios puede romper enlaces directos o pruebas si no se mantienen redirecciones temporales.
- Mover rutas admin-only exige actualizar protección de rutas, navegación visible y tests en la misma subtarea de implementación.
- Abrir edición directamente desde Usuarios elimina el detalle intermedio; conviene asegurar que la pantalla de edición muestre suficiente contexto.
- Pedidos vinculados en Cliente puede requerir ampliar la consulta del detalle y definir un DTO específico.
- Plantillas tiene acciones de tareas; consolidarlas en `[id]` puede aumentar densidad visual si no se agrupa bien.
- Mantener rutas legacy demasiado tiempo puede duplicar responsabilidades.
- Agregar email a Usuarios sin cambio de modelo implicaría consultar Auth o duplicar datos sensibles; queda fuera de esta etapa.
- Cambiar permisos o RLS durante el rediseño introduciría riesgo funcional y queda explícitamente prohibido.
