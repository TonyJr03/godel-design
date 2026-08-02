# PPO-00 — Cierre de baseline local de preproducción

## Metadatos

- Fecha de cierre: `2026-08-01`
- Rama: `preprod/ppo-00-baseline`
- Commit funcional: `f80ee5ba2b984b9ef3690820709725c95918b75b`
- Estado: `Cerrada`

## Propósito

PPO-00 estableció una baseline local reproducible y segura para comenzar las siguientes actividades de preproducción del proyecto Godel Diseño.

## Alcance Completado

- Puertos locales canónicos `543xx` para Supabase local.
- Reconstrucción limpia desde las seis migraciones consolidadas.
- Alineación del QA de usuarios con Supabase Auth Admin.
- Bootstrap local de identidades QA.
- Bootstrap local de perfiles QA.
- Roles QA operativos para admin, supervisor y trabajador.
- Login verificado para los tres roles.
- Bootstrap local idempotente.
- Guardas contra ejecución remota del bootstrap.

## Evidencia Real

- `npx.cmd supabase status`: confirmó Supabase local activo en puertos canónicos `54321`, `54322`, `54323` y `54324`.
- `npx.cmd supabase db reset`: OK. Aplicó las seis migraciones consolidadas y `supabase/seed.sql` en la rama `preprod/ppo-00-baseline`.
- `npm.cmd run qa:bootstrap`: OK. Confirmó entorno local, preparación de Administrador QA, Supervisor QA y Trabajador QA, `QA_PROFILES_OK`, login verificado para los tres roles y bootstrap local completado.
- `npm.cmd run diff:check`: OK.
- `npm.cmd run lint`: OK.
- `npm.cmd run build`: OK. Next.js compiló correctamente, TypeScript finalizó sin errores y se generaron 22 páginas estáticas.
- `npx.cmd playwright test tests/e2e/usuarios.spec.ts --project=chromium --workers=1`: `4 passed`, `0 failed`, `2 skipped`.

Los dos skips del spec de usuarios dependen de tener al menos 51 usuarios visibles. En esta validación local se reportó `totalCount=3`, por lo que los skips son esperados y no forman parte del cierre de PPO-00.

## Decisión de Alcance

La auditoría, consolidación, ownership y cleanup completo de la suite E2E quedan diferidos deliberadamente porque no forman parte de la ruta crítica de PPO-00.

Ese trabajo no fue eliminado ni abandonado. Se conserva para una iniciativa posterior, separada del cierre de esta baseline local.

## Trabajo Preservado

Rama:

```text
archive/ppo-00-e2e-consolidation-wip
```

Commit:

```text
29b5e99e58f94b2906a5771fc2aa45e76085e917
```

Esta rama conserva la auditoría y experimentación E2E realizada para una consolidación posterior.

## Trabajo Futuro

Iniciativa futura:

```text
PPO-QA-01 — Consolidación, ownership y aislamiento de la suite E2E
```

Alcance previsto:

- Ownership por corrida.
- Cleanup seguro.
- Consolidación de specs.
- Eliminación de dependencias accidentales.
- Tratamiento coordinado de PostgreSQL y Storage.
- Control de residuos.
- Revisión de skips dependientes de volumen.

PPO-QA-01 no bloquea el inicio de PPO-01, pero deberá resolverse antes del cierre definitivo de la puesta en producción.

## Conclusión Formal

PPO-00 queda cerrada.

El proyecto puede continuar con la definición y ejecución de PPO-01.
