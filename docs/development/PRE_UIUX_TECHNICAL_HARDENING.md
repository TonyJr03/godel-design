# Hardening técnico pre-UI/UX

## Estado del documento

- Etapa: preparación técnica previa a la Fase 14.
- Alcance: diagnóstico, decisiones arquitectónicas y plan de trabajo.
- Estado inicial: Fase 13.8A.
- Fecha de creación: 5 de junio de 2026.

## 1. Objetivo del hardening

Esta etapa busca dejar el código, la base de datos, los flujos críticos y la
documentación en un estado estable antes de iniciar la Fase 14 de mejora UI/UX.

El sistema ya tiene implementados los módulos principales:

- solicitudes públicas;
- solicitudes internas;
- clientes;
- pedidos;
- tareas de pedido;
- archivos privados;
- comentarios;
- historial;
- usuarios internos;
- dashboard operativo;
- búsquedas y filtros.

También se completaron:

- Fase 13.6: reajuste operativo de solicitudes y pedidos;
- Fase 13.7: refinamiento operativo final de solicitudes y pedidos.

La Fase 14 será una etapa amplia de rediseño y mejora de experiencia. Antes de
iniciarla se decidió resolver riesgos técnicos que podrían obligar a rehacer
interfaces o contratos si se descubren después del rediseño.

Este hardening no pretende ampliar el producto ni cambiar sus reglas de
negocio. Su propósito es fortalecer integridad, concurrencia, seguridad,
consistencia técnica y documentación.

## 2. Resultado general de la auditoría

La auditoría técnica pre-UI/UX concluyó que el proyecto tiene una base sólida y
una arquitectura adecuada para continuar su evolución.

Fortalezas confirmadas:

- la lógica server-side está organizada por dominios en `src/lib`;
- Server Components y Client Components están correctamente separados;
- los componentes cliente no consultan Supabase directamente;
- las Server Actions delegan validación y lógica de dominio en servicios;
- las páginas dinámicas siguen las convenciones asíncronas de Next.js 16;
- RLS está activo en las tablas públicas expuestas;
- `pedido_contadores` tiene RLS activo y no concede acceso público;
- el bucket `godel-files` es privado;
- las descargas usan URLs firmadas de corta duración;
- la UI no recibe `file_path`;
- el historial usa `clock_timestamp()` para conservar orden real de eventos;
- los listados, búsquedas y filtros se resuelven server-side;
- los tipos generados incluyen las tablas, enums y RPCs vigentes;
- no se usa service role key en la aplicación;
- la aplicación no consulta `auth.users`;
- `npm.cmd run lint` y `npm.cmd run build` finalizaron correctamente;
- el lint local del esquema de Supabase no reportó errores.

La conclusión no es que el sistema necesite una reescritura. El trabajo previo
a UI/UX debe concentrarse en un grupo pequeño de flujos críticos y en limpiar
documentación que todavía conserva contexto histórico obsoleto.

## 3. Hallazgos críticos

### A. Conversión solicitud a pedido no atómica

#### Problema

La conversión actual ejecuta operaciones separadas:

1. crear el pedido;
2. marcar la solicitud como convertida;
3. guardar `converted_order_id`;
4. asociar al pedido los archivos heredados de la solicitud.

#### Riesgo

Si una operación intermedia falla, puede quedar un pedido creado mientras la
solicitud continúa como aprobada, o una solicitud convertida cuyos archivos no
fueron heredados. Las restricciones únicas pueden impedir un reintento limpio y
dejar el flujo en un estado que requiera corrección manual.

#### Solución recomendada

Crear una RPC transaccional dedicada que ejecute la conversión completa dentro
de una única transacción de PostgreSQL. La RPC debe ser la autoridad de esta
operación, validar nuevamente permisos y estado, evitar doble conversión y
devolver únicamente los datos mínimos del pedido creado.

### B. Creación y asociación de cliente desde solicitud no atómica

#### Problema

El flujo puede crear una fila en `clientes` y fallar después al asociarla con la
solicitud o al registrar el historial esperado.

#### Riesgo

Puede dejar clientes huérfanos, eventos incompletos o una solicitud sin la
asociación que motivó la creación del cliente.

#### Solución recomendada

Crear una operación transaccional para:

- bloquear y validar la solicitud;
- confirmar que todavía puede asociarse;
- crear el cliente;
- asociarlo con la solicitud;
- registrar historial coherente;
- devolver el identificador del cliente.

La asociación con un cliente existente debe revisarse dentro de la misma
subfase para decidir si también necesita bloqueo de la solicitud, aunque no
requiera crear una fila nueva.

### C. Posible condición de carrera al cambiar estado de pedido

#### Problema

La RPC `public.actualizar_estado_pedido` carga el pedido, evalúa la transición y
después lo actualiza. La fila debe permanecer bloqueada durante toda la
decisión.

#### Riesgo

Dos solicitudes simultáneas pueden leer el mismo estado anterior, validar
transiciones incompatibles y generar un resultado o historial contradictorio.
La lectura de tareas también puede cambiar mientras se decide si el pedido
puede pasar a producción o quedar listo para entrega.

#### Solución recomendada

Usar `SELECT ... FOR UPDATE` al cargar el pedido y definir una estrategia
coherente para la lectura de tareas durante la transición. La actualización y
el evento de historial deben permanecer dentro de la misma transacción.

## 4. Hallazgos importantes

### Subida pública y Storage

- El límite de cinco archivos por solicitud se aplica principalmente en
  TypeScript y puede omitirse mediante acceso directo con la anon key.
- Las policies validan ruta, solicitud existente, MIME y tamaño, pero no pueden
  verificar de forma fiable la extensión declarada ni el contenido real.
- Si la subida física funciona y falla la inserción de metadata, puede quedar un
  objeto huérfano.
- No existe todavía un control anti-spam o rate limiting suficiente para el
  formulario y la subida pública.
- Debe decidirse si el flujo futuro usará token temporal, mediación completa
  del servidor, signed upload o reconciliación posterior.

### Tamaño de requests

`serverActions.bodySizeLimit` y `proxyClientMaxBodySize` permiten cuerpos de
hasta 110 MB. Esto soporta el flujo actual de varios archivos, pero aumenta el
impacto potencial de abuso, consumo de memoria y latencia. Debe revisarse antes
del despliegue productivo.

### IDs de ruta en Server Actions

Algunas actions de comentarios intentan reconstruir el identificador desde
`referer` o `next-url` cuando falta el campo oculto. Ese fallback funciona como
compatibilidad, pero introduce dependencia de headers y dificulta pruebas y
razonamiento.

Debe preferirse una Server Action enlazada al ID conocido por la ruta o un
contrato explícito y validado.

### Pruebas automatizadas

No existe cobertura automatizada suficiente para:

- validadores puros;
- matriz de permisos;
- parser y progreso de tareas;
- transiciones de estado;
- operaciones transaccionales;
- acceso negativo por rol;
- helpers de fechas;
- contratos de Storage.

La falta de pruebas no obliga a detener todo el hardening, pero los cambios de
integridad y concurrencia deben incorporar verificaciones focalizadas o un
checklist reproducible.

### Documentación histórica

Algunos documentos mezclan el estado vigente con decisiones de fases
anteriores. Entre las contradicciones detectadas están referencias a:

- migraciones iniciales todavía pendientes;
- conversión de solicitudes como trabajo futuro;
- subida pública de archivos todavía deshabilitada;
- ausencia de comentarios o historial ya implementados.

## 5. Decisiones arquitectónicas

Las siguientes decisiones orientan las subfases 13.8:

1. Las operaciones críticas multi-tabla se moverán a RPCs transaccionales.
2. Las RPCs serán la autoridad para conversión, transiciones y reglas críticas
   que requieren consistencia de base de datos.
3. Las Server Actions seguirán siendo capas finas: leer input permitido,
   delegar, traducir errores controlados y revalidar rutas.
4. Los servicios en `src/lib` conservarán validación de input, autorización de
   aplicación y adaptación de resultados.
5. RLS seguirá siendo la defensa final, incluso cuando una RPC valide permisos.
6. No se usará service role key en la aplicación.
7. No se agregará `SUPABASE_SERVICE_ROLE_KEY`.
8. No se consultará `auth.users` desde el código de aplicación.
9. No se expondrán `file_path`, metadata cruda ni URLs privadas persistentes.
10. No se dividirán archivos `actions.ts` únicamente por cantidad de líneas.
11. Un `actions.ts` de ruta puede mantenerse agrupado cuando representa las
    entradas de una misma pantalla.
12. Cuando exista complejidad real, se extraerá la lógica a `src/lib` o a una
    RPC, en lugar de fragmentar mecánicamente cada action.
13. Los cambios de schema, RLS y RPCs se harán en tareas dedicadas, con tipos
    regenerados y verificación local.
14. No se cambiará la matriz de permisos ni las reglas funcionales durante este
    hardening salvo corrección de un bug confirmado.

## 6. Plan de subfases recomendado

### 13.8A — Documento de auditoría y plan técnico pre-UI/UX

#### Objetivo

Crear el presente documento, consolidar los hallazgos y dejar aprobado el orden
de trabajo.

#### Entregables

- diagnóstico consolidado;
- decisiones arquitectónicas;
- alcance y exclusiones;
- subfases y criterios de aceptación.

### 13.8B — Conversión solicitud a pedido transaccional

#### Objetivo

Mover la conversión completa a una RPC transaccional.

#### Debe incluir

- autenticar usuario y perfil activo;
- validar permisos de solicitudes y pedidos;
- bloquear la solicitud durante la conversión;
- validar que la solicitud exista;
- validar estado `aprobada`;
- validar cliente asociado;
- evitar doble conversión;
- crear el pedido;
- conservar numeración `P-YY-XXXX`;
- iniciar en `solicitud_recibida`;
- marcar la solicitud como `convertida`;
- guardar `converted_order_id`;
- mantener `pedidos.solicitud_id`;
- heredar archivos por metadata;
- mantener historial coherente y sin eventos duplicados;
- devolver ID y número del pedido creado;
- mapear errores técnicos a resultados seguros en TypeScript.

#### Criterio de cierre

Ante cualquier fallo, ninguna escritura parcial debe quedar confirmada.

### 13.8C — Creación y asociación de cliente transaccional

#### Objetivo

Evitar clientes huérfanos y asegurar una asociación e historial coherentes.

#### Debe incluir

- autenticar y autorizar;
- validar y bloquear la solicitud;
- confirmar que no tenga una asociación incompatible;
- crear cliente desde datos guardados en servidor;
- asociar el cliente con la solicitud;
- registrar `cliente_creado_desde_solicitud`;
- conservar el evento automático de asociación sin duplicaciones confusas;
- revisar asociación con cliente existente y su concurrencia;
- ejecutar la operación completa dentro de una transacción.

#### Criterio de cierre

No debe existir un camino de error que deje un cliente creado exclusivamente
para una asociación que no llegó a completarse.

### 13.8D — Concurrencia en estados de pedido y fechas SQL locales

#### Objetivo

Endurecer `public.actualizar_estado_pedido` y alinear fechas de negocio.

#### Debe incluir

- cargar el pedido con `FOR UPDATE`;
- evitar transiciones simultáneas contradictorias;
- revisar la lectura de tareas durante la decisión;
- mantener actualización e historial en una transacción;
- revisar `current_date` en `actual_delivery_date`;
- revisar el año usado para generar `P-YY-XXXX`;
- usar la fecha local de negocio, `America/Havana`, cuando corresponda;
- conservar las transiciones y reglas vigentes.

#### Criterio de cierre

Dos peticiones concurrentes no deben producir un estado o historial imposible
según las reglas del pedido.

### 13.8E — Endurecimiento de subida pública y objetos huérfanos

#### Objetivo

Reducir abuso y mejorar la consistencia entre Storage y metadata.

#### Debe incluir

- revisar el límite de cinco archivos por solicitud;
- mitigar el bypass directo mediante anon key;
- evaluar rate limiting básico;
- revisar limpieza o rollback si falla metadata;
- evaluar token temporal, signed upload o subida mediada;
- definir proceso de reconciliación para objetos sin metadata;
- mantener bucket privado y ausencia de lectura anónima;
- documentar explícitamente cualquier riesgo aceptado.

#### Criterio de cierre

El flujo debe contar con una mitigación concreta o una deuda aceptada,
responsable y verificable antes de producción.

### 13.8F — Limpieza de actions, IDs de ruta y dependencia de referer

#### Objetivo

Eliminar dependencias frágiles para obtener IDs críticos.

#### Debe incluir

- revisar actions de comentarios;
- revisar otras actions con IDs enviados por formularios;
- preferir actions enlazadas al ID de la ruta cuando aplique;
- validar siempre UUID y autorización en servicio o RPC;
- mantener las actions como capa fina;
- no dividir archivos solo por tamaño;
- extraer lógica únicamente cuando reduzca complejidad real.

#### Criterio de cierre

Las mutaciones no deben depender de `referer` o `next-url` para identificar la
entidad objetivo.

### 13.8G — Limpieza documental final

#### Objetivo

Eliminar contradicciones entre documentación y estado vigente.

#### Documentos mínimos a revisar

- `docs/DATABASE_MODEL.md`;
- `docs/CLIENTS_FLOW.md`;
- `docs/STORAGE_MODEL.md`;
- `docs/ORDER_ASSIGNMENTS_FLOW.md`;
- `docs/PUBLIC_REQUEST_FLOW.md`;
- `docs/INTERNAL_REQUESTS_FLOW.md`;
- `docs/ORDERS_FLOW.md`;
- `docs/COMMENTS_AND_HISTORY_MODEL.md`;
- `docs/development/ROADMAP.md`;
- `docs/development/TECH_DEBT.md`;
- README de dominios afectados.

#### Criterio de cierre

La documentación estable debe describir el sistema actual. El contexto
histórico debe estar claramente identificado como histórico y no como trabajo
pendiente vigente.

### 13.8H — Revisión final pre-UI/UX

#### Objetivo

Confirmar que integridad, concurrencia, documentación y verificaciones están
listas para iniciar la Fase 14.

#### Debe incluir

- revisión de cada criterio de aceptación;
- verificación de migraciones y tipos si hubo cambios de schema;
- comprobación de acceso por rol;
- comprobación de conversión, asociación y estados;
- revisión de deuda aceptada de Storage;
- ejecución de lint, build y `git diff --check`;
- decisión explícita de apertura o bloqueo de la Fase 14.

## 7. Fuera de alcance

La Fase 13.8 no incluye:

- rediseño visual;
- responsive;
- sistema de diseño;
- refactor visual profundo de componentes compartidos;
- nuevos layouts de dashboard;
- dashboards avanzados;
- gráficos;
- reportes;
- análisis de productividad;
- notificaciones;
- panel de cliente;
- pagos;
- facturación;
- catálogo de productos o servicios;
- nuevas reglas de negocio no relacionadas con bugs de integridad;
- cambios a la matriz de permisos.

## 8. Deuda técnica aceptable para después

Puede quedar para una etapa posterior sin bloquear la Fase 14:

- cobertura automatizada amplia de todos los módulos;
- rate limiting avanzado distribuido;
- búsqueda con índices especializados o full text search;
- paginación avanzada según volumen real;
- componentes visuales compartidos para tablas, cards, badges y layouts;
- refactor visual de formularios y estados vacíos;
- observabilidad y logging estructurado;
- eliminación funcional y ciclo de vida completo de archivos;
- división de `actions.ts` cuando aparezca una necesidad real de ownership,
  pruebas o reutilización;
- reportes operativos avanzados.

Esta deuda no debe confundirse con los bloqueos de atomicidad y concurrencia.

## 9. Criterios de aceptación para cerrar el hardening

La Fase 13.8 podrá cerrarse cuando:

- la conversión solicitud a pedido sea transaccional;
- la conversión no permita dobles pedidos para una solicitud;
- la solicitud, el pedido y los archivos heredados queden consistentes;
- la creación y asociación de cliente no pueda dejar clientes huérfanos;
- las transiciones de pedido no tengan condiciones de carrera conocidas;
- las decisiones de estado lean tareas de forma coherente;
- las fechas SQL relevantes usen la zona de negocio definida;
- la subida pública tenga mitigación suficiente o deuda explícitamente
  aceptada y documentada;
- no se abran lecturas públicas ni buckets públicos;
- las actions críticas no dependan de `referer` o `next-url`;
- la documentación estable no contradiga el código y schema vigentes;
- los tipos generados estén actualizados si hubo cambios de schema;
- `npm.cmd run lint` pase;
- `npm.cmd run build` pase;
- `git diff --check` pase;
- si hubo cambios de base de datos, el reset local, las migraciones y la
  regeneración de tipos funcionen;
- la revisión 13.8H emita una decisión explícita de que la Fase 14 puede
  comenzar.

## 10. Comandos de verificación

Verificación normal:

```powershell
npm.cmd run lint
npm.cmd run build
git diff --check
```

Cuando una subfase cambie schema, RLS, funciones, triggers o RPCs:

```powershell
npx supabase db reset
npx supabase gen types typescript --local --schema public > src/types/database.types.ts
npm.cmd run lint
npm.cmd run build
git diff --check
```

También conviene ejecutar lint del esquema cuando la base local esté
disponible:

```powershell
npx supabase db lint --local --level warning
```

## 11. Orden recomendado antes de la Fase 14

Orden de ejecución:

1. 13.8A — aprobar documento y alcance;
2. 13.8B — conversión solicitud a pedido transaccional;
3. 13.8C — creación y asociación de cliente transaccional;
4. 13.8D — concurrencia de estados y fechas SQL locales;
5. 13.8E — subida pública y objetos huérfanos;
6. 13.8F — IDs de ruta y limpieza de actions;
7. 13.8G — documentación final;
8. 13.8H — revisión de cierre.

Las subfases 13.8B, 13.8C y 13.8D son bloqueantes para iniciar UI/UX. La 13.8E
debe dejar al menos una mitigación y una decisión explícita. Las subfases 13.8F
y 13.8G preparan contratos y documentación para que el trabajo visual no se
apoye en patrones frágiles u obsoletos.

## 12. Restricciones permanentes

Durante todo el hardening:

- no usar service role key;
- no agregar `SUPABASE_SERVICE_ROLE_KEY`;
- no consultar `auth.users` desde la aplicación;
- no abrir buckets públicos;
- no exponer `file_path`;
- no exponer metadata cruda;
- no mover lógica sensible al cliente;
- no reintroducir `quantity` en solicitudes;
- no reintroducir estados antiguos;
- no cambiar la matriz de permisos sin una decisión separada;
- no iniciar trabajo visual o responsive de la Fase 14.

## 13. Decisión actual

El proyecto no requiere una reescritura antes de UI/UX. Requiere un hardening
acotado y secuencial.

La Fase 14 permanece bloqueada hasta completar, como mínimo, las subfases
13.8B, 13.8C y 13.8D, y hasta que 13.8H confirme que los contratos técnicos son
estables para sostener el rediseño.
