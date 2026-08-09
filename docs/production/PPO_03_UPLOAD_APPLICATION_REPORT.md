# PPO-03C.2 - Infraestructura TypeScript de cargas directas

Fecha: 2026-08-09  
Estado: cerrada / aprobada con condición de integración runtime en PPO-03D/E

## Alcance

PPO-03C.2 añade adaptadores reutilizables, sin integrar UI ni modificar los
flujos legacy. Los descriptors se generan server-side desde nombre y tamaño,
con MIME canónico derivado de extensión; PostgreSQL conserva la generación de
sesión, item, nonce, path y visibilidad.

El flujo público usa una capability aleatoria de 32 bytes, conserva únicamente
su hash SHA-256 en la reserva y usa un cliente anónimo server-only sin cookies.
El flujo interno usa el cliente autenticado existente. Ambos parsean las
respuestas RPC en runtime y convierten fallos a resultados de dominio seguros.

La transferencia individual browser-to-Storage usa TUS con chunks de 6 MiB,
`upsert: false`, fingerprint estable por item reservado y reanudación. El modo
público envía `apikey` y `x-signature`; el interno envía `apikey` y el JWT de la
sesión. No se registran capability, hash, JWT ni headers sensibles.

PPO-03C permanece abierta: PPO-03D y PPO-03E integrarán estos adaptadores en
los flujos productivos, y el gate administrado continúa pendiente.

## Hardening final

La reserva pública conserva los `fieldErrors` de la validación vigente de
Solicitudes: los descriptores se reportan en `files` y un servicio no disponible
en `service_id`. Los adaptadores no duplican la validación del formulario.

Los parsers validan UUID, referencia pública, expiración, rango y continuidad
de `sort_order`, paths `cargas/v1`, MIME canónico, tamaño de 1 a 20 MiB y la
visibilidad interna permitida. Finalize solo acepta `item_status = committed` y
sesión `open` o `completed`.

Los módulos del control plane son `server-only`; sus tipos permanecen seguros
para browser y TUS no importa módulos server-only. Las excepciones de SDK/red se
convierten a `ServiceResult` seguro sin registrar secretos, capabilities, JWT,
firmas, URLs firmadas ni headers.

La regresión `spike:ppo-03c1:local` valida el contrato DB/Storage, no la
ejecución del wrapper TypeScript nuevo. PPO-03D deberá ejecutar el primer gate
browser real authenticated y PPO-03E el presigned, demostrando TUS, resume,
progreso/finalize y ausencia de bytes por Next.js.

## Auditoría de dependencias

`npm audit --omit=dev` reportó 0 críticas, 3 altas, 0 moderadas y 0 bajas,
todas transitivas de `next`, `postcss` y `sharp`. No reportó paquetes del árbol
productivo de TUS; la incorporación de TUS en PPO-03C.2 no introduce una
vulnerabilidad nueva por reclasificación. No se ejecutó `npm audit fix` ni se
actualizó ninguna dependencia: la corrección disponible exige `next@16.3.0`,
fuera del rango declarado.

## Validaciones ejecutadas

Pasaron `npm run lint`, `npm run build`, `npm run diff:check`,
`npm run audit:security`, `npm run audit:client-supabase` y
`npm run spike:ppo-03c1:local`. La auditoría de producción completó su reporte
con las tres vulnerabilidades altas indicadas arriba, por lo que finalizó con
salida no cero; no se aplicaron correcciones automáticas.
