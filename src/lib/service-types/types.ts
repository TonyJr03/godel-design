import type { Enums, Tables } from "@/types/database";
import type { PaginationMeta } from "@/lib/pagination";

export type WorkflowType = Enums<"workflow_type">;

export type PublicServiceTypeRow = Pick<
  Tables<"tipos_servicio">,
  "id" | "name" | "description" | "workflow_type"
>;

export type InternalServiceTypeRow = Pick<
  Tables<"tipos_servicio">,
  | "id"
  | "name"
  | "description"
  | "workflow_type"
  | "is_publicly_available"
  | "created_at"
  | "updated_at"
>;

export type PublicServiceType = {
  id: string;
  name: string;
  description: string;
  workflowType: WorkflowType;
};

export type InternalServiceType = PublicServiceType & {
  isPubliclyAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ServiceTypeField = "name" | "description" | "isPubliclyAvailable";

export type ServiceTypeFieldErrors = Partial<
  Record<ServiceTypeField, string>
>;

export type ServiceTypeAvailabilityFilter = "public" | "hidden";

export type ListInternalServiceTypesOptions = {
  q?: string | null;
  availability?: string | null;
  page?: string | number | null;
  limit?: number;
};

export type ListInternalServiceTypesMeta = {
  q: string | null;
  availability: ServiceTypeAvailabilityFilter | null;
  ignoredInvalidAvailability: boolean;
};

export type ListInternalServiceTypesData = ListInternalServiceTypesMeta & {
  serviceTypes: InternalServiceType[];
  pagination: PaginationMeta;
  publicEncargoCount: number;
};

export type CreateServiceTypeInput = {
  name?: unknown;
  description?: unknown;
  isPubliclyAvailable?: unknown;
};

export type UpdateServiceTypeInput = {
  id: string;
  name?: unknown;
  description?: unknown;
  isPubliclyAvailable?: unknown;
};

export type ValidServiceTypeInput = {
  name: string;
  description: string;
  isPubliclyAvailable: boolean;
};

export type ListPublicServiceTypesErrorReason = "error";

export type GetPublicServiceTypeByIdErrorReason =
  | "invalid_id"
  | "not_found"
  | "error";

export type ListInternalServiceTypesErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type CreateServiceTypeErrorReason =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "error";

export type UpdateServiceTypeErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "validation"
  | "error";
