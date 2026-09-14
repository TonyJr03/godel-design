import type {
  PedidoCommentFieldErrors,
  PedidoEditFieldErrors,
  PedidoPaymentFieldErrors,
  PedidoStatusFieldErrors,
  PedidoTaskFieldErrors,
  PedidoWorkerFieldErrors,
  RemovePedidoWorkerFieldErrors,
} from "@/lib/pedidos";
import type { ApplyTaskTemplateFieldErrors } from "@/lib/task-templates";
import type {
  PedidoUploadReservation,
  UploadFinalizeResult,
} from "@/lib/storage/upload-control/types";

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

export type UpdatePedidoDataActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoEditFieldErrors;
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

export type ReservePedidoFilesActionInput = {
  candidates: Array<{
    name: string;
    size: number;
  }>;
};

export type ReservePedidoFilesActionResult =
  | {
      ok: true;
      reservation: PedidoUploadReservation;
    }
  | {
      ok: false;
      message: string;
    };

export type FinalizePedidoFileActionInput = {
  sessionId: string;
  itemId: string;
};

export type FinalizePedidoFileActionResult =
  | {
      ok: true;
      result: UploadFinalizeResult["result"];
    }
  | {
      ok: false;
      message: string;
    };

export type ReservePedidoFilesAction = (
  input: ReservePedidoFilesActionInput,
) => Promise<ReservePedidoFilesActionResult>;

export type FinalizePedidoFileAction = (
  input: FinalizePedidoFileActionInput,
) => Promise<FinalizePedidoFileActionResult>;

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
