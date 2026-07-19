"use client";

import { useActionState } from "react";
import type {
  PedidoDetailAction,
  UploadPedidoFileActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import type { PedidoStatus } from "@/lib/pedidos";
import { STORAGE_FILE_INPUT_ACCEPT } from "@/lib/storage/constants";
import { getPedidoFileVisibilityForStatus } from "@/lib/storage/file-validation";
import { Alert, Button } from "@/components/ui";

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
  const titleId = "pedido-file-upload-title";
  const fileInputId = isPanel ? "pedido-file-panel" : "pedido-file";
  const shouldShowUploadContext = !isPanel || !visibilityResult.ok;

  return (
    <section
      aria-label={isPanel ? "Subir archivo" : undefined}
      aria-labelledby={isPanel ? undefined : titleId}
      className={
        isPanel
          ? "min-w-0"
          : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
      }
    >
      {!isPanel ? (
        <div>
          <h2
            id={titleId}
            className="text-lg font-semibold text-text-primary"
          >
            Subir archivo
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Agrega archivos internos, avances o entregables según el estado
            actual.
          </p>
        </div>
      ) : null}

      {shouldShowUploadContext ? (
        <p
          className={`${isPanel ? "" : "mt-5"} rounded-md border text-sm leading-6 ${
            visibilityResult.ok
              ? "border-info/30 bg-info-soft px-4 py-3 text-text-primary"
              : "border-border bg-surface-muted px-4 py-3 text-text-secondary"
          }`}
        >
          {uploadContextMessage}
        </p>
      ) : null}

      {canShowUploadForm ? (
        <form
          action={formAction}
          aria-busy={pending}
          className={shouldShowUploadContext ? "mt-5" : ""}
        >
          {state.message ? (
            <Alert
              variant={state.ok ? "success" : "danger"}
              title={state.ok ? "Archivo subido" : "No se pudo subir el archivo"}
              aria-live="polite"
            >
              <p>{state.message}</p>
            </Alert>
          ) : null}

          <div
            className={[
              state.message || !isPanel ? "mt-4" : "",
              "grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end",
            ]
              .filter(Boolean)
              .join(" ")}
          >
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

            <Button
              type="submit"
              disabled={pending}
              className="w-full lg:w-auto"
            >
              {pending ? "Subiendo archivo..." : "Subir archivo"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
