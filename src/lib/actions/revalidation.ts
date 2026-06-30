import { revalidatePath } from "next/cache";

export function revalidateClientesList() {
  revalidatePath("/dashboard/clientes");
}

export function revalidateClienteDetail(clienteId: string) {
  revalidateClientesList();
  revalidatePath(`/dashboard/clientes/${clienteId}`);
}

export function revalidateClienteEdit(clienteId: string) {
  revalidateClienteDetail(clienteId);
  revalidatePath(`/dashboard/clientes/${clienteId}/editar`);
}

export function revalidatePedidoDetail(pedidoId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pedidos");
  revalidatePath(`/dashboard/pedidos/${pedidoId}`);
}

export function revalidateSolicitudDetail(solicitudId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${solicitudId}`);
}

export function revalidateSolicitudConversion(
  solicitudId: string,
  pedidoId: string,
) {
  revalidateSolicitudDetail(solicitudId);
  revalidatePath("/dashboard/pedidos");
  revalidatePath(`/dashboard/pedidos/${pedidoId}`);
}
