# Supabase clients

Esta carpeta prepara la configuración base de Supabase para Next.js App Router.

- Usa `src/lib/supabase/client.ts` en componentes cliente. Exporta `createClient()`, basado en `createBrowserClient`.
- Usa `src/lib/supabase/server.ts` en Server Components, Server Actions y Route Handlers. Exporta `createClient()`, basado en `createServerClient`.
- Usa `src/lib/supabase/index.ts` cuando prefieras imports con nombres explícitos: `createBrowserSupabaseClient` o `createServerSupabaseClient`.

No se debe usar la service role key en frontend. Estos clientes usan solamente `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Para la Fase 12, la gestión inicial de usuarios internos debe seguir usando estos clientes normales y operar solo sobre `public.perfiles`. Crear usuarios en Supabase Auth desde la app requeriría Admin API y service role key server-side, por lo que queda fuera del MVP.

## Tipos generados

`src/types/database.types.ts` es generado automáticamente por Supabase CLI a partir del esquema de la base de datos. No debe editarse manualmente salvo una necesidad puntual de formato o compatibilidad.

Para regenerarlo:

```cmd
npx supabase gen types typescript --local > src\types\database.types.ts
```

`src/types/database.ts` funciona como punto central de exportación para `Database` y los helpers generados, como `Tables`, `TablesInsert`, `TablesUpdate` y `Enums`.

## Proxy de sesión

`src/proxy.ts` es el punto de entrada del proxy de Next.js 16.

`src/lib/supabase/proxy.ts` contiene la lógica de actualización de sesión con `@supabase/ssr` y la protección básica de rutas.

- `/dashboard` y sus subrutas requieren autenticación.
- `/`, `/login`, `/solicitud` y assets estáticos permanecen públicos, salvo que `/login` redirige a `/dashboard` cuando ya existe una sesión.
- Auth por sí solo no basta para entrar al dashboard: el usuario también debe tener una fila propia en `public.perfiles` con `is_active = true`.
- `perfiles.is_active` controla el acceso interno básico.
- El proxy valida acceso por rol a rutas de dashboard usando `canAccessDashboardRoute`.
- Si el usuario tiene sesión y perfil activo, pero su rol no permite la ruta solicitada, se redirige a `/sin-permisos`.
- No se usa service role key; el proxy solo usa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Los permisos sobre datos siguen dependiendo de las políticas RLS de Supabase.
