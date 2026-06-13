# Checklist de cierre Alfa 1: workflow_type

**Fecha de cierre:** 2026-06-13

## Decision arquitectonica

- `workflow_type` es la fuente de verdad para distinguir `encargo` e
  `impresion`.
- `service_type` describe el servicio solicitado y no gobierna formularios,
  conversiones, estados ni reglas operativas.
- Ambos flujos comparten solicitudes, pedidos, clientes, archivos, comentarios,
  historial, permisos y estados generales.
- Los encargos requieren tareas para avanzar.
- Las impresiones pueden avanzar por los mismos estados sin tareas obligatorias.
- Los datos especificos de impresion se conservan en una descripcion
  estructurada, sin tablas exclusivas.

## Subfases completadas

- [x] 1.1: enum, columnas y tipos de `workflow_type`.
- [x] 1.2: selector y validacion del formulario publico.
- [x] 1.3: captura estructurada y archivos obligatorios para impresion.
- [x] 1.4: visibilidad y filtros internos de solicitudes.
- [x] 1.5: conversion de solicitud preservando el flujo.
- [x] 1.6: creacion manual y presentacion interna de pedidos.
- [x] 1.7: reglas de tareas y transiciones adaptadas por flujo.
- [x] 1.8: auditoria transversal, documentacion y cierre.

## Modulos verificados

- Solicitud publica: validacion, creacion y archivos.
- Solicitudes internas: listado, detalle, filtros y conversion.
- Pedidos: creacion manual, listado, detalle, labels y estados.
- Base de datos: enum, columnas, RPCs y tipos generados.
- Dashboard: lectura generica compatible con ambos flujos.
- Documentacion funcional, modelo de datos, storage, roadmap y deuda tecnica.

## Casos de aceptacion

- [x] Se pueden crear solicitudes de encargo e impresion.
- [x] La conversion conserva `workflow_type` y hereda archivos.
- [x] Listados y filtros permiten trabajar con ambos flujos.
- [x] Un encargo sin tareas no puede avanzar a produccion.
- [x] Un encargo con tareas completas puede avanzar.
- [x] Una impresion puede avanzar sin tareas hasta `listo_entrega`.
- [x] Ningun pedido puede saltar directamente a `entregado`.
- [x] Los estados cerrados no admiten nuevas transiciones.
- [x] No existe logica de flujo basada en comparaciones de `service_type`.

## Deuda aceptada

- Normalizar detalles de impresion solo si reportes o automatizaciones lo
  justifican.
- Reconciliar solicitudes de impresion cuando falle la subida posterior de
  archivos.
- Evaluar estados especificos o reducidos para impresion con datos reales.
- Separar metricas de dashboard por flujo cuando exista una necesidad concreta.
