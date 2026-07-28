import type {
  InternalServiceReference,
  InternalServiceReferenceRow,
} from "@/lib/service-types";
import type { Tables } from "@/types/database";

export type InternalSolicitudRow = Pick<
  Tables<"solicitudes">,
  | "id"
  | "client_name"
  | "client_phone"
  | "client_email"
  | "workflow_type"
  | "service_id"
  | "service_type"
  | "status"
  | "created_at"
  | "desired_date"
> & {
  service: InternalServiceReferenceRow | null;
};

export type InternalSolicitud = Omit<InternalSolicitudRow, "service"> & {
  service: InternalServiceReference | null;
};

export type InternalSolicitudDetailRow = Pick<
  Tables<"solicitudes">,
  | "id"
  | "public_reference"
  | "cliente_id"
  | "client_name"
  | "client_phone"
  | "client_email"
  | "workflow_type"
  | "service_id"
  | "service_type"
  | "description"
  | "desired_date"
  | "notes"
  | "status"
  | "converted_order_id"
  | "reviewed_by"
  | "created_at"
  | "updated_at"
> & {
  service: InternalServiceReferenceRow | null;
};

export type InternalSolicitudDetail = Omit<
  InternalSolicitudDetailRow,
  "service"
> & {
  service: InternalServiceReference | null;
};
