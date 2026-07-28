import type { InternalServiceReference } from "./types";

export const HIDDEN_SERVICE_LABEL = "Oculto públicamente";
export const SERVICE_UNAVAILABLE_LABEL = "Servicio no disponible";

export function getInternalServiceDisplayName(
  service: InternalServiceReference | null,
  fallback = SERVICE_UNAVAILABLE_LABEL,
): string {
  return service?.name ?? fallback;
}

export function getInternalServiceOptionLabel(
  service: InternalServiceReference,
): string {
  return service.isPubliclyAvailable
    ? service.name
    : `${service.name} — ${HIDDEN_SERVICE_LABEL}`;
}
