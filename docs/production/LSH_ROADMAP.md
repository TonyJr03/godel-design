# LSH — Lightweight Self-Hosted

**Estado:** `PLANNED / NOT STARTED`

```text
LSH = PLANNED / NOT STARTED
```

**Roadmap maestro:** [PPO_ROADMAP.md](PPO_ROADMAP.md)

## 1. Gobernanza

LSH es un workstream futuro de investigación subordinado a PPO. No está activo,
no cambia funcionalidad del producto y no es una continuación fraudulenta ni
un cierre alternativo de SH-05.

Comenzará después de que el Managed Free Production Pilot produzca medidas
reales. Reutilizará evidencia y tooling de SH cuando resulte aplicable, pero
cada compatibilidad debe demostrarse para el perfil ligero. Su objetivo es
reducir el footprint de runtime antes de considerar nuevamente una producción
self-hosted portable.

## 2. Secuencia de investigación

```text
actual Godel dependency inventory
↓
minimal Supabase service graph
↓
Supabase Slim prototype
↓
resource measurements
↓
decision gate
```

| Bloque | Nombre | Estado |
| --- | --- | --- |
| LSH-00 | Actual Usage & Dependency Inventory | `NOT STARTED` |
| LSH-01 | Minimal Supabase Service Graph | `NOT STARTED` |
| LSH-02 | Supabase Slim Prototype | `NOT STARTED` |
| LSH-03 | Resource Benchmark | `NOT STARTED` |
| LSH-04 | Architecture Decision Gate | `NOT STARTED` |

## 3. LSH-00 — Actual Usage & Dependency Inventory

Usará las medidas de PPO-04M.7 para inventariar dependencias reales de Godel:
PostgreSQL, PostgREST, Auth, Storage, TUS, signed uploads, hooks/triggers,
gateway y demás servicios efectivamente consumidos. Separará necesidad
demostrada de conveniencia o componentes heredados del bundle completo.

No se diseñará un runtime alternativo antes de este inventario.

## 4. LSH-01 — Minimal Supabase Service Graph

Definirá el grafo mínimo de servicios y dependencias transitivas requerido para
preservar los contratos actuales de aplicación, seguridad y datos. Documentará
qué puede retirarse, qué debe conservarse y qué requiere sustitución, sin
alterar el producto.

## 5. LSH-02 — Supabase Slim Prototype

Construirá un prototipo aislado del grafo mínimo. No será producción ni migrará
datos reales. Deberá conservar las fronteras necesarias de Auth, PostgreSQL,
PostgREST, Storage/TUS, RLS y RPC antes de considerarse candidato.

## 6. LSH-03 — Resource Benchmark

Medirá consumo idle y bajo cargas representativas, estabilidad, capacidad de
recuperación y margen operativo en tres perfiles:

```text
2 GB target
1 GB target
512 MB experimental only
```

No se presume que ninguno funcionará. El perfil de 512 MB es exclusivamente
experimental y no constituye objetivo productivo.

## 7. LSH-04 — Architecture Decision Gate

Comparará evidencia funcional, seguridad, mantenibilidad, consumo, operación,
backup/recovery y coste. Producirá una decisión explícita entre las ramas A y B;
no se inicia packaging productivo antes de ese gate.

## 8. Rama A — Supabase Slim aceptable

Si Supabase Slim satisface los objetivos y márgenes aprobados:

| Bloque | Nombre | Propósito |
| --- | --- | --- |
| LSH-05 | Production Slim Profile | Congelar el grafo y configuración productiva ligera. |
| LSH-06 | Portable Packaging | Empaquetar runtime y artefactos reproducibles. |
| LSH-07 | Backup / Restore / Secrets | Definir y probar protección portable del estado. |
| LSH-08 | Clean Host Deployment | Reconstruir en un host limpio compatible. |
| LSH-09 | Final Acceptance | Ejecutar aceptación técnica y funcional final. |

- **LSH-05** congela el perfil productivo solo después de un gate favorable.
- **LSH-06** liga código, runtime y configuración externa a un paquete portable.
- **LSH-07** adapta y demuestra backup, restore y secretos para el perfil Slim.
- **LSH-08** reconstruye el paquete admitido sobre un host limpio compatible.
- **LSH-09** exige health, recovery y aceptación funcional antes de cualquier
  declaración productiva.

Meta conceptual:

```text
release / repository
→ external config
→ deploy
→ restore/import
→ health
→ functional acceptance
```

Esta rama podrá reutilizar Docker, release, backup/restore, secrets generation
y tooling clean-host de SH, sujeto a adaptación y QA específicos.

## 9. Rama B — Supabase Slim demasiado pesado

El fallback arquitectónico oficial será:

```text
PostgreSQL
+
PostgREST
+
Auth propio
+
Storage propio
```

Cuando sea técnicamente viable, se buscará preservar:

- PostgreSQL;
- schema;
- constraints;
- functions;
- triggers;
- lógica de negocio transaccional;
- conceptos/policies RLS que sean portables.

Se reemplazarán:

- Supabase Auth;
- Supabase Storage;
- gateway y glue de runtime de Supabase;
- APIs específicas de Supabase que no sean portables.

LSH no diseña todavía este backend, no selecciona librería Auth ni solución de
Storage y no autoriza migraciones.

## 10. Relación con SH-05 y PPO-10

SH-05 conserva su estado `PAUSED / INCOMPLETE`; su evidencia no se renombra ni
se atribuye a LSH. LSH formula una pregunta nueva: si el runtime puede reducirse
lo suficiente antes de reanudar una ruta self-hosted portable.

PPO-10 conserva la gobernanza de una migración futura de infraestructura. Para
evitar duplicación, LSH absorbe la investigación, selección, prototipo y
aceptación técnica de la arquitectura ligera; PPO-10 solo se activaría después
de LSH-04/LSH-09 para gobernar una migración productiva autorizada hacia el
destino elegido. PPO-10 no repite los bloques LSH ni está activo actualmente.
