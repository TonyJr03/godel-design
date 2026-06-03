# Godel Diseño

Sistema web interno de gestión operativa para Godel Diseño. El proyecto cubre autenticación, roles internos, solicitudes públicas, gestión de solicitudes, clientes, pedidos, asignaciones de personal, archivos privados, comentarios, historial, usuarios internos y dashboard operativo.

## Stack

- Next.js con App Router
- React
- TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, RLS y Storage
- Estructura principal en `src/app`
- Alias de importación `@/*`

## Estructura

- `src/app`: rutas, Server Components, Server Actions y Route Handlers.
- `src/components`: componentes visuales reutilizables por dominio.
- `src/lib/<dominio>`: lógica server-side, consultas, mutaciones y servicios del sistema.
- `src/lib/supabase`: clientes Supabase para navegador, servidor y proxy.
- `src/lib/permissions`: helpers de permisos, roles, rutas y etiquetas.
- `src/lib/utils` y `src/lib/validators`: utilidades puras y validadores compartidos.
- `src/types`: tipos globales y tipos generados de Supabase.
- `supabase/migrations`: estado consolidado de esquema, RLS, RPCs, triggers y Storage.
- `docs`: documentación estable del sistema.
- `docs/development`: auditorías, deuda técnica, roadmap histórico y guías locales.

No hay una capa activa en `src/services`; la lógica real del backend de aplicación vive en `src/lib/<dominio>`.

## Seguridad

- No se usa service role key en la aplicación.
- No se consulta `auth.users` desde el código de aplicación.
- Las Server Actions validan permisos antes de ejecutar cambios sensibles.
- RLS queda como defensa final en base de datos.
- Los archivos se gestionan en bucket privado con rutas internas y descargas firmadas.
- La UI no debe exponer `file_path`, URLs permanentes privadas ni metadata cruda.

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

La documentación funcional está en `docs/`. La deuda técnica viva está centralizada en `docs/development/TECH_DEBT.md`; actualmente quedan pendientes de fase posterior el endurecimiento avanzado de Storage, anti-spam/rate limit y pruebas automatizadas.
