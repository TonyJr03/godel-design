import type { Tables } from "@/types/database";

export type InternalSolicitud = Pick<
  Tables<"solicitudes">,
  | "id"
  | "client_name"
  | "client_phone"
  | "client_email"
  | "workflow_type"
  | "service_type"
  | "status"
  | "created_at"
  | "desired_date"
>;

export type InternalSolicitudDetail = Pick<
  Tables<"solicitudes">,
  | "id"
  | "public_reference"
  | "cliente_id"
  | "client_name"
  | "client_phone"
  | "client_email"
  | "workflow_type"
  | "service_type"
  | "description"
  | "desired_date"
  | "notes"
  | "status"
  | "converted_order_id"
  | "reviewed_by"
  | "created_at"
  | "updated_at"
>;
