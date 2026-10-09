# PPO-04M.6 — Backup Operations Runbook

## 1. Propósito y alcance

Este documento es el entry point operativo para Simple Backup V1 durante el
Managed Production Pilot. Resume cuándo crear un backup, cómo ejecutarlo, cómo
aceptarlo y qué hacer ante un fallo.

Las autoridades relacionadas son:

- [PPO-04M.6 — Simple Backup / Restore V1](PPO_04M6_SIMPLE_BACKUP_RESTORE_V1.md)
- [PPO Roadmap](PPO_ROADMAP.md)
- [Estado del proyecto](../PROJECT_STATUS.md)

El runbook no sustituye el diseño ni la evidencia y no autoriza restore sobre
Production.

## 2. Política operativa

```text
ROUTINE PRODUCTION BACKUP CADENCE = WEEKLY
PRE-HIGH-RISK-OPERATION BACKUP = REQUIRED
MINIMUM SUCCESSFUL PRODUCTION BACKUPS RETAINED = 4
AUTOMATIC SCHEDULING = NO
AUTOMATIC RETENTION DELETION = NO
CLEANUP = MANUAL DURING PRODUCTION PILOT
```

El mínimo de cuatro backups exitosos no es un máximo.

## 3. Precondiciones locales

- Usar el repositorio correcto, con
  `scripts/backup-recovery/backup.ps1` disponible.
- Tener disponible el Supabase CLI local del proyecto.
- Elegir explícitamente `-BackupRoot <path>`; el contrato no impone una ruta
  absoluta universal.
- Proveer la configuración mediante el process environment o el archivo local
  `.env.managed.backup.local`.

Variables relevantes actuales:

```text
GODEL_MANAGED_SUPABASE_PROJECT_REF
SUPABASE_DB_PASSWORD
SUPABASE_ACCESS_TOKEN
```

No registrar valores reales, pegar secretos en la salida de terminal ni
incluirlos en documentación o evidencia.

## 4. Comando canónico

Ejecutar desde la raíz del repositorio:

```powershell
.\scripts\backup-recovery\backup.ps1 `
  -BackupRoot '<backup-root>'
```

La interfaz no recibe `-ProjectRef`. El script usa
`GODEL_MANAGED_SUPABASE_PROJECT_REF` como autoridad del proyecto fuente.

## 5. Criterios de éxito

Un backup cuenta como exitoso únicamente cuando:

- `backup.ps1` termina con exit code `0`;
- muestra `BACKUP COMPLETE`;
- existe un directorio final `GDBK-*` que no es `*.partial`;
- el directorio contiene, como mínimo:

```text
data.sql
manifest.json
checksums.sha256
storage/godel-files/
```

La salida de aceptación incluye conceptualmente:

```text
BACKUP COMPLETE
Database: OK
Storage: OK
Checksums: OK
Path: <final backup path>
```

No es necesario conservar secretos ni output sensible como evidencia.

## 6. Manejo de fallos

Si `backup.ps1` falla:

- no considerar la ejecución un recovery point ni contarla entre los cuatro
  backups retenidos;
- no continuar una operación Productiva de alto riesgo que requería ese backup;
- conservar sólo el mensaje y la fase de fallo sanitizados para diagnóstico;
- corregir la causa y ejecutar un backup nuevo desde cero;
- no hacer retry automático.

No renombrar manualmente `*.partial` a `GDBK-*` ni editar `data.sql`,
`manifest.json`, `checksums.sha256` o `storage/` para intentar convertir un
backup fallido en válido.

## 7. Antes de operaciones Productivas de alto riesgo

1. Crear un backup nuevo.
2. Confirmar `BACKUP COMPLETE` y exit code `0`.
3. Confirmar que existe el directorio final `GDBK-*`.
4. Sólo entonces continuar la operación Productiva de alto riesgo.

Si el backup falla, detener la operación hasta obtener uno exitoso. Esta regla
aplica, por ejemplo, antes de una migration nueva, una modificación bulk de
datos, un cleanup destructivo, un cambio relevante de Storage o una operación
administrativa excepcional con riesgo de datos.

## 8. Retención y cleanup manual

Mantener al menos los últimos cuatro backups Productivos exitosos. No eliminar
mediante cleanup ordinario:

- el último backup Productivo exitoso;
- backups usados en recovery drills;
- backups asociados a incidentes o investigaciones;
- backups marcados por el operador como referencia;
- backups cuyo reemplazo todavía no haya sido validado exitosamente.

Los backups protegidos pueden elevar el total por encima de cuatro. El cleanup
permanece manual; este runbook no introduce comandos ni scripts automáticos.

## 9. Frontera de restore

```text
PRODUCTION RESTORE = NOT AUTHORIZED
VALIDATED V1 RESTORE TARGET = NEW / DISPOSABLE SUPABASE MANAGED PROJECT
```

`restore.ps1` no es un procedimiento rutinario para recuperar Production. Todo
restore futuro sobre Production requiere autorización y diseño operacional
explícitos; este runbook no contiene un comando para hacerlo.

## 10. Checklist rápida del operador

**Before**

- [ ] Repositorio correcto.
- [ ] `BackupRoot` elegido.
- [ ] Entorno requerido disponible.
- [ ] Ningún secreto será registrado como evidencia.

**Run**

- [ ] Ejecutar `backup.ps1` con la interfaz canónica.

**Accept**

- [ ] Exit code `0` y `BACKUP COMPLETE`.
- [ ] Directorio final `GDBK-*` existente.
- [ ] `Database: OK`, `Storage: OK` y `Checksums: OK`.
- [ ] Ningún `*.partial` usado como recovery point.

**Retain**

- [ ] Mínimo de cuatro backups exitosos preservado.
- [ ] Backups protegidos preservados.

**Failure**

- [ ] Detener la operación de alto riesgo.
- [ ] No promover ni reparar manualmente el backup parcial.
- [ ] Diagnosticar y crear un backup nuevo.
