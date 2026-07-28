import { revalidatePath } from "next/cache";

export function revalidateClientesList() {
  revalidatePath("/dashboard/clientes");
}

export function revalidateClienteDetail(clienteId: string) {
  revalidateClientesList();
  revalidatePath(`/dashboard/clientes/${clienteId}`);
}

export function revalidateClienteForm(clienteId: string) {
  revalidateClienteDetail(clienteId);
}

export function revalidateConfiguracionUsuariosList() {
  revalidatePath("/dashboard/configuracion/usuarios");
}

export function revalidateConfiguracionUsuario() {
  revalidateConfiguracionUsuariosList();
}

export function revalidateTaskTemplatesList() {
  revalidatePath("/dashboard/configuracion");
  revalidatePath("/dashboard/configuracion/plantillas");
}

export function revalidateServiceTypesAdmin() {
  revalidatePath("/dashboard/configuracion");
  revalidatePath("/dashboard/configuracion/servicios");
  revalidatePath("/solicitud");
}

export function revalidateTaskTemplateDetail(templateId: string) {
  revalidateTaskTemplatesList();
  revalidatePath(`/dashboard/configuracion/plantillas/${templateId}`);
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
