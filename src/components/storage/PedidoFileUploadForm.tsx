"use client";

import {
  useState,
  useRef,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import type {
  FinalizePedidoFileAction,
  ReservePedidoFilesAction,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import type { PedidoStatus } from "@/lib/pedidos";
import {
  MAX_STORAGE_FILE_SIZE_BYTES,
  MAX_UPLOAD_SESSION_ITEMS,
  PPO03_MIME_BY_EXTENSION,
  PPO03_STORAGE_FILE_INPUT_ACCEPT,
} from "@/lib/storage/constants";
import { getFileExtension } from "@/lib/storage/file-name";
import { getPedidoFileVisibilityForStatus } from "@/lib/storage/file-validation";
import {
  getStorageAccessToken,
  uploadReservedFile,
} from "@/lib/storage/tus";
import type { ReservedUploadItem } from "@/lib/storage/upload-control/types";
import { Alert, Button } from "@/components/ui";

type PedidoFileUploadFormProps = {
  reserveFilesAction: ReservePedidoFilesAction;
  finalizeFileAction: FinalizePedidoFileAction;
  pedidoStatus: PedidoStatus;
  canUpload: boolean;
  presentation?: "card" | "panel";
};

type UploadStatus =
  | "queued"
  | "uploading"
  | "finalizing"
  | "completed"
  | "failed";

type UploadEntry = {
  id: string;
  file: File;
  sessionId: string;
  item: ReservedUploadItem;
  status: UploadStatus;
  bytesSent: number;
  bytesTotal: number;
  error?: string;
  tusCompleted: boolean;
};

const MAX_CONCURRENT_UPLOADS = 2;

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

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getBrowserValidationMessage(files: readonly File[]) {
  if (files.length < 1 || files.length > MAX_UPLOAD_SESSION_ITEMS) {
    return `Selecciona entre 1 y ${MAX_UPLOAD_SESSION_ITEMS} archivos.`;
  }

  for (const file of files) {
    if (!file.name.trim() || file.size <= 0) {
      return "Cada archivo debe tener un nombre y contenido válido.";
    }

    if (file.size > MAX_STORAGE_FILE_SIZE_BYTES) {
      return `Cada archivo puede pesar como máximo ${formatFileSize(MAX_STORAGE_FILE_SIZE_BYTES)}.`;
    }

    const extension = getFileExtension(file.name);
    if (!extension || !(extension in PPO03_MIME_BY_EXTENSION)) {
      return "Selecciona archivos PDF, imagen, documento, ZIP, RAR o CDR permitidos.";
    }
  }

  return null;
}

function statusLabel(status: UploadStatus) {
  const labels: Record<UploadStatus, string> = {
    queued: "En cola",
    uploading: "Subiendo",
    finalizing: "Registrando",
    completed: "Completado",
    failed: "Requiere reintento",
  };

  return labels[status];
}

function getBatchSummary(entries: readonly UploadEntry[]) {
  if (entries.length === 0) return null;

  const completed = entries.filter((entry) => entry.status === "completed").length;
  const failed = entries.filter((entry) => entry.status === "failed").length;
  const active = entries.length - completed - failed;

  if (active > 0) return null;
  if (failed === 0) {
    return {
      variant: "success" as const,
      title: "Carga completada",
      message: `${completed} ${completed === 1 ? "archivo subido correctamente." : "archivos subidos correctamente."}`,
    };
  }
  if (completed === 0) {
    return {
      variant: "danger" as const,
      title: "La carga necesita reintento",
      message: `${failed} ${failed === 1 ? "archivo necesita reintento." : "archivos necesitan reintento."}`,
    };
  }

  return {
    variant: "warning" as const,
    title: "Carga completada parcialmente",
    message: `${completed} ${completed === 1 ? "archivo completado" : "archivos completados"}. ${failed} ${failed === 1 ? "archivo necesita reintento." : "archivos necesitan reintento."}`,
  };
}

export function PedidoFileUploadForm({
  reserveFilesAction,
  finalizeFileAction,
  pedidoStatus,
  canUpload,
  presentation = "card",
}: PedidoFileUploadFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [isReserving, setIsReserving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const visibilityResult = getPedidoFileVisibilityForStatus(pedidoStatus);
  const canShowUploadForm = canUpload && visibilityResult.ok;
  const uploadContextMessage = getUploadContextMessage(pedidoStatus);
  const isPanel = presentation === "panel";
  const titleId = "pedido-file-upload-title";
  const fileInputId = isPanel ? "pedido-file-panel" : "pedido-file";
  const shouldShowUploadContext = !isPanel || !visibilityResult.ok;
  const hasActiveUploads = entries.some(
    (entry) => entry.status === "queued" || entry.status === "uploading" || entry.status === "finalizing",
  );
  const batchSummary = getBatchSummary(entries);

  function updateEntry(id: string, update: (entry: UploadEntry) => UploadEntry) {
    setEntries((current) => current.map((entry) => (
      entry.id === id ? update(entry) : entry
    )));
  }

  function failEntry(
    entry: UploadEntry,
    tusCompleted: boolean,
    error: string,
  ) {
    updateEntry(entry.id, (current) => ({
      ...current,
      status: "failed",
      tusCompleted,
      error,
    }));
  }

  async function processEntry(entry: UploadEntry, refreshAfterCompletion: boolean) {
    let tusCompleted = entry.tusCompleted;

    if (!tusCompleted) {
      updateEntry(entry.id, (current) => ({
        ...current,
        status: "uploading",
        error: undefined,
      }));

      let accessToken: string | null;
      try {
        accessToken = await getStorageAccessToken();
      } catch {
        failEntry(
          entry,
          false,
          "No se pudo validar tu sesión para transferir el archivo. Inicia sesión nuevamente.",
        );
        return;
      }

      if (!accessToken) {
        failEntry(
          entry,
          false,
          "No se pudo validar tu sesión para transferir el archivo. Inicia sesión nuevamente.",
        );
        return;
      }

      let upload;
      try {
        upload = await uploadReservedFile({
          file: entry.file,
          item: entry.item,
          authorization: { mode: "authenticated", accessToken },
          onProgress: (bytesSent, bytesTotal) => {
            updateEntry(entry.id, (current) => ({
              ...current,
              bytesSent,
              bytesTotal,
            }));
          },
        });
      } catch {
        failEntry(
          entry,
          false,
          "No se pudo transferir el archivo. Puedes reintentar con la misma reserva.",
        );
        return;
      }

      if (!upload.ok) {
        failEntry(
          entry,
          false,
          upload.reason === "file_mismatch"
            ? "El archivo ya no coincide con su reserva. Selecciónalo nuevamente."
            : "No se pudo transferir el archivo. Puedes reintentar con la misma reserva.",
        );
        return;
      }

      tusCompleted = true;
    }

    updateEntry(entry.id, (current) => ({
      ...current,
      status: "finalizing",
      bytesSent: current.bytesTotal,
      tusCompleted,
      error: undefined,
    }));
    let finalize;
    try {
      finalize = await finalizeFileAction({
        sessionId: entry.sessionId,
        itemId: entry.item.itemId,
      });
    } catch {
      failEntry(
        entry,
        true,
        "No se pudo registrar el archivo. Puedes reintentar sin volver a transferirlo.",
      );
      return;
    }

    if (!finalize.ok) {
      failEntry(entry, tusCompleted, finalize.message);
      return;
    }

    updateEntry(entry.id, (current) => ({
      ...current,
      status: "completed",
      bytesSent: current.bytesTotal,
      tusCompleted: true,
      error: undefined,
    }));

    if (refreshAfterCompletion) router.refresh();
  }

  async function runQueue(queue: UploadEntry[]) {
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < queue.length) {
        const entry = queue[nextIndex];
        nextIndex += 1;
        try {
          await processEntry(entry, false);
        } catch {
          failEntry(
            entry,
            entry.tusCompleted,
            "No se pudo completar la carga. Puedes reintentar este archivo.",
          );
        }
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(MAX_CONCURRENT_UPLOADS, queue.length) },
          () => worker(),
        ),
      );
    } finally {
      router.refresh();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReserving || hasActiveUploads) return;

    const files = Array.from(inputRef.current?.files ?? []);
    const validationMessage = getBrowserValidationMessage(files);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setIsReserving(true);
    setMessage(null);
    try {
      const reservationResult = await reserveFilesAction({
        candidates: files.map((file) => ({ name: file.name, size: file.size })),
      });

      if (!reservationResult.ok) {
        setMessage(reservationResult.message);
        return;
      }

      const items = [...reservationResult.reservation.items].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      );
      const reservationMatchesFiles = items.length === files.length && items.every(
        (item, index) => item.originalName === files[index]?.name && item.expectedSize === files[index]?.size,
      );
      if (!reservationMatchesFiles) {
        setMessage("La reserva no coincide con los archivos seleccionados. Selecciónalos nuevamente.");
        return;
      }

      const queue = files.map((file, index) => {
        const item = items[index];
        return {
          id: `${item.itemId}:${index}`,
          file,
          sessionId: reservationResult.reservation.sessionId,
          item,
          status: "queued" as const,
          bytesSent: 0,
          bytesTotal: file.size,
          tusCompleted: false,
        };
      });
      setEntries(queue);
      setSelectedFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      void runQueue(queue).catch(() => {
        setMessage("No se pudo completar la ronda de carga. Reintenta los archivos pendientes.");
      });
    } catch {
      setMessage("No se pudo iniciar la carga. Inténtalo nuevamente.");
    } finally {
      setIsReserving(false);
    }
  }

  async function retryEntry(entry: UploadEntry) {
    if (hasActiveUploads) return;
    try {
      await processEntry(entry, true);
    } catch {
      failEntry(
        entry,
        entry.tusCompleted,
        "No se pudo completar la carga. Puedes reintentar este archivo.",
      );
    }
  }

  return (
    <section
      aria-label={isPanel ? "Subir archivos" : undefined}
      aria-labelledby={isPanel ? undefined : titleId}
      className={
        isPanel
          ? "min-w-0"
          : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
      }
    >
      {!isPanel ? (
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">
            Subir archivos
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Agrega archivos internos, avances o entregables según el estado actual.
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
        <form onSubmit={handleSubmit} aria-busy={isReserving || hasActiveUploads} className={shouldShowUploadContext ? "mt-5" : ""}>
          {message ? (
            <Alert variant="danger" title="No se pudo iniciar la carga" aria-live="polite">
              <p>{message}</p>
            </Alert>
          ) : null}

          <div className={[message || !isPanel ? "mt-4" : "", "grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"].filter(Boolean).join(" ")}>
            <div>
              <label htmlFor={fileInputId} className="text-sm font-medium text-text-primary">
                Archivos
              </label>
              <input
                ref={inputRef}
                id={fileInputId}
                type="file"
                accept={PPO03_STORAGE_FILE_INPUT_ACCEPT}
                multiple
                required
                disabled={isReserving || hasActiveUploads}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  setSelectedFiles(files);
                  setMessage(getBrowserValidationMessage(files));
                }}
                className="mt-2 block min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface text-sm text-text-primary shadow-(--shadow-soft) file:mr-4 file:min-h-11 file:border-0 file:bg-surface-muted file:px-4 file:text-sm file:font-semibold file:text-text-primary hover:file:bg-brand-primary-soft disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
              />
              <p className="mt-2 text-xs leading-5 text-text-muted">
                Hasta {MAX_UPLOAD_SESSION_ITEMS} archivos por carga y {formatFileSize(MAX_STORAGE_FILE_SIZE_BYTES)} por archivo.
                {selectedFiles.length > 0 ? ` ${selectedFiles.length} seleccionados.` : ""}
              </p>
            </div>
            <Button type="submit" disabled={isReserving || hasActiveUploads} className="w-full lg:w-auto">
              {isReserving ? "Preparando carga..." : hasActiveUploads ? "Cargando archivos..." : "Subir archivos"}
            </Button>
          </div>
        </form>
      ) : null}

      {entries.length > 0 ? (
        <div className={canShowUploadForm ? "mt-5" : "mt-4"} aria-live="polite">
          {batchSummary ? (
            <Alert variant={batchSummary.variant} title={batchSummary.title} className="mb-4">
              <p>{batchSummary.message}</p>
            </Alert>
          ) : null}
          <h3 className="text-sm font-semibold text-text-primary">Estado de carga</h3>
          <ul className="mt-3 divide-y divide-border rounded-(--radius-control) border border-border">
            {entries.map((entry) => {
              const progress = entry.bytesTotal > 0
                ? Math.min(100, Math.round((entry.bytesSent / entry.bytesTotal) * 100))
                : 0;
              return (
                <li key={entry.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-text-primary">{entry.file.name}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {statusLabel(entry.status)} · {progress}%
                    </p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={`Progreso de ${entry.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                      <div className="h-full bg-brand-primary transition-[width]" style={{ width: `${progress}%` }} />
                    </div>
                    {entry.error ? <p className="mt-2 text-xs leading-5 text-danger">{entry.error}</p> : null}
                  </div>
                  {entry.status === "failed" ? (
                    <Button type="button" variant="secondary" size="sm" disabled={hasActiveUploads} onClick={() => void retryEntry(entry)}>
                      Reintentar
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
