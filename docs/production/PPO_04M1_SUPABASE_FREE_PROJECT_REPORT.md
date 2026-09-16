# PPO-04M.1 — Supabase Free Production Project Report

**Estado:** `CLOSED / APPROVED`

**Fecha de aceptación:** 2026-09-16

**Rama:** `ops/managed-free-production-pilot`

**Baseline Git verificada:** `e40866d85fee5adaf36588ff4eea2d21024b7242`

**Despliegue productivo:** `NOT EXECUTED`

## 1. Scope y baseline

PPO-04M.1 acepta la existencia y configuración inicial del proyecto Supabase
Managed Free que servirá como entorno productivo/piloto de Godel Diseño. Esta
fase solo ejecutó comprobaciones locales y probes HTTPS `GET` sanitizados.

No se enlazó el Supabase CLI, no se abrió conexión PostgreSQL directa, no se
aplicó SQL y no se modificó estado remoto. La baseline 01–06 continúa congelada
y sin aplicar:

1. `20260811131824_01_core_schema.sql`
2. `20260811131825_02_security_rls_grants.sql`
3. `20260811131826_03_business_rpcs.sql`
4. `20260811131827_04_storage.sql`
5. `20260811131828_05_auth_admin_user_lifecycle.sql`
6. `20260811131829_06_final_hardening.sql`

```text
BASELINE 01–06 = FROZEN
```

## 2. Estado del proyecto

```text
projectExists = true
projectReachable = true
projectProvisionedWithGodelBaseline = false
productionDeployment = NOT EXECUTED
```

La URL configurada es HTTPS y Auth, PostgREST y Storage respondieron desde el
proyecto Managed. No se registra project ref, hostname ni URL completa.

## 3. Región

Dirección Técnica declaró y aceptó manualmente:

```text
Region = East US (North Virginia)
Region code = us-east-1
regionAccepted = true
```

La región no se obtiene de los endpoints públicos usados en esta fase. La
documentación oficial indica que un proyecto queda vinculado a su región a
nivel de infraestructura; cambiarla implica crear otro proyecto y migrar:
[Change Project Region](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z).

## 4. Plan

Dirección Técnica confirmó manualmente que el proyecto pertenece a una
organización **Free Plan**:

```text
freePlan = true
planEvidence = manually verified by Technical Direction
```

El plan no puede demostrarse con la publishable key ni con los endpoints
públicos auditados. No se usó Management API ni personal access token. La
referencia externa vigente es
[About billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase).

## 5. Separación de ambientes

Dirección Técnica declaró que este es un proyecto nuevo y separado del entorno
de desarrollo y de cualquier proyecto histórico de pruebas:

```text
managedPilotProjectSeparate = true
developmentProjectReused = false
historicalSpikeProjectReused = false
```

La configuración se conserva exclusivamente en `.env.managed.local`, fuera de
Git. No se creó link state local ni se sobrescribió estado de otro proyecto.

## 6. Contrato de keys

La inspección local se limitó a presencia, prefijo y desigualdad, sin imprimir
valores ni fragmentos:

| Variable | Presencia | Generación | Uso |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `PRESENT` | URL HTTPS válida | Origen público Managed |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `PRESENT` | `sb_publishable_…` / current | Browser, Auth health, PostgREST y Storage con RLS |
| `SUPABASE_SECRET_KEY` | `PRESENT` | `sb_secret_…` / current | Futuro adaptador Auth Admin server-only |
| `SUPABASE_SERVER_URL` | `ABSENT_OR_EMPTY` | No requerida | Vercel usará el URL público |
| `SUPABASE_SERVICE_ROLE_KEY` | `ABSENT_OR_EMPTY` | Legacy no requerida | No configurar ni consumir |

```text
publishableKeyGeneration = current
secretKeyGeneration = current
legacyServiceRoleRequired = false
managedKeysDistinct = true
```

Supabase documenta publishable/secret como las keys actuales y permite su
coexistencia con legacy sin obligar a usar `anon`/`service_role`:
[API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## 7. Reachability de Auth

Probe ejecutado con publishable key:

```text
GET /auth/v1/health
managedAuthHealth = true
httpStatus = 200
```

No se envió secret key, service role ni bearer token. No se registró el cuerpo,
URL completa o headers sensibles.

## 8. Reachability de PostgREST

```text
GET /rest/v1/
managedPostgrestReachable = true
httpStatus = 401
```

La raíz OpenAPI requiere credenciales elevadas y rechaza una publishable key;
la respuesta HTTP demuestra que gateway/PostgREST están alcanzables, no un
fallo de disponibilidad. Un segundo request a una relación representativa
recibió la respuesta esperada de relación inexistente descrita en la sección
11. No se usó secret key para forzar acceso.

## 9. Reachability de Storage

```text
GET /storage/v1/status
managedStorageReachable = true
httpStatus = 200
```

No se creó ni enumeró ningún bucket, no se solicitaron URLs firmadas y no se
subieron objetos.

## 10. Auth settings declarados/verificados

`GET /auth/v1/settings` respondió `200`. Se analizaron únicamente tres
booleanos públicos:

| Setting | Resultado | Evidencia |
| --- | --- | --- |
| Email/password | `ENABLED` | `external.email = true` |
| Public signup | `DISABLED` | `disable_signup = true` |
| Anonymous sign-ins | `DISABLED` | `external.anonymous_users = false` |

```text
authSettingsAccepted = true
```

No se intentó signup, no se crearon usuarios y no se modificaron settings.
M.2 validará Auth lifecycle después del provisioning y M.4 comprobará login y
comportamiento por roles. La semántica vigente de signup/anonymous se documenta
en [Supabase CLI config](https://supabase.com/docs/guides/local-development/cli/config)
y [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous).

## 11. Estado vacío / no provisionado

Se consultó por PostgREST, con publishable key, una tabla Godel representativa:

```text
baselineRepresentativeTable = perfiles
baselineProbeHttpStatus = 404
baselineRepresentativeTableAbsent = true
baselineNotApplied = true
```

La ausencia de `perfiles`, primera tabla de negocio de la baseline, confirma
que las migraciones Godel no están aplicadas y que no existen datos productivos
Godel bajo ese modelo. Dirección Técnica declaró además que el proyecto fue
creado vacío, sin usuarios ni datos productivos:

```text
productionDataAbsent = true
productionDataEvidence = baseline probe + Technical Direction declaration
```

Los schemas estándar `auth`, `storage`, `public` y `extensions` son parte normal
de Supabase y no contradicen este resultado. No se usó la secret key para
enumerar usuarios, tablas o objetos.

## 12. Seguridad de secretos

- `.env.managed.local` existe y `git check-ignore` confirma que está ignorado.
- Solo se emitieron nombres, presencia, prefijos booleanos y estados HTTP.
- No se imprimieron URL, project ref, keys, contraseña DB, JWT, connection
  string, access token, signed URL ni email.
- La secret key no participó en ningún request remoto.
- La contraseña PostgreSQL permanece bajo custodia externa de Dirección
  Técnica; M.1 no la necesita ni la incorpora al env local.

```text
secretsNotExposed = true
```

## 13. Constraints Free relevantes

- Los límites de DB, Storage, egress y demás cuotas son externos y deben
  revalidarse antes del rollout; no se codifican como constantes de Godel.
- Supabase puede pausar proyectos Free con baja actividad. No se implementa
  keep-alive ni cron artificial. Referencia:
  [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
- Capacidad y consumo se monitorizarán durante el piloto; restricciones por
  cuota pueden afectar al servicio.
- Supabase no será la única copia confiable. La documentación de producción
  vigente indica que los backups de DB del plan Free no se descargan como los
  de planes pagados; PPO-04M.5 conserva el gate de backup externo. Referencia:
  [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
- No se congelan en este reporte cifras comerciales: la fuente vigente debe
  reconsultarse en [Pricing](https://supabase.com/pricing) antes del rollout.

## 14. Operaciones expresamente no realizadas

No se ejecutó:

- `supabase link`, `db push`, `migration up`, `migration repair` o `db reset`;
- `psql` remoto, SQL Editor automation, seed o migración 01–06;
- creación de bucket, archivo, tabla, usuario, identidad QA o dato de negocio;
- Management API, cambio de plan/región/Auth o rotación/creación de keys;
- probe remoto con secret key o legacy service role;
- deployment Vercel, build o E2E;
- cambio de código, migraciones, tests, Docker, Compose o dependencias.

Operaciones remotas realizadas: cinco requests HTTPS `GET` read-only y
sanitizados a Auth health, Auth settings, raíz PostgREST, relación
representativa inexistente y Storage status.

El `supabase status` local intentado por el workflow de QA no llegó a consultar
el runtime: el sandbox impidió escribir el archivo de telemetría del CLI. No se
forzó ni se elevó porque M.1 no necesita el stack local y su salida podría
mostrar credenciales locales innecesarias.

## 15. Handoff M.2

PPO-04M.2 queda `ACTIVE / NEXT` para **Database / Auth / Storage
Provisioning**. Deberá:

1. decidir y documentar el canal seguro de provisioning sin exponer la
   contraseña PostgreSQL ni introducir link state accidental;
2. aplicar exactamente 01–06, una vez y en orden, sin seed productivo;
3. comprobar assertions, schemas, tablas, tipos, triggers, RLS, grants y RPCs;
4. verificar Auth Admin lifecycle con el cliente autorizado;
5. verificar bucket privado `godel-files`, policies, TUS, signed upload y
   staged/committed lifecycle;
6. demostrar casos válidos e inválidos, roles `anon`/`authenticated` y rollback
   de cualquier dato QA temporal;
7. detenerse ante cualquier divergencia en vez de editar la baseline congelada.

M.1 no ejecutó pruebas de migración, RLS, grants ni atomicidad RPC porque la
baseline debe permanecer ausente. No hubo transacción SQL y rollback no aplica.

## 16. Verdict final

Los criterios de cierre quedan satisfechos mediante probes públicos
sanitizados y las declaraciones manuales de Dirección Técnica para propiedades
no observables sin Management API:

```text
projectExists = true
freePlan = true
regionAccepted = true
managedAuthReachable = true
managedPostgrestReachable = true
managedStorageReachable = true
publishableKeyPresent = true
secretKeyPresent = true
currentApiKeyGeneration = true
authSettingsAccepted = true
baselineNotApplied = true
productionDataAbsent = true
secretsNotExposed = true
```

```text
PPO-04M.0 = CLOSED / APPROVED
PPO-04M.1 = CLOSED / APPROVED
PPO-04M.2 = ACTIVE / NEXT
PPO-04M.3–PPO-04M.7 = NOT STARTED
PRODUCTION DEPLOYMENT = NOT EXECUTED
```

Esta aprobación acepta el proyecto vacío; no afirma que DB/Auth/Storage Godel
estén provisionados ni que exista un deployment productivo.
