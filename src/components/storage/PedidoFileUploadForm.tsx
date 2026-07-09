"use client";

import { useActionState } from "react";
import type {
  PedidoDetailAction,
  UploadPedidoFileActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import type { PedidoStatus } from "@/lib/pedidos";
import { STORAGE_FILE_INPUT_ACCEPT } from "@/lib/storage/constants";
import { getPedidoFileVisibilityForStatus } from "@/lib/storage/file-validation";

type PedidoFileUploadFormProps = {
  uploadFileAction: PedidoDetailAction<UploadPedidoFileActionState>;
  pedidoStatus: PedidoStatus;
  canUpload: boolean;
  presentation?: "card" | "panel";
};

const initialState: UploadPedidoFileActionState = {
  ok: false,
  message: "",
};

function getUploadContextMessage(status: PedidoStatus): string {
  const result = getPedidoFileVisibilityForStatus(status);

  if (!result.ok) {
    if (result.reason === "pedido_delivered") {
      return "Este pedido ya fue entregado y no admite nuevas subidas de archivos.";
    }

    if (result.reason === "pedido_canceled") {
      return "Este pedido fue cancelado y no admite nuevas subidas de archivos.";
    }

    return result.message;
  }

  if (result.visibility === "interno_pedido") {
    return "Los archivos se guardarán como internos del pedido.";
  }

  if (result.visibility === "avance") {
    return "Los archivos se guardarán como avances del pedido.";
  }

  return "Los archivos se guardarán como archivos finales de entrega.";
}

export function PedidoFileUploadForm({
  uploadFileAction,
  pedidoStatus,
  canUpload,
  presentation = "card",
}: PedidoFileUploadFormProps) {
  const [state, formAction, pending] = useActionState(
    uploadFileAction,
    initialState,
  );
  const visibilityResult = getPedidoFileVisibilityForStatus(pedidoStatus);
  const canShowUploadForm = canUpload && visibilityResult.ok;
  const uploadContextMessage = getUploadContextMessage(pedidoStatus);
  const isPanel = presentation === "panel";
  const titleId = isPanel
    ? "pedido-file-upload-panel-title"
    : "pedido-file-upload-title";
  const fileInputId = isPanel ? "pedido-file-panel" : "pedido-file";
  const Heading = isPanel ? "h3" : "h2";

  return (
    <section
      aria-labelledby={titleId}
      className={
        isPanel
          ? "min-w-0"
          : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
      }
    >
      <div>
        <Heading
          id={titleId}
          className={
            isPanel
              ? "text-base font-semibold text-text-primary"
              : "text-lg font-semibold text-text-primary"
          }
        >
          {isPanel ? "Subir nuevo archivo" : "Subir archivo"}
        </Heading>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Agrega archivos internos, avances o entregables según el estado
          actual.
        </p>
      </div>

      <p
        className={`mt-5 rounded-md border px-4 py-3 text-sm leading-6 ${
          visibilityResult.ok
            ? "border-info/30 bg-info-soft text-text-primary"
            : "border-border bg-surface-muted text-text-secondary"
        }`}
      >
        {uploadContextMessage}
      </p>

      {canShowUploadForm ? (
        <form action={formAction} aria-busy={pending} className="mt-5">
          {state.message ? (
            <div
              className={
                state.ok
                  ? "rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3 text-sm leading-6 text-success"
                  : "rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger"
              }
              role={state.ok ? "status" : "alert"}
              aria-live="polite"
            >
              {state.message}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <label
                htmlFor={fileInputId}
                className="text-sm font-medium text-text-primary"
              >
                Archivo
              </label>
              <input
                id={fileInputId}
                name="file"
                type="file"
                accept={STORAGE_FILE_INPUT_ACCEPT}
                required
                disabled={pending}
                className="mt-2 block min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface text-sm text-text-primary shadow-(--shadow-soft) file:mr-4 file:min-h-11 file:border-0 file:bg-surface-muted file:px-4 file:text-sm file:font-semibold file:text-text-primary hover:file:bg-brand-primary-soft disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
            >
              {pending ? "Subiendo..." : "Subir archivo"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
