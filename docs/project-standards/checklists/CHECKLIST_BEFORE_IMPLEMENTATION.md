# Checklist antes de implementar

Usar antes de empezar una tarea.

## Alcance

- [ ] Entendi el objetivo exacto de la tarea.
- [ ] Identifique que archivos o modulos probablemente serán afectados.
- [ ] Identifique que NO debo tocar.
- [ ] Revise patrones existentes antes de crear uno nuevo.
- [ ] Verifique si la tarea toca arquitectura, DB, seguridad, UI o documentación.

## Documentación

- [ ] Revise `AGENTS.md`.
- [ ] Revise `docs/project-standards/README.md`.
- [ ] Revise reglas específicas si aplican:
  - [ ] Arquitectura.
  - [ ] Seguridad.
  - [ ] Base de datos.
  - [ ] QA y reporte.

## Seguridad básica

- [ ] No necesito `service_role`.
- [ ] No necesito `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] No necesito consultar `auth.users` desde app code.
- [ ] No expondre datos sensibles en UI o rutas públicas.

## Plan de trabajo

- [ ] Puedo implementar en cambios pequeños y revisables.
- [ ] No mezclare refactor grande con funcionalidad nueva salvo instruccion explícita.
