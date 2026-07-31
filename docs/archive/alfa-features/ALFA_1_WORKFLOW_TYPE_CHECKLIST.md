# Checklist de cierre Alfa 1: workflow_type

**Fecha de cierre:** 2026-06-13

## Decisión arquitectónica

- `workflow_type` es la fuente de verdad para distinguir `encargo` e
  `impresion`.
- `service_type` describe el servicio solicitado y no gobierna formularios,
  conversiones, estados ni reglas operativas.
- Ambos flujos comparten solicitudes, pedidos, clientes, archivos, comentarios,
  historial, permisos y estados generales.
- Los encargos requieren tareas para avanzar.
- Las impresiones pueden avanzar por los mismos estados sin tareas obligatorias.
- Los datos específicos de impresión se conservan en una descripción
  estructurada, sin tablas exclusivas.

## Subfases completadas

- [x] 1.1: enum, columnas y tipos de `workflow_type`.
- [x] 1.2: selector y validación del formulario público.
- [x] 1.3: captura estructurada y archivos obligatorios para impresión.
- [x] 1.4: visibilidad y filtros internos de solicitudes.
- [x] 1.5: conversión de solicitud preservando el flujo.
- [x] 1.6: creación manual y presentación interna de pedidos.
- [x] 1.7: reglas de tareas y transiciones adaptadas por flujo.
- [x] 1.8: auditoría transversal, documentación y cierre.

## Módulos verificados

- Solicitud pública: validación, creación y archivos.
- Solicitudes internas: listado, detalle, filtros y conversión.
- Pedidos: creación manual, listado, detalle, labels y estados.
- Base de datos: enum, columnas, RPCs y tipos generados.
- Dashboard: lectura genérica compatible con ambos flujos.
- Documentación funcional, modelo de datos, storage, roadmap y deuda técnica.

## Casos de aceptación

- [x] Se pueden crear solicitudes de encargo e impresión.
- [x] La conversión conserva `workflow_type` y hereda archivos.
- [x] Listados y filtros permiten trabajar con ambos flujos.
- [x] Un encargo sin tareas no puede avanzar a producción.
- [x] Un encargo con tareas completas puede avanzar.
- [x] Una impresión puede avanzar sin tareas hasta `listo_entrega`.
- [x] Ningún pedido puede saltar directamente a `entregado`.
- [x] Los estados cerrados no admiten nuevas transiciones.
- [x] No existe lógica de flujo basada en comparaciones de `service_type`.

## Deuda aceptada

- Normalizar detalles de impresión solo si reportes o automatizaciones lo
  justifican.
- Reconciliar solicitudes de impresión cuando falle la subida posterior de
  archivos.
- Evaluar estados específicos o reducidos para impresión con datos reales.
- Separar métricas de dashboard por flujo cuando exista una necesidad concreta.
