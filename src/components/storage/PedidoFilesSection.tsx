"use client";

import { useActionState } from "react";
import {
  uploadPedidoFileAction,
  type UploadPedidoFileActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import type { PedidoFileListItem } from "@/lib/storage";
import type { PedidoStatus } from "@/lib/pedidos";
import { STORAGE_FILE_INPUT_ACCEPT } from "@/lib/storage/constants";
import { getPedidoFileVisibilityForStatus } from "@/lib/storage/file-validation";
import { STORAGE_FILE_CATEGORY_LABELS } from "@/lib/storage/labels";
import { formatAppDateTime } from "@/lib/utils";

type PedidoFilesSectionProps = {
  pedidoId: string;
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
  pedidoStatus,
  files,
  canUpload,
  loadError,
}: PedidoFilesSectionProps) {
  const [state, formAction, pending] = useActionState(
    uploadPedidoFileAction,
    initialState,
  );
  const visibilityResult = getPedidoFileVisibilityForStatus(pedidoStatus);
  const canShowUploadForm = canUpload && visibilityResult.ok;
  const uploadContextMessage = getUploadContextMessage(pedidoStatus);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-950">
            Archivos del pedido
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Archivos privados asociados a este pedido.
          </p>
        </div>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
          {loadError}
        </p>
      ) : null}

      <p
        className={`mt-5 rounded-md border px-4 py-3 text-sm leading-6 ${
          visibilityResult.ok
            ? "border-teal-200 bg-teal-50 text-teal-950"
            : "border-zinc-200 bg-zinc-50 text-zinc-700"
        }`}
      >
        {uploadContextMessage}
      </p>

      {files.length > 0 ? (
        <ul className="mt-5 divide-y divide-zinc-100">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-all text-sm font-semibold text-zinc-950">
                    {file.file_name}
                  </p>
                  <span className="inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200">
                    {getCategoryLabel(file.visibility)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {formatFileSize(file.file_size)}
                  {" · "}
                  Subido el {formatAppDateTime(file.created_at)}
                  {" · "}
                  {getUploaderLabel(file)}
                </p>
                {file.file_type ? (
                  <p className="mt-1 text-xs text-zinc-400">
                    {file.file_type}
                  </p>
                ) : null}
              </div>

              <a
                href={`/dashboard/pedidos/${pedidoId}/archivos/${file.id}/download`}
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
              >
                Descargar
              </a>
            </li>
          ))}
        </ul>
      ) : !loadError ? (
        <p className="mt-5 rounded-md border border-dashed border-zinc-300 px-4 py-3 text-sm leading-6 text-zinc-600">
          No hay archivos asociados a este pedido.
        </p>
      ) : null}

      {canShowUploadForm ? (
        <form
          action={formAction}
          aria-busy={pending}
          className="mt-6 border-t border-zinc-200 pt-5"
        >
          <input type="hidden" name="pedido_id" value={pedidoId} />

          {state.message ? (
            <div
              className={
                state.ok
                  ? "rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900"
                  : "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
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
                className="text-sm font-medium text-zinc-900"
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
                className="mt-2 block w-full rounded-md border border-zinc-300 bg-white text-sm text-zinc-950 shadow-sm file:mr-4 file:min-h-10 file:border-0 file:bg-zinc-100 file:px-4 file:text-sm file:font-semibold file:text-zinc-700 hover:file:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {pending ? "Subiendo..." : "Subir archivo"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
