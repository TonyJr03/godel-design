# Plan de Baseline Final de Base de Datos

Fecha de auditoria: 2026-07-30

Rama: `refactor/final-database-baseline`

SHA inicial: `07cbaa0ac937bc4f81e26bb3f9b78d0439b734e1`

## 1. Objetivo

Disenar el set consolidado final de migraciones de Godel Diseno a partir de las 21 migraciones activas y del estado efectivo de la base local, sin redactar aun los SQL definitivos.

La siguiente fase debera poder implementar las seis migraciones finales sin reinterpretar las migraciones historicas.

## 2. Alcance

Incluido:

- inventario fisico de migraciones;
- clasificacion por destino 01-06;
- inventario de esquema efectivo local;
- identificacion de versiones finales de funciones y RPCs;
- separacion de DML productivo, backfills y datos QA;
- diseno de dependencias y orden interno;
- riesgos y decisiones pendientes.

Excluido:

- editar migraciones historicas;
- escribir las seis migraciones consolidadas;
- ejecutar `supabase db reset`;
- tocar Supabase remoto;
- modificar seed, tipos generados o codigo de aplicacion;
- hacer commit/push.

## 3. Estado Actual

El proyecto esta en `main` actualizado y en la rama de trabajo `refactor/final-database-baseline`. El arbol estaba limpio antes de iniciar. Supabase CLI local es `2.109.1`, PostgreSQL local esta configurado con `major_version = 17` y la base local responde.

Servicios locales auxiliares detenidos: imgproxy, edge runtime, analytics, vector y pooler. Esto no impide las consultas de catalogo realizadas contra la base local.

## 4. Total Real de Migraciones

Total de migraciones fisicas: **21**.

El historial local del CLI lista las mismas 21 versiones. No se reparo historial.

## 5. Decision de Seis Migraciones

Set final aprobado:

```text
01_core_schema.sql
02_security_rls_grants.sql
03_business_rpcs.sql
04_storage.sql
05_auth_admin_user_lifecycle.sql
06_final_hardening.sql
```

## 6. Responsabilidad Detallada 01-06

### 01 Core Schema

Debe crear el estado estructural final desde cero:

- schema `private`;
- extensiones requeridas;
- enums finales completos;
- tablas finales del core operativo, sin crear auditorias privadas de Auth Admin en 01;
- columnas finales, incluyendo `service_id not null`, `perfiles.must_change_password` y `perfiles.created_by`;
- constraints, FKs, PKs y uniques;
- indices normales, unicos, parciales y funcionales;
- triggers estructurales;
- funciones estructurales;
- historial automatico;
- catalogo `tipos_servicio`;
- DML canonico de servicios iniciales;
- servicio unico de `Impresión`.

No debe incluir backfills historicos ni columnas legacy.

### 02 Security RLS Grants

Debe crear el contrato final de seguridad de tablas:

- helpers de autorizacion;
- semantica de perfil operativo (`is_active = true` y `must_change_password = false`);
- grants/revokes de schemas, tipos y tablas;
- RLS habilitado;
- policies finales;
- acceso publico controlado;
- seguridad de `tipos_servicio`;
- grants por columnas de `perfiles`;
- ausencia de insert legacy en `perfiles`;
- restricciones para usuarios con cambio inicial pendiente.

### 03 Business RPCs

Debe contener solo versiones finales de RPCs de negocio:

- solicitudes;
- pedidos;
- creacion manual;
- conversion de solicitudes;
- estados;
- pagos;
- tareas;
- plantillas;
- comentarios;
- historial;
- tracking publico;
- firmas finales con `p_service_id` donde aplica.

No debe conservar firmas intermedias.

### 04 Storage

Debe contener:

- bucket privado `godel-files`;
- limite 20 MB y MIME types permitidos;
- helpers de rutas y validacion;
- policies de `storage.objects`;
- grants/revokes de proyecto;
- validaciones de privacidad y acceso;
- assertions locales del subsistema.

### 05 Auth Admin User Lifecycle

Debe contener el subsistema especializado completo:

- provisioning Auth -> perfil;
- triggers sobre `auth.users`;
- metadata `godel_provisioning`;
- auditoria de alta;
- rate limits de alta;
- onboarding obligatorio;
- finalizacion idempotente del cambio inicial;
- control de concurrencia;
- reset administrativo de contrasena temporal;
- auditoria de reset;
- recuperacion ante resultados inciertos;
- grants tecnicos minimos a `supabase_auth_admin`;
- grants estrictos a `authenticated` y `service_role`;
- revokes propios;
- assertions de identidad.

El nombre del bloque es **Auth Admin User Lifecycle**. No debe describirse como "service role" de forma generica.

### 06 Final Hardening

Debe cerrar y verificar el contrato creado por 01-05:

- revokes globales finales;
- grants finales;
- comments;
- deteccion de funciones expuestas accidentalmente;
- revision de `SECURITY DEFINER`;
- revision de `search_path`;
- comprobaciones de RLS;
- comprobaciones de Storage;
- comprobaciones de identidad;
- ausencia de legacy;
- assertions de equivalencia.

No debe introducir funcionalidad nueva.

## 7. Orden Interno de Cada Archivo

### 01

1. Extensions.
2. Schemas.
3. Enums finales.
4. Tablas base sin ciclos.
5. Constraints/FKs diferidas para ciclos.
6. DML canonico de `tipos_servicio`.
7. Funciones estructurales.
8. Triggers estructurales.
9. Indices.
10. Comments estructurales minimos.

### 02

1. Revoke base.
2. Helpers de autorizacion.
3. Grants de schema/tipo/tabla.
4. Enable RLS.
5. Policies finales por tabla.
6. Grants de helpers privados.
7. Grants por columna en `perfiles`.
8. Assertions de no-legacy de seguridad local al archivo.

### 03

1. Firmas finales de RPCs de solicitud.
2. Firmas finales de RPCs de pedido.
3. Firmas finales de pagos/tareas/plantillas.
4. Firmas finales de comentarios/historial/tracking.
5. Grants EXECUTE finales.
6. Comments de contrato.

### 04

1. Bucket.
2. Helpers de path.
3. Helpers de validacion de archivos.
4. Grants/revokes de Storage.
5. Policies de `storage.objects`.
6. Assertions de privacidad.

### 05

1. Tablas privadas de auditoria.
2. Indices y constraints de auditoria.
3. Revoke directo de auditorias.
4. Funcion de provisioning.
5. Triggers `auth.users`.
6. RPCs de alta auditada.
7. RPC de cambio inicial.
8. RPCs de reset administrativo.
9. Grants/revokes tecnicos.
10. Assertions del subsistema.

### 06

1. Revokes finales.
2. Grants finales esperados.
3. Comments finales.
4. Assertions de estructura.
5. Assertions de RLS/policies.
6. Assertions de RPC/grants.
7. Assertions de Storage.
8. Assertions de Auth Admin User Lifecycle.
9. Deteccion de objetos legacy.
10. Deteccion de exposiciones accidentales.

## 8. Mapeo de Migraciones Actuales hacia 01-06

| Migracion actual | Destino final | Nota |
| --- | --- | --- |
| `20260625000100_01_core_schema.sql` | 01 | Reescribir como estado inicial final |
| `20260625000200_02_security_rls_grants.sql` | 02, 06 | Integrar helpers/policies finales y mover checks a 06 |
| `20260625000300_03_business_rpcs.sql` | 03 | Mantener solo RPCs finales no reemplazadas |
| `20260625000400_04_storage.sql` | 04, 06 | Integrar Storage y verificar en 06 |
| `20260625000500_05_final_hardening.sql` | 06 | Mover hardening al cierre final |
| `20260625000600_06_add_pedido_actualizado_history_action.sql` | 01 | Integrar valor enum desde el inicio |
| `20260625000700_07_actualizar_datos_pedido_rpc.sql` | 03 | Descartar version intermedia |
| `20260727163202_configurable_service_types_expand.sql` | 01, 02, 06 | Integrar estructura/policies finales; descartar backfills |
| `20260728015355_public_service_types_integration.sql` | 02 | Descartar policy intermedia en favor de contrato final |
| `20260728034617_internal_service_types_orders.sql` | 03 | Integrar RPCs finales de creacion/conversion |
| `20260728090000_actualizar_servicio_pedido_rpc.sql` | 03 | Integrar RPC final de edicion de pedido |
| `20260728120000_service_types_contract.sql` | 01, 02, 06 | Integrar contrato final; descartar backfills/legacy |
| `20260729232826_secure_admin_user_creation_foundation.sql` | 01, 02, 05 | Columnas en 01, semantica en 02, provisioning en 05 |
| `20260729235400_secure_admin_user_creation_privilege_hardening.sql` | 02, 06 | Grants finales de `perfiles` |
| `20260730013011_secure_admin_user_creation_app_metadata_update_trigger.sql` | 05 | Trigger complementario Auth |
| `20260730015353_secure_internal_user_creation_audit_rate_limit.sql` | 05 | Auditoria y rate limit de alta |
| `20260730030404_remove_legacy_internal_profile_creation.sql` | 02, 06 | Integrar ausencia de insert legacy |
| `20260730143435_make_initial_password_completion_idempotent.sql` | 05 | Descartar version intermedia |
| `20260730150845_harden_initial_password_completion_concurrency.sql` | 05 | Integrar version final |
| `20260730165326_secure_internal_user_password_reset.sql` | 05 | Integrar tabla y parte estructural; funciones reemplazadas por final |
| `20260730174544_harden_internal_user_password_reset_recovery.sql` | 05 | Integrar funciones finales de reset |

## 9. Objetos Finales Esperados

Schemas: `public`, `private`, `storage`, `auth`.

Tablas propias: `perfiles`, `clientes`, `tipos_servicio`, `solicitudes`, `pedidos`, `pedido_contadores`, `pedido_trabajadores`, `pedido_tareas`, `archivos`, `pedido_comentarios`, `pedido_historial`, `solicitud_comentarios`, `solicitud_historial`, `trabajo_plantillas`, `trabajo_plantilla_tareas`, `pedido_pagos`, `private.internal_user_creation_audit`, `private.internal_user_password_reset_audit`.

Enums finales: `app_role`, `workflow_type`, `solicitud_estado`, `pedido_estado`, `pedido_pago_estado`, `pedido_prioridad`, `pedido_tarea_tipo`, `archivo_visibility`, `pedido_historial_action`, `solicitud_historial_action`.

Storage: bucket privado `godel-files`.

Auth triggers: dos triggers sobre `auth.users`.

## 10. DML Obligatorio

Debe conservarse:

- dos servicios iniciales de catalogo;
- servicio unico `Impresión`;
- bucket privado `godel-files`;
- comments/assertions del contrato si se expresan como DDL/DML de metadata.

Servicios productivos iniciales esperados:

- `Otro` (`encargo`, publico);
- `Impresión` (`impresion`, publico).

Los dos servicios iniciales se insertan en `01_core_schema.sql`, forman parte del contrato productivo inicial y no pertenecen al seed. Sus IDs se generan con `default gen_random_uuid()`; no hay identificadores fijos para servicios. Ninguna capa de aplicacion debe depender de IDs concretos. `Impresión` continua identificandose operativamente por `workflow_type = impresion`, y `Otro` queda como alternativa inicial generica de encargo. `Diseño gráfico`, `Personalización` y `Rotulación` pasan a configuracion operativa posterior desde la administracion de servicios.

## 11. Backfills Descartados

Descartar en base limpia:

- updates para llenar `solicitudes.service_id`;
- updates para llenar `pedidos.service_id`;
- migracion de `solicitudes.service_type`;
- backfills de `workflow_type` desde valores legacy;
- creacion compensatoria de servicios por datos historicos;
- DML QA local;
- cualquier dependencia de UUIDs locales.

## 12. Funciones Finales

Mantener funciones estructurales privadas de timestamps, numeracion, referencias publicas, pagos, sync de servicios, integridad de perfiles/admin, historial automatico y helpers de Storage.

Mantener helpers de autorizacion:

- `current_user_role`;
- `current_user_is_active`;
- `is_admin`;
- `is_supervisor`;
- `is_admin_or_supervisor`;
- `is_assigned_to_pedido`;
- `can_access_pedido`;
- `solicitud_has_accessible_pedido`;
- `can_access_solicitud`;
- `can_manage_pedido_tasks`.

Todas las `SECURITY DEFINER` deben tener `search_path` fijo. Las funciones de Auth Admin deben usar `search_path = ''`.

## 13. Firmas RPC Finales

Firmas publicas finales:

- `actualizar_estado_solicitud(uuid, solicitud_estado)`;
- `crear_cliente_desde_solicitud(uuid)`;
- `convertir_solicitud_a_pedido(uuid, uuid, text, text, pedido_prioridad, date, numeric)`;
- `crear_pedido_manual(uuid, uuid, text, text, pedido_prioridad, date, numeric)`;
- `actualizar_estado_pedido(uuid, pedido_estado)`;
- `actualizar_datos_pedido(uuid, uuid, text, text, pedido_prioridad, date, numeric)`;
- `actualizar_pago_pedido(uuid, numeric, numeric)`;
- `aplicar_plantilla_tareas_pedido(uuid, uuid)`;
- `listar_pedido_comentarios(uuid)`;
- `listar_pedido_historial(uuid)`;
- `listar_solicitud_comentarios(uuid)`;
- `listar_solicitud_historial(uuid)`;
- `consultar_estado_publico(text)`;
- `begin_internal_user_creation_attempt(app_role)`;
- `complete_internal_user_creation_attempt(uuid, text, text, uuid)`;
- `complete_initial_password_change(uuid)`;
- `begin_internal_user_password_reset(uuid, uuid)`;
- `get_internal_user_password_reset_state(uuid)`;
- `complete_internal_user_password_reset(uuid, text, text)`.

## 14. Policies y Grants Finales

Final esperado:

- `anon` solo inserta solicitudes/metadatos publicos controlados, lee catalogo publico y ejecuta tracking/validadores publicos estrictos.
- `authenticated` opera por RLS y RPCs; no recibe insert completo en `perfiles`.
- `service_role` queda reservado para la RPC `complete_initial_password_change`.
- `supabase_auth_admin` solo ejecuta `private.provision_internal_profile_from_auth_user()`.
- Auditorias privadas sin grants directos a roles de app.
- Storage privado sin lectura anonima por policy.

## 15. Auth Admin User Lifecycle

Contrato final:

1. Admin operativo reserva intento con `begin_internal_user_creation_attempt`.
2. App server-only usa Auth Admin para crear user.
3. Trigger Auth provisiona `perfiles` desde `godel_provisioning`.
4. App verifica perfil con cliente normal.
5. App cierra auditoria con `complete_internal_user_creation_attempt`.
6. Usuario nuevo nace `is_active = true`, `must_change_password = true`.
7. Cambio inicial llama Auth normal y luego RPC privilegiada `complete_initial_password_change`.
8. Reset administrativo reserva intento con UUID externo, bloquea perfil objetivo, actualiza Auth Admin y cierra con auditoria; casos inciertos quedan como `attention_required`.

## 16. Hardening Final

06 debe verificar:

- 0 funciones `SECURITY DEFINER` sin `search_path`;
- ninguna firma legacy de RPC;
- `solicitudes.service_type` ausente;
- `service_id` obligatorio en solicitudes y pedidos;
- `tipos_servicio_single_print_service` presente;
- RLS activo en tablas publicas;
- auditorias privadas sin grants directos a app roles;
- bucket `godel-files` privado;
- policies de `storage.objects` presentes;
- triggers Auth presentes;
- grants de `service_role` y `supabase_auth_admin` estrictos;
- ausencia de `perfiles_insert_admin`.

## 17. Riesgos

| Severidad | Riesgo |
| --- | --- |
| HIGH - reproducibilidad local y QA | No existe `supabase/seed.sql`, aunque `config.toml` referencia `./seed.sql`; se creara como `CREAR_SEED_LOCAL_QA` durante implementacion/activacion y no bloquea la baseline estructural. |
| HIGH | Datos QA locales en `tipos_servicio` no deben entrar como DML productivo. |
| HIGH | `docs/PERMISSIONS_MODEL.md` mantiene texto legacy de creacion de usuarios. |
| MEDIUM | Grants nativos de Storage se ven amplios en catalogo; deben evaluarse junto con RLS/policies, sin revocar indiscriminadamente grants nativos ni redefinir internamente el schema administrado `storage`. |
| MEDIUM | Backfills historicos estan mezclados con estado final en migraciones de servicios. |
| MEDIUM | CLI de Supabase requiere permisos fuera del sandbox por telemetria local. |
| LOW | Roadmap/development docs contienen menciones historicas a `service_type`. |

## 18. Estrategia de Implementacion

1. Crear las seis migraciones finales en una rama separada o siguiente fase.
2. No editar historicas hasta que la activacion de consolidacion este aprobada.
3. Copiar estado final, no secuencia incremental.
4. Escribir 01-05 con idempotencia razonable donde aplique.
5. Mantener 06 sin funcionalidad nueva, solo cierre y assertions.
6. Crear `seed.sql` local/QA por decision `CREAR_SEED_LOCAL_QA`, con contenido concreto definido despues de redactar la baseline.
7. Regenerar tipos solo despues de aplicar nueva baseline local.

Seed local/QA:

- se ejecutara despues de las migraciones;
- no contendra servicios iniciales, servicios operativos adicionales ni creacion del bucket;
- solo contendra datos locales/QA idempotentes;
- no contendra credenciales, contrasenas, secretos ni datos reales;
- el bootstrap de usuarios Auth con capacidad de login requiere una estrategia separada;
- no se insertaran directamente usuarios Auth login-capable sin una revision especifica del contrato local de Auth.

## 19. Estrategia de QA

Permitida en esta fase:

- `npx.cmd supabase migration list --local`;
- `npx.cmd supabase db lint --level warning --local`;
- `npm.cmd run diff:check`;
- `npm.cmd run verify`;
- `npm.cmd run audit:security`;
- `npm.cmd run audit:client-supabase`;
- `git diff --check`;
- `git status --short`.

Para la fase de implementacion:

- aplicar baseline en base limpia local cuando se autorice reset;
- comparar catalogo efectivo viejo/nuevo;
- comprobar RPCs por casos validos e invalidos;
- comprobar RLS por `anon`, `authenticated`, admin, supervisor, trabajador;
- comprobar Storage con bucket privado y policies;
- comprobar Auth Admin User Lifecycle con transacciones o entorno QA controlado;
- ejecutar `npx.cmd supabase db lint --level warning --local` y exigir que devuelva `[]`;
- regenerar y comparar `src/types/database.types.ts`.

## Correcciones Obligatorias de db lint

### `private.generate_public_reference()`

- Actualmente produce `control reached end of function without RETURN`.
- No se detectaron callers efectivos.
- Los triggers vigentes llaman a `private.generate_public_reference_candidate()`.
- No debe incorporarse a la nueva baseline salvo que la implementacion descubra un caller real.
- Accion consolidada: `DESCARTAR_HELPER_PRIVADO_NO_USADO`.
- Si finalmente se conserva, debe reescribirse con loop acotado y `raise exception` terminal explicito.

### `private.generate_public_reference_candidate()`

- Debe eliminar la declaracion explicita `v_index integer`.
- El `FOR v_index IN 0..7` crea automaticamente la variable.
- Debe conservar la generacion y el formato actual.
- Accion consolidada: `INTEGRAR_ESTADO_FINAL_CORREGIDO`.

La baseline definitiva no puede aceptar los warnings actuales como estado valido.

## 20. Criterio de Equivalencia

La baseline consolidada se considera equivalente si:

- crea las mismas tablas, columnas, enums, constraints, indices y triggers finales;
- expone las mismas firmas finales de RPC;
- conserva los mismos grants/policies efectivos de proyecto;
- conserva bucket privado y policies de Storage;
- conserva Auth Admin User Lifecycle;
- no conserva objetos legacy;
- no requiere backfills en base limpia;
- no incorpora datos QA;
- no existe `private.generate_public_reference()` si continua sin callers;
- `private.generate_public_reference_candidate()` no genera warnings;
- `npx.cmd supabase db lint --level warning --local` devuelve `[]`;
- los dos servicios iniciales tienen nombres y descripciones exactas, IDs generados por `gen_random_uuid()` y ningun UUID literal de servicio;
- el seed no participa en la definicion del esquema productivo;
- auditorias y `verify` quedan aceptables.

## 21. Archivos que se Crearan en la Siguiente Fase

```text
supabase/migrations/<timestamp>_01_core_schema.sql
supabase/migrations/<timestamp>_02_security_rls_grants.sql
supabase/migrations/<timestamp>_03_business_rpcs.sql
supabase/migrations/<timestamp>_04_storage.sql
supabase/migrations/<timestamp>_05_auth_admin_user_lifecycle.sql
supabase/migrations/<timestamp>_06_final_hardening.sql
```

El timestamp/nombre exacto debe definirse al activar la consolidacion.

## 22. Archivos que se Eliminaran al Activar la Consolidacion

Cuando el Director Tecnico apruebe activar la consolidacion, los 21 archivos historicos actuales seran reemplazables por las seis migraciones finales. En esta fase no se elimina ninguno.

Lista historica completa:

- `20260625000100_01_core_schema.sql`
- `20260625000200_02_security_rls_grants.sql`
- `20260625000300_03_business_rpcs.sql`
- `20260625000400_04_storage.sql`
- `20260625000500_05_final_hardening.sql`
- `20260625000600_06_add_pedido_actualizado_history_action.sql`
- `20260625000700_07_actualizar_datos_pedido_rpc.sql`
- `20260727163202_configurable_service_types_expand.sql`
- `20260728015355_public_service_types_integration.sql`
- `20260728034617_internal_service_types_orders.sql`
- `20260728090000_actualizar_servicio_pedido_rpc.sql`
- `20260728120000_service_types_contract.sql`
- `20260729232826_secure_admin_user_creation_foundation.sql`
- `20260729235400_secure_admin_user_creation_privilege_hardening.sql`
- `20260730013011_secure_admin_user_creation_app_metadata_update_trigger.sql`
- `20260730015353_secure_internal_user_creation_audit_rate_limit.sql`
- `20260730030404_remove_legacy_internal_profile_creation.sql`
- `20260730143435_make_initial_password_completion_idempotent.sql`
- `20260730150845_harden_initial_password_completion_concurrency.sql`
- `20260730165326_secure_internal_user_password_reset.sql`
- `20260730174544_harden_internal_user_password_reset_recovery.sql`

## 23. Elementos que Requieren Decision del Director Tecnico

| Elemento | Estado | Decision |
| --- | --- | --- |
| Auditorias privadas | RESUELTO | `private.internal_user_creation_audit` y `private.internal_user_password_reset_audit` se crean integramente en `05_auth_admin_user_lifecycle.sql`; no se crean parcialmente en 01. |
| Servicios iniciales | RESUELTO | Dos servicios iniciales con nombres y descripciones exactas, IDs generados por `gen_random_uuid()` y DML en 01; `Impresión` se identifica por `workflow_type = impresion` y `Otro` queda como encargo inicial. |
| Seed | RESUELTO_PENDIENTE_DE_CONTENIDO | Se creara `seed.sql` solo para datos QA/locales; el contenido concreto se define despues de redactar la baseline. |
| Activacion | RESUELTO | Redactar temporalmente las seis migraciones fuera de `supabase/migrations`, revisar estaticamente, reemplazar los 21 archivos mediante cambio atomico y ejecutar reset local solo despues de aprobacion explicita. |
| Storage administrado | RESUELTO | Evaluar grants junto con RLS/policies; no redefinir internamente el schema administrado `storage`; 06 verifica bucket privado, policies del proyecto, ausencia de lectura anonima, grants de funciones del proyecto y ausencia de uso general del cliente administrativo. |
| Limpieza documental posterior | PENDIENTE_DOCUMENTAL | Actualizar `PERMISSIONS_MODEL.md` y documentos historicos con drift legacy en una fase documental separada. |
