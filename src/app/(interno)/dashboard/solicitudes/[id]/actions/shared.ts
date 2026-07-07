import type { CreatePedidoFromSolicitudFieldErrors } from "@/lib/pedidos";
import type { SolicitudCommentFieldErrors } from "@/lib/solicitudes";

export type SolicitudDetailAction<State> = (
  prevState: State,
  formData: FormData,
) => Promise<State>;

export type UpdateSolicitudStatusActionState = {
  ok: boolean;
  message: string;
};

export type AssociateSolicitudClienteActionState = {
  ok: boolean;
  message: string;
};

export type CreateClienteFromSolicitudActionState = {
  ok: boolean;
  message: string;
};

export type ConvertSolicitudToPedidoActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: CreatePedidoFromSolicitudFieldErrors;
  values?: {
    title: string;
    description: string;
    total_amount: string | number;
    priority: string;
    estimated_delivery_date: string | null;
  };
  pedidoId?: string;
  numeroPedido?: string;
};

export type CreateSolicitudCommentActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: SolicitudCommentFieldErrors;
  values?: {
    content: string;
  };
};
