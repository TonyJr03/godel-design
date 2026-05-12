import type { EstadoSolicitud } from "@/constants/estados-solicitud";

export type SolicitudId = string;

export type SolicitudBase = {
  id: SolicitudId;
  estado: EstadoSolicitud;
};

// TODO: definir el modelo completo cuando se implemente el formulario publico.
