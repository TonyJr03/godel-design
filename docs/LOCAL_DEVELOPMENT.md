# Desarrollo Local — Godel Design

## Proposito

Este documento guia la configuracion local del sistema Godel Design para desarrollo con Next.js, Supabase local, Docker y variables de entorno.

## Requisitos previos

- Node.js instalado.
- npm instalado.
- Docker Desktop instalado y en ejecucion.
- Repositorio clonado.
- Dependencias instaladas con `npm install`.

## Variables de entorno

Crea un archivo `.env.local` en la raiz del proyecto. Este archivo no debe subirse al repositorio.

```cmd
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=valor_generado_por_supabase_local
```

Notas importantes:

- `.env.local` no debe subirse al repositorio.
- No se debe usar la service role key en frontend.
- La clave publica/publishable no reemplaza las politicas RLS.
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
npx supabase gen types typescript --local > src\types\database.types.ts
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

1. Crear o modificar la migracion correspondiente.
2. Ejecutar `npx supabase db reset`.
3. Regenerar tipos:

```cmd
npx supabase gen types typescript --local > src\types\database.types.ts
```

4. Ejecutar `npm run lint`.
5. Ejecutar `npm run build`.

## Supabase local y otros proyectos

Si otro proyecto local de Supabase esta usando los mismos puertos, puede haber conflicto. Inicialmente se recomienda trabajar con un solo proyecto Supabase local activo a la vez.

Detener Supabase local:

```cmd
npx supabase stop
```

Iniciar Supabase local:

```cmd
npx supabase start
```

Mas adelante se pueden configurar puertos distintos en `supabase/config.toml` si fuera necesario.

## Supabase Studio

Supabase Studio local normalmente queda disponible en:

```cmd
http://localhost:54323
```

Desde Studio se pueden revisar tablas, Auth, Storage y politicas. Los cambios estructurales deben mantenerse preferiblemente mediante migraciones.

## Manejo de tipos generados

`src/types/database.types.ts` es generado automaticamente por Supabase CLI y no debe editarse manualmente.

Si cambia la base de datos, regenera el archivo con:

```cmd
npx supabase gen types typescript --local > src\types\database.types.ts
```

Los tipos de dominio deben derivar de `src/types/database.ts`.

## Problemas conocidos

- Si `npm run build` falla por Google Fonts, revisar la conexion de red.
- Si Supabase no inicia, revisar que Docker Desktop este corriendo.
- Si hay conflictos de puertos, detener otros proyectos Supabase locales.
- Si la base local queda inconsistente, usar `npx supabase db reset` teniendo en cuenta que reinicia los datos locales.

## Que NO se hace en esta fase

- No implementar login.
- No implementar logout.
- No crear middleware.
- No proteger rutas.
- No conectar formularios reales.
- No usar service role key en frontend.
- No desplegar todavia.

## Cierre

La siguiente subfase sera la revision final de la Fase 2 antes de pasar a autenticacion.
