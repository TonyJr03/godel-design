import type { Enums, Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type Solicitud = Tables<"solicitudes">;
export type SolicitudInsert = TablesInsert<"solicitudes">;
export type SolicitudUpdate = TablesUpdate<"solicitudes">;
export type EstadoSolicitud = Enums<"solicitud_estado">;

export type SolicitudId = Solicitud["id"];

export type SolicitudBase = {
  id: SolicitudId;
  status: EstadoSolicitud;
};
