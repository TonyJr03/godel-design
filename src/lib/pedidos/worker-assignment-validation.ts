import { isValidUuid } from "@/lib/validators";

export type PedidoWorkerAssignmentField =
  | "pedido_id"
  | "assigned_profile_id";

export type PedidoWorkerAssignmentFieldErrors = Partial<
  Record<PedidoWorkerAssignmentField, string>
>;

export type PedidoWorkerAssignmentInput = {
  pedidoId: string;
  assignedProfileId: string;
};

export function normalizePedidoWorkerAssignmentInput(
  input: PedidoWorkerAssignmentInput,
): PedidoWorkerAssignmentInput {
  return {
    pedidoId: input.pedidoId.trim(),
    assignedProfileId: input.assignedProfileId.trim(),
  };
}

export function validatePedidoWorkerAssignmentUuid(
  value: string,
  field: PedidoWorkerAssignmentField,
): PedidoWorkerAssignmentFieldErrors | null {
  if (isValidUuid(value)) {
    return null;
  }

  return {
    [field]:
      field === "pedido_id"
        ? "El pedido solicitado no existe."
        : "Selecciona un usuario válido.",
  };
}
