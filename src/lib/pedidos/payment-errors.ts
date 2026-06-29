export const GENERIC_PAYMENT_UPDATE_ERROR =
  "No se pudo actualizar el pago del pedido. Inténtalo nuevamente.";

const SAFE_RPC_PAYMENT_MESSAGES = [
  "El monto pagado en efectivo es obligatorio",
  "El monto pagado por transferencia es obligatorio",
  "El monto pagado en efectivo no puede ser negativo",
  "El monto pagado por transferencia no puede ser negativo",
  "El monto pagado en efectivo no puede tener mas de 2 decimales",
  "El monto pagado por transferencia no puede tener mas de 2 decimales",
  "El monto pagado en efectivo supera el maximo permitido",
  "El monto pagado por transferencia supera el maximo permitido",
  "El total pagado no puede superar el total del pedido",
] as const;

export function getSafeRpcPaymentErrorMessage(
  errorMessage: string | undefined,
): string {
  const message = errorMessage?.trim();

  return (
    SAFE_RPC_PAYMENT_MESSAGES.find((safeMessage) =>
      message?.includes(safeMessage),
    ) ?? GENERIC_PAYMENT_UPDATE_ERROR
  );
}
