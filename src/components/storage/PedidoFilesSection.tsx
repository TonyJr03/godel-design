"use client";

import { useActionState } from "react";
import type {
  PedidoDetailAction,
  UploadPedidoFileActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import type { PedidoFileListItem } from "@/lib/storage";
import type { PedidoStatus } from "@/lib/pedidos";
import { STORAGE_FILE_INPUT_ACCEPT } from "@/lib/storage/constants";
import { getPedidoFileVisibilityForStatus } from "@/lib/storage/file-validation";
import { STORAGE_FILE_CATEGORY_LABELS } from "@/lib/storage/labels";
import { formatAppDateTime } from "@/lib/utils";

type PedidoFilesSectionProps = {
  pedidoId: string;
  uploadFileAction: PedidoDetailAction<UploadPedidoFileActionState>;
  pedidoStatus: PedidoStatus;
  files: PedidoFileListItem[];
  canUpload: boolean;
  loadError?: string;
};

const initialState: UploadPedidoFileActionState = {
  ok: false,
  message: "",
};

function formatFileSize(value: number | null): string {
  if (!value || value <= 0) {
    return "Tamaño no disponible";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getUploaderLabel(file: PedidoFileListItem): string {
  if (file.visibility === "cliente_solicitud") {
    return "Cliente";
  }

  if (file.uploadedBy?.full_name?.trim()) {
    return file.uploadedBy.full_name;
  }

  return "Usuario interno";
}

function getCategoryLabel(category: PedidoFileListItem["visibility"]): string {
  return STORAGE_FILE_CATEGORY_LABELS[category] ?? "Archivo";
}

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

export function PedidoFilesSection({
  pedidoId,
  uploadFileAction,
  pedidoStatus,
  files,
  canUpload,
  loadError,
}: PedidoFilesSectionProps) {
  const [state, formAction, pending] = useActionState(
    uploadFileAction,
    initialState,
  );
  const visibilityResult = getPedidoFileVisibilityForStatus(pedidoStatus);
  const canShowUploadForm = canUpload && visibilityResult.ok;
  const uploadContextMessage = getUploadContextMessage(pedidoStatus);

  return (
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Archivos del pedido
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Archivos privados asociados a este pedido.
          </p>
        </div>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">
          {loadError}
        </p>
      ) : null}

      <p
        className={`mt-5 rounded-md border px-4 py-3 text-sm leading-6 ${
          visibilityResult.ok
            ? "border-info/30 bg-info-soft text-text-primary"
            : "border-border bg-surface-muted text-text-secondary"
        }`}
      >
        {uploadContextMessage}
      </p>

      {files.length > 0 ? (
        <ul className="mt-5 divide-y divide-border">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-all text-sm font-semibold text-text-primary">
                    {file.file_name}
                  </p>
                  <span className="inline-flex rounded-(--radius-control) border border-border bg-surface-muted px-2 py-1 text-xs font-semibold text-text-secondary">
                    {getCategoryLabel(file.visibility)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {formatFileSize(file.file_size)}
                  {" · "}
                  Subido el {formatAppDateTime(file.created_at)}
                  {" · "}
                  {getUploaderLabel(file)}
                </p>
                {file.file_type ? (
                  <p className="mt-1 text-xs text-text-muted">
                    {file.file_type}
                  </p>
                ) : null}
              </div>

              <a
                href={`/dashboard/pedidos/${pedidoId}/archivos/${file.id}/download`}
                className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary-soft"
              >
                Descargar
              </a>
            </li>
          ))}
        </ul>
      ) : !loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
          No hay archivos asociados a este pedido.
        </p>
      ) : null}

      {canShowUploadForm ? (
        <form
          action={formAction}
          aria-busy={pending}
          className="mt-6 border-t border-border pt-5"
        >
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
                htmlFor="pedido-file"
                className="text-sm font-medium text-text-primary"
              >
                Archivo
              </label>
              <input
                id="pedido-file"
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
              className="inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
            >
              {pending ? "Subiendo..." : "Subir archivo"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
