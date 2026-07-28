import { mapNullableInternalServiceReference } from "@/lib/service-types";
import type {
  InternalSolicitud,
  InternalSolicitudDetail,
  InternalSolicitudDetailRow,
  InternalSolicitudRow,
} from "./types";

export function mapInternalSolicitud(
  solicitud: InternalSolicitudRow,
): InternalSolicitud {
  return {
    ...solicitud,
    service: mapNullableInternalServiceReference(solicitud.service),
  };
}

export function mapInternalSolicitudDetail(
  solicitud: InternalSolicitudDetailRow,
): InternalSolicitudDetail {
  return {
    ...solicitud,
    service: mapNullableInternalServiceReference(solicitud.service),
  };
}
