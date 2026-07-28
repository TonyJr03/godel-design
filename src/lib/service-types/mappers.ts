import type {
  InternalServiceReference,
  InternalServiceReferenceRow,
} from "./types";

export function mapInternalServiceReference(
  row: InternalServiceReferenceRow,
): InternalServiceReference {
  return {
    id: row.id,
    name: row.name,
    workflowType: row.workflow_type,
    isPubliclyAvailable: row.is_publicly_available,
  };
}

export function mapNullableInternalServiceReference(
  row: InternalServiceReferenceRow | null | undefined,
): InternalServiceReference | null {
  return row ? mapInternalServiceReference(row) : null;
}
