# Supabase clients

Esta carpeta prepara la configuración base de Supabase para Next.js App Router.

- Usa `src/lib/supabase/client.ts` en componentes cliente. Exporta `createClient()`, basado en `createBrowserClient`.
- Usa `src/lib/supabase/server.ts` en Server Components, Server Actions y Route Handlers. Exporta `createClient()`, basado en `createServerClient`.
- Usa `src/lib/supabase/admin.ts` solo desde servicios server-side cuando haga falta Supabase Auth Admin. Exporta `createAdminClient()`, basado en `@supabase/supabase-js`.
- Usa `src/lib/supabase/index.ts` cuando prefieras imports con nombres explícitos: `createBrowserSupabaseClient` o `createServerSupabaseClient`.

No se debe usar la clave administrativa en frontend. El cliente de navegador usa
solamente `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Los clientes server-side usan `src/lib/supabase/server-config.ts`, que es
server-only. La URL server-side se resuelve con `SUPABASE_SERVER_URL` y, si esa
variable está vacía, cae a `NEXT_PUBLIC_SUPABASE_URL`. La publishable key sigue
siendo `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y no reemplaza RLS ni permisos.
`server-config.ts` no debe importarse desde Client Components.

Ejemplo conceptual para desarrollo local contenerizado cuando navegador y
contenedor no alcanzan Supabase local por el mismo endpoint:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVER_URL=http://host.docker.internal:54321
```

El cliente Admin usa `SUPABASE_SECRET_KEY`, no usa `@supabase/ssr`, no lee cookies, no comparte sesiones de usuario, no persiste sesión, no renueva tokens y no detecta sesiones desde URL. Debe importarse directamente con:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
```

No se reexporta desde `index.ts`, `client.ts` ni `server.ts`.

Las operaciones normales de datos continúan usando los clientes con RLS. El
cliente Admin se reserva para operaciones aisladas de Auth Admin y para la RPC
privilegiada `public.complete_initial_password_change` después de
completar `auth.updateUser({ password })` con éxito desde una sesión válida.
En el servicio de cambio inicial, la auditoría estática solo permite
`rpc("complete_initial_password_change", ...)` mediante el cliente privilegiado;
bloquea otras RPCs, `from`, Storage y `auth.admin`. No debe usarse para pedidos,
solicitudes, Storage ni consultas normales a tablas.

Para usuarios internos hay dos consumidores productivos adicionales auditados
por archivo:

- `src/lib/usuarios/create-internal-user.ts` puede usar solo
  `auth.admin.createUser` y `auth.admin.deleteUser` para alta y compensación.
- `src/lib/usuarios/reset-internal-user-password.ts` puede usar solo
  `auth.admin.getUserById` y `auth.admin.updateUserById` para reemplazar una
  contraseña temporal administrativa.

El restablecimiento administrativo no usa el cliente Admin para tablas, Storage,
Functions ni RPCs; las RPCs de inicio, finalización, consulta de estado y
confirmación usan el cliente server-side normal. No se envía correo ni
recuperación por email, no se devuelve la contraseña y no se registra ningún
valor sensible.

En ese flujo, Auth Admin solo se considera confirmado cuando `updateUserById`
devuelve el usuario objetivo. Si la mutación queda incierta, el servicio no usa
el cliente Admin para compensar ni restaurar credenciales; bloquea el perfil por
auditoría con `attention_required`.

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
- No se usa service role key; el proxy usa `SUPABASE_SERVER_URL` con fallback a
  `NEXT_PUBLIC_SUPABASE_URL`, y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Los permisos sobre datos siguen dependiendo de las políticas RLS de Supabase.
