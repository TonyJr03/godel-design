# Godel Diseño

Sistema web interno de gestión operativa para Godel Diseño. Cubre autenticación,
roles internos, solicitudes públicas, gestión de solicitudes, clientes, pedidos,
asignaciones de personal, archivos privados, comentarios, historial, pagos,
usuarios internos y dashboard operativo.

## Stack

- Next.js con App Router.
- React.
- TypeScript.
- Tailwind CSS.
- Supabase Auth, Postgres, RLS y Storage.
- Estructura principal en `src/app`.
- Lógica server-side de dominio en `src/lib/<dominio>`.

## Estructura

- `src/app`: rutas, Server Components, Server Actions y Route Handlers.
- `src/components`: componentes visuales reutilizables por dominio.
- `src/lib/<dominio>`: consultas, mutaciones, mappers, validaciones y servicios server-side.
- `src/lib/supabase`: clientes Supabase para navegador, servidor y adaptadores especializados.
- `src/types`: tipos globales y tipos generados de Supabase.
- `supabase/migrations`: seis migraciones consolidadas de esquema, seguridad, RPCs, Storage y hardening.
- `docs`: documentación estable del sistema.
- `docs/development`: guías vivas de desarrollo local y deuda técnica activa.
- `docs/archive`: planes, auditorías, cierres e inventarios históricos.
- `docs/ui-ux`: contratos UI/UX vigentes.
- `docs/performance`: baseline vigente de rendimiento.

No hay una capa activa en `src/services`; la lógica real del backend de aplicación
vive en `src/lib/<dominio>`.

## Seguridad

- El código normal usa clientes Supabase públicos o ligados a la sesión del usuario.
- No se usa `SUPABASE_SERVICE_ROLE_KEY` en la aplicación.
- `SUPABASE_SECRET_KEY` existe solo para el adaptador Auth Admin server-only ya definido.
- El adaptador Auth Admin se limita al ciclo administrativo de identidad: alta, compensación, reset y finalización de cambio inicial cuando aplique.
- No se crean clientes admin nuevos sin decisión explícita de arquitectura.
- No se usa un cliente admin para consultar tablas de negocio ni Storage.
- No se exponen credenciales administrativas al navegador.
- No se consulta `auth.users` desde código normal de aplicación.
- Las Server Actions validan permisos antes de cambios sensibles y RLS queda como defensa final.
- Los archivos viven en bucket privado; la UI no debe exponer `file_path`, rutas privadas ni URLs permanentes.

## Comandos

```bash
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
```

Para regenerar tipos de Supabase después de un `db reset` local:

```bash
npx supabase gen types typescript --local > src/types/database.types.ts
```

## Documentación

- [Estado vigente del proyecto](docs/PROJECT_STATUS.md).
- [Índice de documentación](docs/README.md).
- [Deuda técnica activa](docs/development/TECH_DEBT.md).
- [Archivo histórico](docs/archive/README.md).
