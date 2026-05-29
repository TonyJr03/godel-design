Estas migraciones son el historial incremental usado durante el desarrollo.

El estado efectivo quedó consolidado el 2026-05-29 en `supabase/migrations`.
Esta carpeta queda fuera del runner normal de Supabase para que `db reset`
aplique solo las migraciones consolidadas.

No ejecutar estas migraciones junto con las consolidadas: contienen cambios
intermedios, renombres y policies reemplazadas que duplicarían objetos.
