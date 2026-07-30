# Supabase clients

Esta carpeta prepara la configuración base de Supabase para Next.js App Router.

- Usa `src/lib/supabase/client.ts` en componentes cliente. Exporta `createClient()`, basado en `createBrowserClient`.
- Usa `src/lib/supabase/server.ts` en Server Components, Server Actions y Route Handlers. Exporta `createClient()`, basado en `createServerClient`.
- Usa `src/lib/supabase/admin.ts` solo desde servicios server-side cuando haga falta Supabase Auth Admin. Exporta `createAdminClient()`, basado en `@supabase/supabase-js`.
- Usa `src/lib/supabase/index.ts` cuando prefieras imports con nombres explícitos: `createBrowserSupabaseClient` o `createServerSupabaseClient`.

No se debe usar la clave administrativa en frontend. Los clientes de navegador y SSR usan solamente `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

El cliente Admin usa `SUPABASE_SECRET_KEY`, no usa `@supabase/ssr`, no lee cookies, no comparte sesiones de usuario, no persiste sesión, no renueva tokens y no detecta sesiones desde URL. Debe importarse directamente con:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
```

No se reexporta desde `index.ts`, `client.ts` ni `server.ts`.

Las operaciones normales de datos continúan usando los clientes con RLS. El
cliente Admin se reserva para operaciones aisladas de Auth Admin y para la RPC
privilegiada `public.complete_initial_password_change` después de
verificar la contraseña temporal actual y completar `auth.updateUser` con éxito.
En el servicio de cambio inicial, la auditoría estática solo permite
`rpc("complete_initial_password_change", ...)` mediante el cliente privilegiado;
bloquea otras RPCs, `from`, Storage y `auth.admin`. No debe usarse para pedidos,
solicitudes, Storage ni consultas normales a tablas.

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
- `/cambiar-contrasena-inicial` requiere autenticación y perfil activo con
  `must_change_password = true`.
- `/`, `/login`, `/solicitud` y assets estáticos permanecen públicos, salvo que
  `/login` redirige a `/dashboard` cuando ya existe una sesión completa.
- Auth por sí solo no basta para entrar al dashboard: el usuario también debe tener una fila propia en `public.perfiles` con `is_active = true`.
- `perfiles.is_active` controla el acceso interno básico.
- `perfiles.must_change_password = true` redirige login y dashboard a
  `/cambiar-contrasena-inicial` hasta completar el primer cambio de contraseña.
- El proxy valida acceso por rol a rutas de dashboard usando `canAccessDashboardRoute`.
- Si el usuario tiene sesión y perfil activo, pero su rol no permite la ruta solicitada, se redirige a `/sin-permisos`.
- No se usa service role key; el proxy solo usa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Los permisos sobre datos siguen dependiendo de las políticas RLS de Supabase.
