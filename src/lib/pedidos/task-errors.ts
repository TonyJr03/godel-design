import {
  canManagePedidoTasksInStatus,
  getPedidoTaskManagementBlockedReason,
  type PedidoStatus,
} from "./status";

export function canManagePedidoTaskMutation(status: PedidoStatus): boolean {
  return canManagePedidoTasksInStatus(status);
}

export function getPedidoTaskStatusBlockedMessage(
  status: PedidoStatus,
  fallbackMessage: string,
): string {
  return getPedidoTaskManagementBlockedReason(status) ?? fallbackMessage;
}
