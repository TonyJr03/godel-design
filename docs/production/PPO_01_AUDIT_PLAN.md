# PPO-01 - Plan de auditoría de infraestructura y conectividad

## Metadatos

- Estado: Aprobado para preparación
- Fecha: 2026-08-01
- Fase: PPO-01

## Objetivo

Determinar si la laptop de desarrollo y la máquina de Godel Diseño poseen las
capacidades, prerrequisitos y condiciones operativas necesarias para construir y
ejecutar posteriormente la infraestructura contenerizada prevista por PPO.

## Preguntas de PPO-01

1. Si la laptop puede construir y validar la composición.
2. Si la máquina de la empresa puede alojar provisionalmente el sistema junto
   con sus demás aplicaciones.
3. Qué límites iniciales de CPU, memoria y almacenamiento deberían evaluarse.
4. Si la conectividad es suficiente y estable.
5. Qué estrategia de almacenamiento merece pasar a pruebas reales posteriores.

## Hosts auditados

Los hosts auditados se identificarán exclusivamente con estos alias:

- `development-laptop`
- `company-host`

Queda prohibido registrar como identificadores:

- Nombre real del equipo.
- Nombre de usuario.
- Correo.
- Número de serie.
- MAC.
- IP pública.
- Claves de Windows.
- Rutas personales.
- Identificadores de cuentas.

## División de la fase

- PPO-01A.1 — Formalización documental.
- PPO-01A.2 — Herramienta segura de inventario.
- PPO-01B — Auditoría de la laptop.
- PPO-01C — Auditoría de la máquina de la empresa.
- PPO-01D — Informe comparativo y decisión.

## Áreas de auditoría

### Hardware

- Procesador y arquitectura.
- Núcleos físicos y lógicos.
- RAM total y disponible.
- Tipo y capacidad de almacenamiento.
- Espacio libre.
- Salud básica del almacenamiento cuando pueda consultarse sin acciones destructivas.
- Posibilidad de ampliación.
- Temperatura mediante herramientas ya disponibles.
- Interfaz y velocidad de red.
- Soporte de virtualización.
- UPS o ausencia de UPS.
- Capacidad de autoencendido después de pérdida eléctrica.

### Software

- Edición y versión de Windows.
- Estado general de actualizaciones.
- Virtualización.
- WSL2.
- Distribuciones instaladas.
- Docker Desktop.
- Backend WSL2.
- Linux containers.
- Recursos disponibles.
- Firewall.
- Antivirus.
- Suspensión y energía.
- Aplicaciones habituales que compiten por recursos.

Las aplicaciones habituales deben registrarse manualmente por categorías. La
futura herramienta no deberá enumerar automáticamente procesos o software
instalado.

### Capacidad

Las mediciones posteriores podrán incluir:

- Reposo.
- Docker Desktop.
- Supabase local en la laptop.
- Build de Next.js.
- Aplicación local.
- Lectura y escritura sintética.
- Checksum.
- Uso simultáneo con aplicaciones habituales.
- Reinicio controlado de Docker Desktop.
- Espacio disponible después de pruebas.

No se ejecutará la composición productiva, porque todavía no existe.

### Conectividad

Las mediciones posteriores deberán planificar:

- Descarga.
- Subida.
- Latencia.
- Variación de latencia.
- Pérdida de paquetes.
- Estabilidad.
- DNS.
- HTTPS saliente.
- Acceso a GitHub.
- Acceso a Vercel.
- Acceso a Supabase.
- Acceso a Cloudflare.
- Transferencia controlada de 20 MB.
- Conexión fija y datos móviles cuando corresponda.
- Funcionamiento sin VPN.

PPO-01 no publica el sistema. La transferencia de 20 MB será sintética, no
utilizará archivos reales de clientes y el endpoint controlado se decidirá antes
de ejecutar la medición. El dominio, Nginx y Cloudflare Tunnel se validarán en
PPO-04.

### Almacenamiento

La auditoría comparará de manera preliminar:

- Filesystem Linux de WSL2.
- Directorio NTFS dedicado.
- Disco externo para backup.

La evaluación considerará:

- Rendimiento.
- Capacidad.
- Permisos.
- Manipulación accidental.
- Facilidad de backup.
- Restauración.
- Acceso desde Windows.
- Compatibilidad con contenedores Linux.

El resultado de PPO-01 será una recomendación preliminar, no el ADR definitivo.

## Política de privilegios

- Ejecución como usuario estándar por defecto.
- No elevar privilegios automáticamente.
- No cambiar configuración.
- No instalar software.
- No activar características de Windows.
- No modificar firewall.
- No modificar antivirus.
- No modificar WSL2.
- No modificar Docker Desktop.
- Registrar como pendiente cualquier dato que requiera permisos no aprobados.

## Evidencias

Las salidas brutas permanecerán fuera del repositorio, no se subirán
automáticamente, se revisarán antes de resumirse, no contendrán secretos y no se
usarán como documentación final sin sanitización.

El repositorio solo conservará resultados resumidos y aprobados.

## Clasificación final

Cada host deberá clasificarse como:

```text
Apta
Apta con condiciones
No apta
```

No se fijan todavía umbrales numéricos definitivos de CPU o RAM sin mediciones.

La decisión debe considerar:

- Capacidad.
- Estabilidad.
- Riesgo operacional.
- Energía.
- Almacenamiento.
- Coexistencia con otras aplicaciones.
- Conectividad.
- Posibilidad de recuperación.

## Definition of Done

PPO-01 quedará cerrada cuando:

- Ambas máquinas estén inventariadas.
- Se conozcan CPU, RAM y almacenamiento realmente disponibles.
- WSL2 y Docker Desktop estén verificados o sus faltantes documentados.
- Se conozca el impacto sobre las aplicaciones habituales.
- Existan mediciones reproducibles de conectividad.
- Se haya probado una transferencia sintética de 20 MB.
- Estén documentados energía, reinicio y suspensión.
- Exista una recomendación preliminar de almacenamiento.
- Existan límites preliminares de recursos.
- Cada host tenga clasificación de aptitud.
- Estén documentados los prerrequisitos para PPO-02.
- No se hayan expuesto datos sensibles.
- No se haya modificado código productivo.
