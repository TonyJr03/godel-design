# PPO-04 — Cierre del camino Self-Hosted VPS

**Estado del camino:** `CLOSED / SUPERSEDED`

**Despliegue:** `NOT EXECUTED`

**Fecha de decisión:** 2026-09-16

**Baseline Git de la decisión:**
`abe2e9d3ed0f74b84119e6305ae8dcfbaaa102a7`

```text
STATUS = CLOSED / SUPERSEDED
DEPLOYMENT = NOT EXECUTED
```

**Nuevo plan gobernante:**
[PPO-04 — Managed Free Production Pilot](PPO_04_MANAGED_FREE_PILOT_PLAN.md)

## 1. Naturaleza del cierre

Este documento cierra el camino arquitectónico de PPO-04 que proponía una VPS,
Supabase Self-Hosted completo, Docker y Godel App/Nginx para el primer piloto.
No constituye aprobación de despliegue, aceptación productiva ni cierre de
SH-05.

La ruta fue superseded antes de ejecutarse por viabilidad económica y
presupuesto actual. Godel Diseño es actualmente un proyecto personal y no
comercial, y el coste del stack completo no resulta sostenible para su primer
uso real. Esta decisión no declara un fallo técnico de Supabase Self-Hosted.

## 2. Trabajo técnico completado que se conserva

La evidencia aprobada de SH-01 a SH-04 conserva íntegramente su valor. Incluye:

- baseline oficial de seis migraciones, Auth y Storage;
- integración App/Nginx/Supabase self-hosted;
- QA funcional production-like de negocio, roles, Storage y TUS;
- backup/restore, secretos, update/rollback y runbook técnico;
- contratos y tooling de portabilidad desarrollados en SH-05.0–SH-05.2;
- evidencia parcial y límites reales del rehearsal SH-05.3.

También queda disponible y aprobado el tooling genérico de producción para la
siguiente cadena:

```text
Git exacto
→ App/Nginx linux/amd64
→ deterministic tags
→ verified artifacts
→ sanitized manifest
→ checksum
```

Es una capacidad reutilizable para investigación y empaquetado self-hosted
futuro. Su existencia no prueba que se haya producido una release productiva.

## 3. Trabajo no ejecutado

No se realizó ninguna de las siguientes operaciones:

- build productivo real;
- configuración productiva para VPS;
- generación externa productiva;
- contratación o provisioning de una VPS;
- configuración de TLS productivo;
- despliegue de un runtime productivo;
- backup productivo inicial;
- smoke productivo real.

Estos elementos son trabajo no ejecutado de una ruta superseded, no fallos
técnicos ni gates aprobados. Los checkboxes del plan histórico permanecen
pendientes como evidencia fiel.

## 4. Elementos pendientes y relación con SH

El workstream full Supabase Self-Hosted queda congelado como arquitectura de
referencia:

```text
SH-01 = CLOSED / APPROVED
SH-02 = CLOSED / APPROVED
SH-03 = CLOSED / APPROVED
SH-04 = CLOSED / APPROVED

SH-05 = PAUSED / INCOMPLETE
SH-05.0–SH-05.2 = conservan sus cierres reales
SH-05.3 = PARTIALLY PROVEN / DEFERRED
SH-05.4 = DEFERRED
```

Permanecen pendientes en SH-05 el build Godel target-side completo, la
resolución de la dependencia del frontend Dockerfile externo, la autoridad
exacta del Dockerfile pasado a Buildx, la aceptación funcional/Playwright, el
cleanup final y el cierre agregado. El pivot económico no completa ni cierra
estos puntos.

## 5. Destino de las capacidades desarrolladas

Docker, release, backup, restore, secrets generation y portabilidad quedan
conservados. No son gates del Managed Free Pilot, pero pueden reutilizarse,
adaptarse o servir como evidencia en el futuro workstream
[LSH — Lightweight Self-Hosted](LSH_ROADMAP.md). La compatibilidad concreta
debe demostrarse en ese contexto; no se presume automáticamente.

## 6. Handoff inmediato a Managed Free

El primer destino real pasa a ser:

```text
Vercel Hobby
+
Supabase Managed Free
```

El objetivo es un primer despliegue real funcional con coste de infraestructura
de 0 USD, sujeto a las condiciones y límites vigentes de los proveedores. El
nuevo plan debe crear y aceptar su propia evidencia productiva; PPO-02 y PPO-03
solo aportan antecedentes de compatibilidad managed.

## 7. Handoff futuro a LSH

Después del piloto y de medir uso real, LSH investigará un grafo mínimo de
servicios, un prototipo Supabase Slim y su consumo de recursos. Solo después de
ese decision gate podrá elegirse entre un perfil Slim portable o el fallback
conceptual PostgreSQL + PostgREST + Auth propio + Storage propio.

El cierre de esta ruta VPS no anticipa el resultado de LSH ni autoriza un nuevo
despliegue self-hosted.
