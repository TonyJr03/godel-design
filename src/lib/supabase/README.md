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

La autenticacion real se implementara en Fase 3. El middleware/proxy de sesion tambien se implementara en Fase 3.

Esta subfase solo prepara la configuracion base.
