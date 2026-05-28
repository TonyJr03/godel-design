Deuda técnica pendiente — Subida de archivos

El flujo actual de subida usa Server Actions y aumenta serverActions.bodySizeLimit y proxyClientMaxBodySize para permitir hasta 5 archivos de 20 MB. Esto es aceptable para MVP y desarrollo local, pero no es ideal para producción porque el servidor Next recibe y procesa cuerpos grandes.

Antes de despliegue productivo o si aumenta la carga, evaluar migrar a subida directa/controlada a Supabase Storage mediante URLs firmadas o un flujo dedicado de carga, evitando que archivos grandes pasen completamente por Next.