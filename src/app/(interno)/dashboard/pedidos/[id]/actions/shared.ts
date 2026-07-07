import type {
  PedidoCommentFieldErrors,
  PedidoPaymentFieldErrors,
  PedidoStatusFieldErrors,
  PedidoTaskFieldErrors,
  PedidoWorkerFieldErrors,
  RemovePedidoWorkerFieldErrors,
} from "@/lib/pedidos";
import type { ApplyTaskTemplateFieldErrors } from "@/lib/task-templates";

export type PedidoDetailAction<State> = (
  prevState: State,
  formData: FormData,
) => Promise<State>;

export type UpdatePedidoStatusActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoStatusFieldErrors;
};

export type UpdatePedidoPaymentActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoPaymentFieldErrors;
  values?: {
    paidCashAmount: string;
    paidTransferAmount: string;
  };
};

export type AssignPedidoWorkerActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoWorkerFieldErrors;
};

export type RemovePedidoWorkerActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: RemovePedidoWorkerFieldErrors;
};

export type UploadPedidoFileActionState = {
  ok: boolean;
  message: string;
};

export type CreatePedidoCommentActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoCommentFieldErrors;
  values?: {
    content: string;
  };
};

export type PedidoTaskActionValues = {
  title?: string;
  completedQuantity?: string;
};

export type CreatePedidoTaskActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoTaskFieldErrors;
  values?: PedidoTaskActionValues;
};

export type UpdatePedidoTaskTitleActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoTaskFieldErrors;
  values?: PedidoTaskActionValues;
};

export type UpdatePedidoTaskProgressActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoTaskFieldErrors;
  values?: PedidoTaskActionValues;
};

export type TogglePedidoTaskCompletionActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoTaskFieldErrors;
};

export type DeletePedidoTaskActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoTaskFieldErrors;
};

export type ApplyTaskTemplateActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: ApplyTaskTemplateFieldErrors;
};
