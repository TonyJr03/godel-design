# Deuda tecnica pendiente

Este documento concentra deuda tecnica conocida que no bloquea el MVP, pero que conviene tratar antes de despliegue productivo o cuando aumente el volumen real de uso.

## Storage y subida de archivos

Estado actual:

- El bucket `godel-files` es privado.
- No se usan URLs publicas permanentes.
- Las descargas internas usan signed URLs de corta duracion.
- La UI y los componentes no reciben `file_path`.
- Las rutas de Storage se construyen server-side.
- RLS, policies de Storage y validaciones server-side quedan como defensa final.
- Las subidas actuales pasan por Server Actions.

### 1. Archivos grandes procesados por Next

Prioridad: Alta antes de produccion.

El flujo actual de subida usa Server Actions y aumenta `serverActions.bodySizeLimit` y `proxyClientMaxBodySize` para permitir hasta 5 archivos de 20 MB. Esto es aceptable para MVP y desarrollo local, pero no es ideal para produccion porque el servidor Next recibe y procesa cuerpos grandes.

Propuesta futura:

- Evaluar subida directa/controlada a Supabase Storage mediante signed upload URLs o un flujo dedicado de carga.
- Mantener la validacion de metadata y permisos en servidor.
- Evitar que archivos grandes pasen completamente por Next cuando el proyecto este cerca de produccion.

### 2. Objetos huerfanos en subidas publicas

Prioridad: Media.

En la subida publica de archivos de solicitud, si el objeto se sube correctamente al bucket pero falla la insercion de metadata en `archivos`, puede quedar un objeto huerfano. No se habilita eliminacion anonima, lo cual es correcto por seguridad, pero deja una deuda operativa.

Propuesta futura:

- Crear un flujo seguro de limpieza de objetos huerfanos.
- Considerar una tabla o job de auditoria para objetos subidos sin metadata.
- Mantener cerrada la eliminacion anonima.

### 3. Limpieza best-effort en subidas internas

Prioridad: Media.

La subida interna de archivos de pedido intenta limpiar el objeto si falla la insercion de metadata, pero Storage y base de datos no son transaccionales entre si. Esa limpieza puede fallar y dejar objetos huerfanos.

Propuesta futura:

- Mantener la limpieza best-effort actual.
- Agregar un proceso de reconciliacion para detectar objetos sin metadata.
- Documentar el procedimiento manual de limpieza para administracion tecnica.

### 4. Eliminacion y ciclo de vida de archivos

Prioridad: Media.

No hay eliminacion funcional de archivos ni edicion de metadata. Esto evita riesgos prematuros, pero en produccion hara falta decidir como se retiran archivos, quien puede hacerlo y como queda auditado.

Propuesta futura:

- Definir eliminacion controlada por rol.
- Registrar historial de eliminacion si se habilita.
- Decidir si se elimina fisicamente el objeto o si primero se marca metadata como inactiva.

### 5. Antispam y limites del formulario publico

Prioridad: Alta antes de produccion.

El formulario publico permite crear solicitudes y adjuntar archivos dentro de limites definidos, pero todavia no hay captcha, rate limiting ni proteccion avanzada contra abuso.

Propuesta futura:

- Agregar control anti-spam compatible con el despliegue.
- Agregar rate limiting para `/solicitud`.
- Revisar limites de cantidad/tamano segun infraestructura real.

### 5.1 Proteccion de consulta publica por codigo

Prioridad: Alta antes de produccion.

La consulta publica por `public_reference` usa una RPC controlada y no abre
lectura anonima directa sobre tablas, pero antes de exponer una pagina publica
conviene agregar defensas operativas contra abuso.

Propuesta futura:

- Agregar rate limiting para la ruta `/estado`.
- Evaluar captcha o desafio liviano si aparece enumeracion o abuso.
- Considerar verificacion adicional por telefono u otro dato acordado si el
  cliente exige mayor privacidad para ciertos trabajos.
- Registrar auditoria o metricas agregadas de consultas fallidas por codigo,
  cuidando no guardar datos personales innecesarios.
- Hacer una inspeccion visual completa en escritorio y movil antes de
  produccion para validar la posicion del bloque copiable en solicitudes,
  pedidos, Home y `/estado`.

## Separacion Encargo / Impresion

Estado actual:

- `workflow_type` gobierna la variante operativa.
- `service_type` conserva un uso descriptivo.
- Ambos flujos comparten entidades, permisos y estados generales.
- Los encargos requieren tareas para avanzar.
- Las impresiones pueden avanzar sin tareas obligatorias.

### 6. Normalizacion futura de detalles de impresion

Prioridad: Baja mientras no existan reportes especificos.

Los detalles de impresion se guardan como una descripcion estructurada. Solo
conviene normalizarlos en tablas o columnas propias si aparecen necesidades
reales de busqueda, cotizacion, automatizacion o metricas por atributo.

### 7. Reconciliacion de solicitudes y archivos publicos

Prioridad: Media.

Ademas de detectar objetos huerfanos, conviene poder identificar solicitudes de
impresion creadas correctamente cuyos archivos fallen despues durante la subida,
para facilitar su recuperacion operativa sin debilitar las politicas publicas.

### 8. Estados especificos o reducidos para impresion

Prioridad: Baja.

Alfa 1 comparte los estados generales de pedido. Si la operacion real demuestra
que impresion necesita menos etapas o estados propios, debe evaluarse con datos
de uso antes de ampliar enums, RPCs y superficies de interfaz.

### 9. Metricas separadas por flujo

Prioridad: Baja.

El dashboard sigue siendo generico. La metrica de pedidos sin tareas incluye
actualmente encargos e impresiones, aunque la ausencia de tareas solo bloquea a
los encargos. Debe filtrarse por `workflow_type = encargo` o reformularse antes
de usarla como indicador estricto. La segmentacion y las metricas propias de
impresion quedan pendientes hasta que exista una necesidad concreta.

## Plantillas de tareas

Estado actual:

- Las plantillas activas con tareas se pueden aplicar a pedidos de tipo
  `encargo`.
- La aplicacion copia tareas al final de `pedido_tareas` y no mantiene
  sincronizacion viva con la plantilla.
- Aplicar la misma plantilla mas de una vez puede duplicar tareas.

### 10. Duplicados y seleccion avanzada de plantillas

Prioridad: Baja mientras el volumen de plantillas sea controlado.

Alfa 3.4 permite duplicados al aplicar plantillas para no bloquear casos donde
repetir un bloque de trabajo sea intencional. La UI advierte este comportamiento,
pero no hace prevencion inteligente.

Propuesta futura:

- Evaluar prevencion opcional de duplicados al aplicar plantillas de tareas.
- Considerar una confirmacion adicional cuando el pedido ya tiene tareas.
- Evaluar filtros por tipo de trabajo, categoria de plantilla o contexto del
  pedido si crece el catalogo.
- Evaluar busqueda/filtro en el selector si aumenta el numero de plantillas.
- Evaluar una previsualizacion de tareas antes de aplicar una plantilla.
- Evaluar reordenamiento avanzado o drag and drop en Configuracion si la edicion
  por botones deja de ser suficiente.
- Hacer pruebas visuales mas amplias con datos reales antes de produccion.

## Pagos y modelo financiero

Estado actual:

- `pedido_pagos` guarda un resumen financiero 1:1 por pedido.
- El estado de pago se calcula en base de datos desde total, efectivo y
  transferencia.
- Los pedidos historicos quedan backfilled como `pagado` con total cero.
- La creacion manual ya registra precio inicial.
- No existe todavia UI de registro de pagos ni bloqueo de entrega.

### 11. Movimientos, comprobantes y cierre operativo

Prioridad: Media cuando el flujo financiero empiece a usarse en operacion real.

El resumen actual cubre el estado financiero minimo, pero no reemplaza una
contabilidad detallada ni una caja diaria.

Propuesta futura:

- Agregar tabla de movimientos de pago o abonos si se requiere trazabilidad por
  transaccion.
- Modelar comprobantes de transferencia y adjuntos asociados.
- Definir impresion o generacion de recibos.
- Evaluar cierre de caja por dia, usuario o turno.
- Endurecer auditoria historica para ediciones de precio y pagos.
