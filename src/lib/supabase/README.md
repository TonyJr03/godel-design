# Supabase clients

Esta carpeta prepara la configuracion base de Supabase para Next.js App Router.

- Usa `src/lib/supabase/client.ts` en componentes cliente. Exporta `createClient()`, basado en `createBrowserClient`.
- Usa `src/lib/supabase/server.ts` en Server Components, Server Actions y Route Handlers. Exporta `createClient()`, basado en `createServerClient`.
- Usa `src/lib/supabase/index.ts` cuando prefieras imports con nombres explicitos: `createBrowserSupabaseClient` o `createServerSupabaseClient`.

No se debe usar la service role key en frontend. Estos clientes usan solamente `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Tipos generados

`src/types/database.types.ts` es generado automaticamente por Supabase CLI a partir del esquema de la base de datos. No debe editarse manualmente salvo una necesidad puntual de formato o compatibilidad.

Para regenerarlo:

```cmd
npx supabase gen types typescript --local > src\types\database.types.ts
```

`src/types/database.ts` funciona como punto central de exportacion para `Database` y los helpers generados, como `Tables`, `TablesInsert`, `TablesUpdate` y `Enums`.

## Proxy de sesion

`src/proxy.ts` es el punto de entrada del proxy de Next.js 16.

`src/lib/supabase/proxy.ts` contiene la logica de actualizacion de sesion con `@supabase/ssr` y la proteccion basica de rutas.

- `/dashboard` y sus subrutas requieren autenticacion.
- `/`, `/login`, `/solicitud` y assets estaticos permanecen publicos, salvo que `/login` redirige a `/dashboard` cuando ya existe una sesion.
- Auth por si solo no basta para entrar al dashboard: el usuario tambien debe tener una fila propia en `public.profiles` con `is_active = true`.
- `profiles.is_active` controla el acceso interno basico.
- Los permisos por rol quedan para la Fase 4; el proxy lee `role` pero todavia no decide acceso por `admin`, `supervisor` o `trabajador`.
- No se usa service role key; el proxy solo usa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
