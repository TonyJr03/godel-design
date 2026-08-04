# PPO — Preproducción y Puesta en Operación

## Metadatos

- Proyecto: Godel Diseño
- Estado: Activo
- Fecha de creación: 2026-07-21
- Última revisión: 2026-08-04
- Responsable técnico: Dirección Técnica de Godel Diseño
- Arquitectura y supervisión: Arquitectura Senior / Orquestación Técnica
- Implementación: Agente Codex en VS Code

## Propósito

PPO lleva el sistema desde el MVP interno funcional hasta una operación real
controlada, segura, reproducible, recuperable, observable y validada por
usuarios.

La iniciativa diferencia tres momentos operativos:

1. Preparación en la laptop de desarrollo, donde se construirán y validarán las
   bases técnicas antes de moverlas a otro host.
2. Operación provisional en la máquina de Godel Diseño, conviviendo con sus
   demás aplicaciones y bajo condiciones controladas.
3. Migración futura a infraestructura estable, conservando una estrategia de
   recuperación y soporte.

## Decisiones arquitectónicas confirmadas

- La iniciativa se denomina PPO.
- Nginx será el proxy inverso.
- Caddy no forma parte de la arquitectura.
- Los hosts iniciales utilizan Windows.
- Docker Desktop utiliza WSL2.
- Se usarán contenedores Linux.
- La máquina de la empresa no es un servidor dedicado.
- La infraestructura debe quedar aislada del resto de aplicaciones del host.
- La composición se construirá primero en la laptop.
- La misma base se trasladará después a la máquina de la empresa.
- Supabase administrado continuará inicialmente como backend.
- Vercel Hobby se utilizará para previews, demostración y preproducción controlada.
- Cloudflare Tunnel se evaluará para la exposición segura de la operación provisional.
- Los archivos serán privados.
- El contenido de archivos no atravesará Server Actions de Next.js.
- El objetivo futuro contempla hasta diez archivos por operación.
- El límite inicialmente planteado es 20 MB por archivo.
- ZIP y RAR están dentro del alcance futuro del rediseño de archivos.
- OVHcloud Canadá continúa como candidato para la producción futura.
- Después de la migración, la máquina de la empresa podrá actuar como soporte
  de backup y recuperación.

Estas decisiones registran dirección arquitectónica. Las que pertenecen a fases
posteriores no se declaran implementadas en este roadmap.

## Estado de fases

| Fase      | Nombre                                      | Estado    |
| --------- | ------------------------------------------- | --------- |
| PPO-00    | Baseline local y formalización inicial      | Cerrada   |
| PPO-01    | Auditoría de infraestructura y conectividad | Activa    |
| PPO-02    | Base contenerizada reproducible             | Activa — alcance local en `development-laptop` |
| PPO-03    | Rediseño de cargas y almacenamiento         | Pendiente |
| PPO-04    | Despliegue provisional en la empresa        | Pendiente |
| PPO-05    | Seguridad pública                           | Pendiente |
| PPO-06    | Backups y recuperación                      | Pendiente |
| PPO-07    | Observabilidad y operación                  | Pendiente |
| PPO-08    | UAT y puesta en operación                   | Pendiente |
| PPO-09    | Estabilización                              | Pendiente |
| PPO-10    | Migración futura a infraestructura estable  | Pendiente |
| PPO-QA-01 | Consolidación y aislamiento de la suite E2E | Diferida  |

PPO-QA-01 no bloquea PPO-01, conserva el trabajo archivado y deberá resolverse
antes del cierre definitivo de la puesta en producción.

## PPO-00

PPO-00 queda cerrada con una baseline local reproducible: puertos canónicos para
Supabase local, reconstrucción limpia desde las seis migraciones consolidadas,
bootstrap local de identidades y perfiles QA, login verificado por rol y
validaciones de cierre documentadas.

El detalle aprobado vive en [PPO-00 - Cierre de baseline local de preproducción](../preproduction/PPO_00_CLOSURE.md).

## PPO-01 revisada

Definición oficial:

> Determinar si la laptop de desarrollo y la máquina de Godel Diseño poseen las capacidades, prerrequisitos y condiciones operativas necesarias para construir y ejecutar posteriormente la infraestructura contenerizada prevista por PPO.

PPO-01 debe responder:

1. Si la laptop puede construir y validar la composición.
2. Si la máquina de la empresa puede alojar provisionalmente el sistema junto
   con sus demás aplicaciones.
3. Qué límites iniciales de CPU, memoria y almacenamiento deberían evaluarse.
4. Si la conectividad es suficiente y estable.
5. Qué estrategia de almacenamiento merece pasar a pruebas reales posteriores.

PPO-01 no construye la composición, no instala Nginx, no configura Cloudflare
Tunnel, no modifica el flujo de archivos, no despliega el sistema en la empresa,
no decide definitivamente el almacenamiento y no prueba todavía el dominio
productivo.

La ejecución real de la composición pertenece a PPO-02.

Estado interno de PPO-01:

| Bloque    | Estado |
| --------- | ------ |
| PPO-01A.1 | Cerrada |
| PPO-01A.2 | Cerrada |
| PPO-01B   | Cerrada — `development-laptop` Apta con condiciones |
| PPO-01C   | Diferida temporalmente |
| PPO-01D   | Pendiente, bloqueada por PPO-01C |

`development-laptop` ya demostró capacidad suficiente para construir y validar
la composición contenerizada prevista para PPO-02: WSL2 y Docker con
contenedores Linux están operativos, el build terminó correctamente y Supabase
local coexistió con Next.js durante las mediciones controladas.

La conectividad desde el contexto físico declarado `cuba` y con VPN confirmada
manualmente como desconectada fue demostrada para los destinos ejecutados de
GitHub, Vercel y Cloudflare. Las transferencias sintéticas de 20 MiB se
completaron en descarga y carga. Supabase administrado permanece pendiente
porque el proyecto administrado no estaba configurado.

`company-host` todavía no ha sido auditado y PPO-01 no está cerrada.

Por decisión expresa de Dirección Técnica, PPO-02 queda autorizada en paralelo
para construcción y validación local en `development-laptop`. Este inicio no
implica cierre de PPO-01, no implica aprobación de `company-host` y no implica
despliegue productivo ni despliegue en la empresa.

## PPO-02 a PPO-10

- PPO-02: definirá Dockerfile, Compose, Nginx, redes, healthchecks y criterios
  de reproducibilidad. PPO-02A.3 ya formalizó la separación de endpoints
  Supabase entre navegador y servidor para resolver el Caso B local. El contrato
  activo vive en
  [PPO-02 - Plan de contenerización](PPO_02_CONTAINERIZATION_PLAN.md).
- PPO-03: rediseñará sesiones de carga, transferencia directa, límites,
  formatos, cuarentena y almacenamiento.
- PPO-04: cubrirá despliegue provisional, Cloudflare Tunnel, dominio y
  recuperación del host.
- PPO-05: abordará antiabuso, rate limiting, seguridad pública y protección de
  archivos.
- PPO-06: definirá backups y restauraciones demostrables.
- PPO-07: definirá logs, métricas, healthchecks y runbooks.
- PPO-08: ejecutará validación con usuarios reales.
- PPO-09: medirá y estabilizará el uso real.
- PPO-10: gobernará la migración futura a infraestructura estable y la
  conservación de una estrategia de recuperación.

Estas fases describen alcance futuro. No incorporan diseño de implementación en
este documento.

## Fuera del alcance de PPO

- Catálogo comercial.
- Tienda online.
- Carrito.
- Pagos online.
- Inventario avanzado.
- Facturación fiscal completa.
- Aplicación móvil nativa.
- WhatsApp avanzado.
- Panel independiente de clientes.
- Analítica comercial avanzada.
- Kubernetes.
- Microservicios distribuidos.
- Alta disponibilidad multinodo.
- Nuevo rediseño visual general.
