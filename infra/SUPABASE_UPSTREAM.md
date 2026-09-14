# Supabase self-hosted upstream

## Procedencia

- Repositorio upstream: [`supabase/supabase`](https://github.com/supabase/supabase)
- Ruta upstream: `docker/`
- Commit exacto: `e846d45ce64207b952a4df44ac8b480ea0abb27e`
- Fecha de importación: 2026-08-11

## Propósito

`infra/supabase/` es el baseline reproducible de Supabase self-hosted para
desarrollo/preproducción y para un compatible clean Linux Docker host. La VPS
operativa seleccionada es un destino concreto gestionado por PPO; no convierte a
un proveedor ni a un host histórico en dependencia de este baseline.

## Política de actualización

- No actualizar imágenes individualmente sin revisión.
- Toda actualización debe partir de una revisión upstream exacta.
- Comparar siempre contra esa revisión upstream antes de actualizar.
- Mantener las personalizaciones Godel fuera de `infra/supabase/` siempre que
  sea posible.

## Estado

`SH-01A — baseline importado`
