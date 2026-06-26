# Desarrollo Local — Godel Diseño

## Propósito

Este documento guía la configuración local del sistema Godel Diseño para desarrollo con Next.js, Supabase local, Docker y variables de entorno.

## Requisitos previos

- Node.js instalado.
- npm instalado.
- Docker Desktop instalado y en ejecución.
- Repositorio clonado.
- Dependencias instaladas con `npm install`.

## Variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto. Este archivo no debe subirse al repositorio.

```cmd
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=valor_generado_por_supabase_local
```

Notas importantes:

- `.env.local` no debe subirse al repositorio.
- No se debe usar la service role key en frontend.
- La clave pública/publishable no reemplaza las políticas RLS.
- `.env.example` sirve como plantilla.

## Comandos principales en CMD de Windows

Entrar a la carpeta del proyecto:

```cmd
cd /d "RUTA_DEL_PROYECTO"
```

Instalar dependencias:

```cmd
npm install
```

Iniciar Supabase local:

```cmd
npx supabase start
```

Consultar estado y claves locales:

```cmd
npx supabase status
```

Recrear la base local desde migraciones:

```cmd
npx supabase db reset
```

Regenerar tipos de Supabase:

```cmd
npm.cmd run types:supabase
```

Iniciar Next.js en desarrollo:

```cmd
npm run dev
```

Ejecutar lint:

```cmd
npm run lint
```

Ejecutar build:

```cmd
npm run build
```

## Flujo recomendado para iniciar trabajo

1. Abrir Docker Desktop.
2. Entrar a la carpeta del proyecto.
3. Ejecutar `npm install` si es la primera vez.
4. Ejecutar `npx supabase start`.
5. Copiar la URL y la publishable key al archivo `.env.local`.
6. Ejecutar `npx supabase db reset` si se necesita recrear la base local.
7. Regenerar tipos si cambiaron las migraciones.
8. Ejecutar `npm run dev`.

## Flujo recomendado cuando cambien migraciones

1. Crear o modificar la migración correspondiente.
2. Ejecutar `npx supabase db reset`.
3. Regenerar tipos:

```cmd
npm.cmd run types:supabase
```

4. Ejecutar `npm run lint`.
5. Ejecutar `npm run build`.

## Supabase local y otros proyectos

Si otro proyecto local de Supabase está usando los mismos puertos, puede haber conflicto. Inicialmente se recomienda trabajar con un solo proyecto Supabase local activo a la vez.

Detener Supabase local:

```cmd
npx supabase stop
```

Iniciar Supabase local:

```cmd
npx supabase start
```

Más adelante se pueden configurar puertos distintos en `supabase/config.toml` si fuera necesario.

## Supabase Studio

Supabase Studio local normalmente queda disponible en:

```cmd
http://localhost:54323
```

Desde Studio se pueden revisar tablas, Auth, Storage y políticas. Los cambios estructurales deben mantenerse preferiblemente mediante migraciones.

## Manejo de tipos generados

`src/types/database.types.ts` es generado automáticamente por Supabase CLI y no debe editarse manualmente.

Si cambia la base de datos, regenera el archivo con:

```cmd
npm.cmd run types:supabase
```

El script ejecuta la generacion limitada al schema publico:

```cmd
supabase gen types typescript --local --schema public > src/types/database.types.ts
```

Los tipos de dominio deben derivar de `src/types/database.ts`.

## Problemas conocidos

- Si `npm run build` falla por Google Fonts, revisar la conexión de red.
- Si Supabase no inicia, revisar que Docker Desktop esté corriendo.
- Si hay conflictos de puertos, detener otros proyectos Supabase locales.
- Si la base local queda inconsistente, usar `npx supabase db reset` teniendo en cuenta que reinicia los datos locales.

## Nota historica

Este documento nacio durante la configuracion inicial local. En el estado actual
del proyecto ya existen login, logout, rutas protegidas, formularios reales,
Storage privado, tracking publico y QA con Playwright. Las reglas permanentes
siguen siendo: no subir `.env.local`, no usar service role key en frontend ni en
codigo de aplicacion, y regenerar tipos mediante `npm.cmd run types:supabase`.

## Cierre

Para cierre de tareas locales usa los scripts documentados en `package.json` y
los reportes vigentes de `docs/development/`.
