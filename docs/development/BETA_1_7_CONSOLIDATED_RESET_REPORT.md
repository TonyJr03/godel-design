# Beta 1.7 - Reemplazo controlado y reset tecnico

## 1. Objetivo

Convertir el set consolidado de migraciones en el set activo del proyecto y
validar que la base local puede levantarse desde cero con las 5 migraciones
finales.

No se modifico codigo de aplicacion, componentes, librerias ni tipos generados.

## 2. Migraciones reemplazadas

Se eliminaron del set activo `supabase/migrations/` las 19 migraciones
historicas:

- `20260529090000_01_core_schema.sql`
- `20260529090100_02_rls_policies.sql`
- `20260529090200_03_public_rpcs.sql`
- `20260529090300_04_history_triggers.sql`
- `20260529090400_05_storage_current_state.sql`
- `20260613090000_06_workflow_type.sql`
- `20260613090100_07_preserve_workflow_type_on_conversion.sql`
- `20260613090200_08_print_orders_advance_without_tasks.sql`
- `20260616090000_09_public_reference.sql`
- `20260616090100_10_public_tracking_status_rpc.sql`
- `20260616090200_11_remove_order_number_from_public_tracking.sql`
- `20260622090000_12_add_task_template_model.sql`
- `20260622090100_13_apply_task_template_to_pedido.sql`
- `20260622090200_14_pedido_pagos.sql`
- `20260624090000_15_create_manual_pedido_rpc.sql`
- `20260624090100_16_convert_solicitud_payment_amount.sql`
- `20260624090200_17_add_payment_history_action.sql`
- `20260624090300_18_update_pedido_payment_rpc.sql`
- `20260624090400_19_block_delivery_without_full_payment.sql`

Tambien se elimino la carpeta temporal `supabase/migrations_consolidated/` para
evitar duplicidad de migraciones activas.

## 3. Migraciones consolidadas activas

El set activo final en `supabase/migrations/` queda con:

- `20260625000100_01_core_schema.sql`
- `20260625000200_02_security_rls_grants.sql`
- `20260625000300_03_business_rpcs.sql`
- `20260625000400_04_storage.sql`
- `20260625000500_05_final_hardening.sql`

## 4. Resultado de supabase db reset

El comando directo `supabase db reset` no estaba disponible en PATH local. Se uso
el CLI instalado en el proyecto:

```bash
node_modules\.bin\supabase.cmd db reset
```

Resultado: paso correctamente.

Migraciones aplicadas:

1. `20260625000100_01_core_schema.sql`
2. `20260625000200_02_security_rls_grants.sql`
3. `20260625000300_03_business_rpcs.sql`
4. `20260625000400_04_storage.sql`
5. `20260625000500_05_final_hardening.sql`

No hubo fallos de migracion ni correcciones SQL posteriores al reset.

## 5. Validaciones de catalogo

### Tablas

Resultado: OK. No faltan tablas esperadas.

Tablas verificadas:

- `perfiles`
- `clientes`
- `solicitudes`
- `pedidos`
- `pedido_trabajadores`
- `pedido_tareas`
- `archivos`
- `pedido_comentarios`
- `pedido_historial`
- `solicitud_comentarios`
- `solicitud_historial`
- `trabajo_plantillas`
- `trabajo_plantilla_tareas`
- `pedido_pagos`
- `pedido_contadores`

### Enums

Resultado: OK. No faltan enums esperados.

Enums verificados:

- `app_role`
- `workflow_type`
- `solicitud_estado`
- `pedido_estado`
- `pedido_pago_estado`
- `pedido_prioridad`
- `pedido_tarea_tipo`
- `archivo_visibility`
- `pedido_historial_action`
- `solicitud_historial_action`

### RPCs

Resultado: OK. No faltan RPCs finales.

RPCs verificadas:

- `actualizar_estado_pedido`
- `actualizar_estado_solicitud`
- `actualizar_pago_pedido`
- `aplicar_plantilla_tareas_pedido`
- `consultar_estado_publico`
- `convertir_solicitud_a_pedido`
- `crear_cliente_desde_solicitud`
- `crear_pedido_manual`
- `listar_pedido_comentarios`
- `listar_pedido_historial`
- `listar_solicitud_comentarios`
- `listar_solicitud_historial`

### Storage

Resultado funcional: OK.

- Bucket `godel-files`: existe.
- Bucket `godel-files`: privado.
- `storage.objects`: RLS activo.
- Policies anonimas de `SELECT`, `UPDATE` o `DELETE` en `storage.objects`: ninguna.
- Prueba efectiva con rollback: `anon` no vio ni actualizo una fila temporal de
  `storage.objects`.

Advertencia tecnica: la ACL base de `storage.objects` aparece administrada por
`supabase_storage_admin` y reporta privilegios SQL para `anon` en el catalogo.
El acceso efectivo queda cerrado por RLS y por ausencia de policies anonimas de
lectura/mutacion. Esto debe revisarse con uploads reales en Beta 1.8.

### Grants anon

Resultado: OK en tablas publicas de negocio y RPCs.

- `anon` puede `INSERT` en `public.solicitudes`.
- `anon` puede `INSERT` en `public.archivos`.
- `anon` puede `INSERT` en `storage.objects`.
- `anon` puede ejecutar `public.consultar_estado_publico(text)`.
- `anon` no tiene `SELECT` en tablas internas verificadas.
- `anon` no tiene `UPDATE` ni `DELETE` en tablas publicas de negocio.
- `anon` no puede ejecutar RPCs internas.
- `anon` no tiene permisos sobre `public.pedido_pagos`.

### Grants authenticated

Resultado: OK para el contrato consolidado.

`authenticated` conserva DML explicito sobre tablas de negocio bajo RLS y execute
solo sobre RPCs internas finales y helpers privados necesarios.

## 6. Auditorias ejecutadas

```bash
npm.cmd run diff:check
```

Resultado: OK.

```bash
npm.cmd run audit:security
```

Resultado: OK. El script reporto referencias documentales y la FK esperada hacia
`auth.users`, sin fallo.

```bash
npm.cmd run audit:client-supabase
```

Resultado: OK. Sin coincidencias.

```bash
npm.cmd run audit:public-tracking
```

Resultado: OK. Sin coincidencias.

## 7. Riesgos o advertencias pendientes

- Validar uploads reales en Beta 1.8, incluyendo `/solicitud` con archivos.
- Regenerar types en Beta 1.8 y comparar contratos.
- Revisar la app contra el nuevo set consolidado.
- Verificar flujo `/solicitud`.
- Verificar flujo `/estado`.
- Verificar pedidos, pagos y tareas.
- Revisar la advertencia de ACL base de `storage.objects` frente al acceso
  efectivo por RLS/policies.
