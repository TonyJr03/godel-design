# PPO-04 — Production Pilot V1

**Estado:** `ACTIVE / NEXT`

**Fecha de apertura:** 2026-09-13

**Despliegue ejecutado:** `NO`

**Roadmap maestro:** [PPO_ROADMAP.md](PPO_ROADMAP.md)

## 1. Objetivo

Production Pilot V1 es el primer uso productivo real de Godel mediante un
rollout controlado. Su objetivo no es alcanzar infraestructura perfecta antes
del primer uso, sino desplegar una versión:

```text
functionally correct
reasonably secure
recoverable enough
observable enough
operable
```

El piloto produce evidencia operativa real para corregir P0/P1 y endurecer el
sistema antes de declararlo `Production Primary`. Abrir PPO-04 no declara que
el VPS, TLS, imágenes, configuración ni despliegue ya estén listos.

## 2. Decisión de arquitectura de release

```text
Juliet / integration host / future CI
        │
        ├── build Godel App image
        └── build Godel Nginx image
                │
                ▼
      verified linux/amd64 release artifacts
                │
                ▼
        registry or secure transfer
                │
                ▼
          Production VPS
                │
                ├── load/pull images
                ├── Supabase self-hosted
                └── Godel runtime
```

```text
Production VPS = RUN RELEASE ARTIFACTS
Production VPS != REQUIRED TO BUILD EVERYTHING FROM SOURCE
```

App y Nginx se construyen en Juliet, un host de integración autorizado o CI
futuro. La salida se verifica como `linux/amd64`, recibe identidades/tags de
release deterministas y se entrega por un registry autorizado o transferencia
segura. El VPS carga o descarga esos artefactos y ejecuta la composición; un
build clean-host completo en el target no es gate del piloto.

El tooling genérico de release queda disponible mediante
`npm run ops:release:build -- --git-commit <full-sha>`. El builder crea un
contexto temporal desde el commit exacto, usa los Dockerfiles dentro de ese
contexto, liga la App a la generación externa activa y `MATCH`, construye ambas
imágenes para `linux/amd64`, inspecciona su identidad y publica atómicamente un
tar, manifest sanitizado y checksum bajo `release-artifacts/git-<short-sha>/`.
La disponibilidad del tooling no declara ejecutado el build productivo ni
aprueba ninguno de los gates siguientes.

## 3. Configuración productiva

R7 es evidencia de rehearsal, no configuración productiva. Producción requiere
una `production-specific external secret generation` nueva y exacta, bajo el
registro protegido existente, que contenga los valores productivos aplicables:

- URLs y origen público;
- credenciales y password de base de datos;
- material JWT/Auth;
- publishable key y secret key;
- credenciales de dashboard;
- demás valores externos requeridos por Supabase y Godel.

Los valores no se documentan ni se incorporan a Git. La generación debe quedar
alineada byte a byte con los env productivos y con cualquier backup asociado.
Antes de publicar o inicializar esa generación, el Godel env debe definir
`GODEL_APP_IMAGE_TAG` y `GODEL_NGINX_IMAGE_TAG` como `git-<12-char-sha>` para el
Git SHA exacto ya seleccionado; el builder rechaza cualquier ausencia o desvío
antes de construir imágenes.
Está prohibido importar R7, editar sus env manualmente y continuar afirmando
`R7 MATCH`. La transición productiva tiene identidad propia y conserva
`NO_IMPLICIT_ROLLBACK_CHAIN`.

## 4. Clasificación de trabajo

Solo `BLOCKER FOR PILOT` impide el primer uso real controlado. `IMPORTANT AFTER
PILOT` y `OPTIONAL HARDENING` conservan trabajo obligatorio o valioso posterior,
pero no retrasan por sí solos la apertura del piloto.

### BLOCKER FOR PILOT

#### Release

- [ ] Construir correctamente la imagen Godel App.
- [ ] Construir correctamente la imagen Godel Nginx.
- [ ] Verificar plataforma `linux/amd64` para ambas.
- [ ] Asignar tags e identidad deterministas ligados a la release y al Git SHA.
- [ ] Inspeccionar los artefactos y ejecutar smoke básico antes de transportarlos.
- [ ] Registrar evidencia sanitizada de build, identidad, transporte y admisión.

#### Configuración productiva

- [ ] Crear una generación externa exclusiva de producción.
- [ ] Validar la alineación exacta de configuración antes del arranque.
- [ ] Confirmar que ningún secreto de rehearsal se reutiliza fingiendo estado
  productivo.
- [ ] Mantener secretos fuera de Git, logs, imágenes y argumentos visibles.

#### VPS

- [ ] Confirmar Linux amd64, Docker Engine y Docker Compose utilizables.
- [ ] Confirmar almacenamiento, memoria y margen operativo suficientes.
- [ ] Establecer administración SSH controlada.
- [ ] Aplicar firewall con exposición mínima.
- [ ] Verificar que PostgreSQL, Supavisor y los servicios internos de Supabase
  no tienen exposición no intencionada.

El readiness provider-neutral de PPO-01E/F se ejecuta coordinado con este gate.
PPO-04 puede preparar release y configuración en paralelo, pero no inicia uso
real hasta obtener un veredicto de infraestructura aceptable.

#### HTTPS y superficie de red

No se permiten credenciales de usuarios reales sobre HTTP público en texto
plano. La topología mínima es:

```text
Internet
    ↓
443 / HTTPS
    ↓
host edge / TLS termination
    ↓
127.0.0.1:8080
    ↓
Godel Nginx
    ├── Next.js
    └── Supabase public API
```

- [ ] Certificado válido, renovación definida y redirección segura a HTTPS.
- [ ] Godel Nginx publicado solo en loopback detrás del edge TLS.
- [ ] PostgreSQL privado.
- [ ] Supavisor privado.
- [ ] Studio privado, salvo administración deliberada por una ruta protegida.
- [ ] Servicios internos de Supabase privados.
- [ ] Superficie del piloto limitada al acceso necesario para el rollout.

La exposición pública general e irrestricta sigue bloqueada hasta PPO-05. El
piloto controlado puede validar `/solicitud` y `/estado` bajo HTTPS, acceso
limitado y supervisión operativa, sin afirmar que el hardening público completo
está cerrado.

#### Backup inicial

Antes de depender del sistema para datos reales:

- [ ] Crear un backup recovery-grade de la generación productiva.
- [ ] Verificar checksums, estado `COMPLETE` y asociación a la generación exacta.
- [ ] Retener al menos una copia fuera del VPS productivo.
- [ ] Registrar ubicación/custodia sin exponer rutas privadas ni material
  protegido.

Este mínimo no cierra PPO-06 ni afirma que ya existen calendario, retención,
RPO/RTO o drills de desastre productivos.

#### Smoke productivo

El smoke real debe ejecutarse sobre HTTPS y cubrir como mínimo:

- [ ] `health/live`.
- [ ] `health/ready`.
- [ ] login.
- [ ] roles y restricciones principales.
- [ ] dashboard.
- [ ] cliente.
- [ ] solicitud pública.
- [ ] conversión de solicitud.
- [ ] pedido.
- [ ] tareas.
- [ ] carga de archivo.
- [ ] descarga de archivo.
- [ ] pago/estado.
- [ ] tracking público.

La aceptación registra actor, resultado y evidencia sanitizada. Un fallo P0/P1
impide ampliar el rollout y activa el procedimiento de corrección o reversión.

### IMPORTANT AFTER PILOT

#### PPO-05 — seguridad pública completa

- controles antiabuso y rate limiting;
- revisión profunda de `/solicitud`, `/estado` y demás superficies públicas;
- hardening de uploads y endpoints públicos;
- revisión de exposición y política de tráfico.

#### PPO-06 — backup y disaster recovery productivo

- calendario y automatización;
- retención y política off-host;
- restore drills;
- RPO/RTO;
- procedimiento de desastre y responsabilidades.

#### PPO-07 — observabilidad y operación

- monitoreo continuo;
- centralización de logs;
- métricas y alertas;
- workflow de incidentes;
- procedimientos operativos y escalación.

Estos workstreams se mantienen separados: la copia inicial y el smoke del
piloto son gates mínimos, no sustitutos de su cierre posterior.

### OPTIONAL HARDENING

- Completar SH-05.3 y SH-05.4 como portabilidad post-piloto.
- Ligar explícitamente en el builder clean-host de SH-05 los bytes del
  Dockerfile verificado en el contexto Git exacto. El builder normal de release
  ya aplica esta invariante, sin modificar ni cerrar el tooling de SH-05.
- Eliminar o empaquetar la dependencia externa del frontend Dockerfile para
  builds totalmente offline en el target.
- Completar el build Godel target-side y la aceptación funcional clean-host.
- Evaluar mirrors, firma/attestation de artefactos y mayor automatización de CI
  cuando el riesgo o el volumen operativo lo justifiquen.

## 5. Secuencia de ejecución

```text
1. Seleccionar release Git exacta
2. Definir origen y configuración productiva
3. Crear y validar la generación externa productiva activa y MATCH
4. Construir App/Nginx linux/amd64 ligados a ese Git y a esa generación
5. Verificar y empaquetar la release
6. Transportar y admitir los artefactos verificados
7. Aprobar readiness del VPS, firewall y TLS
8. Levantar el runtime Supabase + Godel sin build en el VPS
9. Ejecutar health técnico
10. Crear un backup recovery-grade de la generación productiva
11. Verificar el backup y conservar una copia off-host
12. Ejecutar el smoke funcional productivo completo
13. Autorizar un grupo pequeño para uso real
14. Observar, registrar y corregir P0/P1; ampliar o revertir según evidencia
```

No se salta el backup inicial por haber aprobado SH-04, ni se reutiliza R7 por
haber producido evidencia clean-host.

## 6. Rollout y continuidad del negocio

```text
Production Pilot V1
        ↓
small initial real use
        ↓
observe
        ↓
fix P0/P1
        ↓
stable operation
        ↓
Production Primary
```

El acceso inicial se limita a un conjunto pequeño y conocido de usuarios y
operaciones reales. Durante el piloto la empresa puede conservar temporalmente
su proceso operativo anterior como fallback. Es una medida de continuidad del
negocio, no una dependencia arquitectónica de Godel.

## 7. Criterios de pausa, reversión y promoción

Se pausa la ampliación ante pérdida de datos, exposición de secretos, acceso no
autorizado, HTTP público con credenciales, backup inicial no verificable,
readiness inestable o un flujo core P0/P1 fallido. Se conserva evidencia y se
sigue el procedimiento operativo aplicable; no se improvisa un rollback de
datos ni una cadena implícita de generaciones.

El piloto puede promoverse a `Production Primary` cuando los blockers siguen
aprobados, los smokes se mantienen, los P0/P1 están resueltos y la Dirección
Técnica acepta la evidencia de operación estable. Esa promoción no cierra por
sí sola PPO-05, PPO-06, PPO-07 ni la deuda post-piloto SH-05.

## 8. Entregables de cierre de PPO-04

- inventario de release e identidades App/Nginx;
- reporte de readiness del VPS y superficie expuesta;
- identidad de generación productiva, sin valores secretos;
- evidencia de TLS y aislamiento de servicios internos;
- resultados de health y smoke productivo;
- identidad y verificación del backup inicial y su copia off-host;
- bitácora sanitizada del rollout, incidencias P0/P1 y decisión final;
- handoff explícito a PPO-05, PPO-06 y PPO-07.

Hasta que esos entregables sean aceptados:

```text
PPO-04 = ACTIVE / NEXT
PRODUCTION DEPLOYMENT = NOT EXECUTED
PRODUCTION PRIMARY = NOT DECLARED
```
