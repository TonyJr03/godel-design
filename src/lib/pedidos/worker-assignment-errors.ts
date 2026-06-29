export const GENERIC_ASSIGN_PEDIDO_WORKER_ERROR =
  "No se pudo asignar el personal. Inténtalo nuevamente.";

export const GENERIC_REMOVE_PEDIDO_WORKER_ERROR =
  "No se pudo remover la asignación. Inténtalo nuevamente.";

type SupabaseErrorWithCode = {
  code?: string;
};

export function isDuplicatePedidoWorkerAssignmentError(
  error: SupabaseErrorWithCode | null | undefined,
): boolean {
  return error?.code === "23505";
}
