# PPO-01 - Informe de capacidad

## Metadatos

- Estado: En elaboración - development-laptop evaluada; company-host pendiente
- Fase: PPO-01
- Fecha de apertura: 2026-08-01
- Fecha de última actualización: 2026-08-02

## 1. Resumen ejecutivo

`development-laptop` fue evaluada como host de preparación para PPO. La evidencia
sanitizada disponible indica capacidad suficiente para construir y validar en
PPO-02 la composición contenerizada prevista, sin clasificar la laptop como host
productivo, servidor permanente ni máquina apta para operación desatendida.

WSL2 y Docker con contenedores Linux están operativos. El build de Next.js,
Supabase local y Next.js en modo producción coexistieron correctamente durante
las mediciones controladas. La conectividad sin VPN desde el contexto físico
declarado `cuba` fue demostrada para GitHub, Vercel y Cloudflare en los destinos
ejecutados. La transferencia sintética de 20 MiB funcionó en descarga y carga.

La clasificación arquitectónica aprobada para `development-laptop` es:

```text
Apta con condiciones
```

`company-host` permanece pendiente de auditoría en PPO-01C. Todavía no existe
decisión comparativa final y PPO-01 permanece activa.

## 2. Metodología utilizada

La evaluación de `development-laptop` consolida cuatro grupos de evidencia:

- Inventario oficial de solo lectura.
- Mediciones controladas de capacidad.
- Auditoría automatizada de conectividad.
- Validación manual de conectividad sin VPN.

La metodología incluyó build real de Next.js, arranque y reposo de Supabase
local, ejecución simultánea de Next.js y Supabase, solicitudes locales ligeras,
archivos sintéticos de 512 MiB, checksum, mediciones sobre NTFS y filesystem
Linux de WSL2, DNS y HTTPS, ventana de estabilidad, transferencia sintética de
20 MiB y validación manual sin VPN.

Las evidencias brutas se conservaron fuera del repositorio. Este informe solo
traslada resultados agregados y sanitizados.

No se realizaron benchmarks de estrés, deploys, pruebas productivas,
modificaciones del host, pruebas con archivos reales ni pruebas contra Supabase
administrado.

## 3. `development-laptop`

### 3.1 Sistema y prerrequisitos

Inventario consolidado:

- Sistema operativo: Windows 11 Pro x64.
- PowerShell: 5.1.
- Procesador: Intel Core Ultra 7 255H.
- Núcleos físicos reportados: 16.
- Procesadores lógicos: 16.
- RAM total aproximada: 30.92 GiB.
- Almacenamiento físico: SSD NVMe de aproximadamente 931.51 GiB.
- Salud de almacenamiento: saludable.
- WSL: 2.7.3.0.
- Versión predeterminada de WSL: WSL2.
- Distribuciones relevantes: Ubuntu 24.04 y Docker Desktop sobre WSL2.
- Docker: Linux containers.
- CPU visibles para Docker: 16.
- Memoria visible para Docker: aproximadamente 15.08 GiB.
- Firewall habilitado en perfiles Domain, Private y Public.

No se trasladan seriales, rutas, IP, MAC, usuario, nombre del equipo ni etiquetas
privadas.

### 3.2 Capacidad observada

Baseline:

- Duración aproximada: 121.45 s.
- CPU promedio: 6.9%.
- CPU mínima/máxima observada: 3.8% / 14.19%.
- Memoria usada promedio: 53.8%.
- Memoria usada máxima: 56.71%.

Build:

- Resultado: exitoso.
- Duración: 14.71 s.
- CPU promedio durante build: 16.27%.
- Memoria usada máxima durante build: 57.22%.

Supabase local:

- Resultado: estable.
- Arranque: 27.23 s.
- Ventana medida: 180.01 s.
- Contenedores durante la medición: 9.
- Memoria Docker promedio aproximada: 1051.27 MiB.
- Memoria Docker máxima aproximada: 1101.89 MiB.

Next.js con Supabase local:

- Arranque de Next.js: 2.33 s.
- Solicitudes locales ejecutadas: 30.
- Respuestas correctas: 30.
- Fallos: 0.
- Latencia media: 35.09 ms.
- Latencia máxima: 147.22 ms.
- Memoria Docker promedio aproximada: 1011.42 MiB.

No se observó agotamiento de recursos durante las ventanas medidas. Estas
mediciones no sustituyen pruebas prolongadas ni la validación de la composición
real de PPO-02.

### 3.3 Almacenamiento medido

NTFS:

- Escritura aproximada: 681.01 MiB/s.
- Lectura observada: 2284.09 MiB/s.
- Checksum: correcto.
- Limpieza: correcta.

WSL2 Linux filesystem:

- Escritura aproximada: 773.41 MiB/s.
- Lectura observada: 4970.87 MiB/s.
- Checksum: correcto.
- Limpieza: correcta.

Las lecturas pueden estar fuertemente influidas por caché y no representan
rendimiento físico sostenible. Ambas rutas demostraron integridad y limpieza
correcta. La comparación sigue siendo preliminar.

### 3.4 Conectividad

Auditoría automatizada:

- Conexión medida: `primary-connection`.
- Conexión marcada como no medida por Windows.
- VPN o túnel preexistente detectado.
- GitHub, Vercel y Cloudflare fueron alcanzables en los destinos ejecutados.
- Supabase administrado quedó como validación manual requerida.

Auditoría manual sin VPN:

- Contexto físico declarado: `cuba`.
- VPN confirmada manualmente como desconectada.
- Túnel no detectado por la detección no invasiva.
- GitHub público accesible.
- Remoto Git legible.
- Vercel público y API accesibles.
- Cloudflare accesible.
- Estabilidad de diez minutos en los destinos ejecutados.
- Muestras por destino ejecutado: 20/20 exitosas.
- Fallos: 0.
- Timeouts: 0.
- Variabilidad generalmente aceptable, con un outlier en GitHub.
- Descarga sintética de 20 MiB completada en 54.96 s, con rendimiento medio de
  0.36 MiB/s.
- Carga sintética de 20 MiB completada en 199.28 s, con rendimiento medio de
  0.10 MiB/s y respuesta HTTP 2xx.

La evidencia demuestra acceso desde Cuba sin VPN para los destinos ejecutados.
La evidencia corresponde a la red, momento y destinos concretos evaluados. No
garantiza el comportamiento de todas las redes cubanas ni de momentos futuros.

Supabase administrado:

```text
Pendiente: proyecto administrado no configurado.
```

Este resultado no se clasifica como fallo de red.

### 3.5 Energía, temperatura y seguridad

- Esquema de energía: Balanced.
- Suspensión S0 disponible.
- Hibernación disponible.
- Reporte de batería o alimentación: inconcluso.
- Temperatura: no disponible mediante mecanismos integrados.
- Producto antivirus detectado.
- Estado activo, protección en tiempo real y firmas: no demostrados.
- Firewall habilitado en los perfiles revisados.

No se declara capacidad de operación ininterrumpida.

### 3.6 Validaciones manuales pendientes

Permanecen pendientes:

- Capacidad real de ampliación de RAM.
- Capacidad real de ampliación de almacenamiento.
- Temperatura mediante Lenovo Vantage u otra herramienta del fabricante.
- Estado general de Windows Update.
- Confirmación visual del backend WSL2 en Docker Desktop.
- Aplicaciones habituales que compiten por recursos.
- Comportamiento térmico en sesiones prolongadas.
- Restricciones para reinicios.
- Comportamiento de batería y alimentación.

Para `development-laptop`, UPS y autoencendido tras pérdida eléctrica quedan
como no requeridos para construir PPO-02. Serían relevantes únicamente si se
pretendiera operación desatendida.

## 4. `company-host`

Pendiente de auditoría en PPO-01C.

## 5. Comparación de hardware

Pendiente hasta PPO-01C y PPO-01D. La baseline de `development-laptop` ya está
disponible para la comparación futura.

## 6. Comparación de software y prerrequisitos

Pendiente hasta PPO-01C y PPO-01D. La baseline de `development-laptop` ya está
disponible para la comparación futura.

## 7. Capacidad y coexistencia

Docker, Supabase local, Next.js y aplicaciones habituales coexistieron durante
la medición de `development-laptop`. No se observó agotamiento de recursos, y el
build terminó correctamente.

No se ejecutó estrés prolongado ni la composición real de PPO-02. La coexistencia
de `company-host` permanece pendiente.

## 8. Conectividad

La validación manual sin VPN mostró acceso desde el contexto físico declarado
`cuba` hacia GitHub, Vercel y Cloudflare en los destinos ejecutados. La ventana
de estabilidad completó 20 muestras exitosas por destino, sin fallos ni
timeouts. La descarga y carga sintéticas de 20 MiB terminaron correctamente.

Supabase administrado no fue probado porque el proyecto administrado no estaba
configurado. La comparación con `company-host` permanece pendiente.

## 9. Energía, reinicio y suspensión

`development-laptop` mostró esquema Balanced, suspensión S0 e hibernación
disponible. Batería, alimentación, temperatura y comportamiento real ante
reinicios o sesiones prolongadas requieren validación manual.

`company-host` permanece pendiente. No se declara capacidad de operación
ininterrumpida.

## 10. Almacenamiento

Recomendación preliminar:

1. Usar el filesystem Linux de WSL2 para datos activos y volúmenes propios de
   contenedores Linux.
2. Evitar almacenar datos intensivos de Linux mediante bind mounts de trabajo
   sobre NTFS cuando no sean necesarios.
3. Conservar código, artefactos exportables y copias accesibles desde Windows
   en una ubicación NTFS controlada.
4. No guardar datos operativos dentro del repositorio.
5. Diferir la decisión definitiva hasta la auditoría de `company-host`, el
   diseño de PPO-02 y la estrategia de backups de PPO-06.

Las cifras de lectura estuvieron influidas por caché y no son el único
fundamento de esta recomendación. No se redacta todavía un ADR definitivo.

## 11. Riesgos

| Severidad | Riesgo | Estado |
| --------- | ------ | ------ |
| condición | Supabase administrado no configurado. | Pendiente antes de validar integración remota. |
| condición | Carga sintética de 20 MiB funcional pero lenta. | Considerar en PPO-03. |
| condición | Temperatura no medida. | Requiere validación manual. |
| condición | Estado activo del antivirus no confirmado. | Requiere validación manual. |
| condición | Energía y batería inconclusas. | Requiere validación manual. |
| observación | Métricas de almacenamiento afectadas por caché. | Considerar como preliminares. |
| observación | Una única red y ventana temporal. | No generalizar a todas las redes. |
| observación | `company-host` pendiente. | Resolver en PPO-01C. |
| observación | No se ha probado operación continua. | Validar en fases posteriores si aplica. |
| observación | No se ha construido todavía la composición PPO-02. | Resolver en PPO-02. |

Para `development-laptop` no existe actualmente un riesgo bloqueante para
comenzar la preparación de PPO-02 cuando Dirección Técnica lo autorice.

## 12. Clasificación de cada host

`development-laptop`:

```text
Apta con condiciones
```

Alcance:

```text
Apta con condiciones para construir, ejecutar y validar en PPO-02
la composición contenerizada.
```

Justificación:

- Capacidad suficiente.
- Build correcto.
- WSL2 y Docker funcionales.
- Coexistencia correcta.
- Almacenamiento saludable.
- Conectividad estable en los destinos ejecutados.
- Transferencia sintética de 20 MiB completada en descarga y carga.
- Repositorio y host restaurados tras las pruebas.

Condiciones:

- Usarla para construcción y validación, no para operación productiva
  permanente.
- Configurar Supabase administrado antes de validar integración remota.
- Vigilar temperatura y memoria durante sesiones prolongadas.
- Considerar la lentitud de subida al diseñar PPO-03.
- Validar los límites reales durante PPO-02.
- Mantener evidencias y datos operativos fuera del repositorio.

`company-host`:

```text
Pendiente de clasificación en PPO-01C.
```

## 13. Límites preliminares recomendados

Estos son guardrails iniciales para validar durante PPO-02. No son límites
productivos definitivos, no son sizing productivo y no aplican automáticamente
a `company-host`.

CPU:

```text
comenzar la composición con un presupuesto agregado conservador
de hasta 4 vCPU.
```

Memoria:

```text
objetivo inicial agregado de hasta 4 GiB para la composición PPO-02.
```

Memoria del host:

```text
mantener margen suficiente para Windows y aplicaciones habituales;
revisar la ejecución si la memoria disponible permanece por debajo
de 6 GiB.
```

Docker:

```text
no modificar todavía la asignación global observada de aproximadamente
16 CPU y 15 GiB; los límites deben aplicarse a servicios de la composición.
```

Almacenamiento:

```text
mantener al menos 100 GiB libres en el volumen usado para desarrollo
y evidencias temporales.
```

Archivos:

```text
conservar provisionalmente 20 MB por archivo como límite funcional
previsto para diseñar y validar en PPO-03; no declararlo implementado.

La transferencia sintética de PPO-01 utilizó 20 MiB
(20 971 520 bytes), un tamaño ligeramente superior a 20 MB
decimales. Esta medición demuestra viabilidad técnica, pero no define
todavía la semántica exacta del límite en bytes.
```

PPO-03 deberá decidir explícitamente:

- Valor exacto en bytes.
- Etiqueta mostrada al usuario.
- Validación cliente/servidor.
- Comportamiento ante archivos que excedan el límite.

Todos estos guardrails deben revisarse con la composición real.

## 14. Prerrequisitos para PPO-02

### Satisfechos

- Host x64.
- WSL2.
- Docker Desktop.
- Linux containers.
- Daemon funcional.
- Almacenamiento saludable.
- Espacio libre.
- Capacidad para build.
- Coexistencia local.
- Acceso a GitHub.
- Acceso a Vercel.
- Acceso a Cloudflare.

### Pendientes no bloqueantes para iniciar la base local

- Proyecto Supabase administrado.
- Temperatura manual.
- Windows Update.
- Confirmación visual del backend WSL2.
- Límites reales de la composición.
- Validación posterior en `company-host`.

### Condición de paso antes de integración remota

- Configurar o identificar el proyecto Supabase administrado.
- Registrar variables mediante el mecanismo seguro que se defina.
- Comprobar `/auth/v1/health` sin exponer claves.

No se incluyen secretos.

## 15. Decisiones diferidas

- Almacenamiento definitivo: PPO-02 y PPO-06, con comparación final en PPO-01D.
- Límites productivos: PPO-02 y fases posteriores de estabilización.
- Política de recursos de `company-host`: PPO-01C y PPO-01D.
- UPS y recuperación eléctrica de `company-host`: PPO-01C.
- Supabase administrado: antes de integración remota y según decisión de
  Dirección Técnica.
- Cloudflare Tunnel: PPO-04.
- Dominio: PPO-04.
- Nginx: PPO-02 y PPO-04.
- Estrategia final de archivos: PPO-03.
- Backups: PPO-06.
- Observabilidad: PPO-07.

## 16. Evidencias sanitizadas

Evidencias utilizadas, todas con fecha 2026-08-02:

- Inventario oficial de `development-laptop`.
- Medición de capacidad de `development-laptop`.
- Conectividad automatizada de `development-laptop`.
- Conectividad manual sin VPN de `development-laptop`.

No se trasladan rutas absolutas, timestamps de directorios, IP, MAC, usuario,
nombre de equipo, SSID, project ref, claves, URLs privadas ni salidas crudas.

## 17. Conclusión

PPO-01B queda cerrada. `development-laptop` está `Apta con condiciones` para
construir, ejecutar y validar localmente la composición contenerizada prevista
por PPO-02.

La construcción y validación local de PPO-02 puede comenzar después del cierre
completo de PPO-01 o mediante decisión expresa de Dirección Técnica. PPO-01
permanece activa: `company-host` y la comparación final siguen pendientes.

El siguiente paso formal es PPO-01C. No existe todavía una decisión comparativa
ni cierre de PPO-01. PPO-02 no se declara iniciada.
