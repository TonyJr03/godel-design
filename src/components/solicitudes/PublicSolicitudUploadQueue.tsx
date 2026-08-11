"use client";

import { useEffect, useRef, useState } from "react";
import {
  finalizePublicSolicitudFileAction,
  signPublicSolicitudFileAction,
} from "@/app/(publico)/solicitud/actions";
import { Alert, Button } from "@/components/ui";
import { uploadReservedFile } from "@/lib/storage/tus";
import type {
  PublicUploadReservation,
  ReservedUploadItem,
} from "@/lib/storage/upload-control/types";

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

type PublicSolicitudUploadQueueProps = {
  reservation: PublicUploadReservation;
  files: File[];
};

const MAX_CONCURRENT_UPLOADS = 2;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: UploadStatus) {
  const labels: Record<UploadStatus, string> = {
    queued: "En cola",
    uploading: "Adjuntando",
    finalizing: "Registrando",
    completed: "Recibido",
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
      title: "Solicitud enviada correctamente",
      message: `Archivos recibidos: ${completed}`,
    };
  }
  if (completed === 0) {
    return {
      variant: "warning" as const,
      title: "La solicitud fue registrada, pero los archivos necesitan reintento",
      message: `${failed} ${failed === 1 ? "archivo requiere reintento." : "archivos requieren reintento."}`,
    };
  }

  return {
    variant: "warning" as const,
    title: "Solicitud registrada con archivos pendientes",
    message: `${completed} ${completed === 1 ? "archivo recibido." : "archivos recibidos."} ${failed} ${failed === 1 ? "archivo requiere reintento." : "archivos requieren reintento."}`,
  };
}

function buildQueue(
  reservation: PublicUploadReservation,
  files: readonly File[],
): UploadEntry[] | null {
  const items = [...reservation.items].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const matches = items.length === files.length && items.every(
    (item, index) => (
      item.originalName === files[index]?.name
      && item.expectedSize === files[index]?.size
    ),
  );
  if (!matches) return null;

  return files.map((file, index) => {
    const item = items[index];
    return {
      id: `${item.itemId}:${index}`,
      file,
      sessionId: reservation.sessionId,
      item,
      status: "queued",
      bytesSent: 0,
      bytesTotal: file.size,
      tusCompleted: false,
    };
  });
}

export function PublicSolicitudUploadQueue({
  reservation,
  files,
}: PublicSolicitudUploadQueueProps) {
  const [initialQueue] = useState<UploadEntry[] | null>(() => (
    buildQueue(reservation, files)
  ));
  const hasStartedRef = useRef(false);
  const runQueueRef = useRef<(queue: UploadEntry[]) => Promise<void>>(undefined);
  const [entries, setEntries] = useState<UploadEntry[]>(() => initialQueue ?? []);
  const hasActiveUploads = entries.some(
    (entry) => (
      entry.status === "queued"
      || entry.status === "uploading"
      || entry.status === "finalizing"
    ),
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

  async function processEntry(entry: UploadEntry) {
    let tusCompleted = entry.tusCompleted;

    if (!tusCompleted) {
      updateEntry(entry.id, (current) => ({
        ...current,
        status: "uploading",
        error: undefined,
      }));

      let signing;
      try {
        signing = await signPublicSolicitudFileAction({
          sessionId: entry.sessionId,
          itemId: entry.item.itemId,
          capability: reservation.capability,
        });
      } catch {
        failEntry(
          entry,
          false,
          "No se pudo autorizar la carga. Puedes reintentar este archivo.",
        );
        return;
      }

      if (!signing.ok) {
        failEntry(entry, false, signing.message);
        return;
      }

      let upload;
      try {
        upload = await uploadReservedFile({
          file: entry.file,
          item: entry.item,
          authorization: { mode: "public", signature: signing.signature },
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

    let finalized;
    try {
      finalized = await finalizePublicSolicitudFileAction({
        sessionId: entry.sessionId,
        itemId: entry.item.itemId,
        capability: reservation.capability,
      });
    } catch {
      failEntry(
        entry,
        true,
        "No se pudo registrar el archivo. Puedes reintentar sin volver a transferirlo.",
      );
      return;
    }

    if (!finalized.ok) {
      failEntry(entry, tusCompleted, finalized.message);
      return;
    }

    updateEntry(entry.id, (current) => ({
      ...current,
      status: "completed",
      bytesSent: current.bytesTotal,
      tusCompleted: true,
      error: undefined,
    }));
  }

  async function runQueue(queue: UploadEntry[]) {
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < queue.length) {
        const entry = queue[nextIndex];
        nextIndex += 1;
        try {
          await processEntry(entry);
        } catch {
          failEntry(
            entry,
            entry.tusCompleted,
            "No se pudo completar la carga. Puedes reintentar este archivo.",
          );
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(MAX_CONCURRENT_UPLOADS, queue.length) },
        () => worker(),
      ),
    );
  }

  useEffect(() => {
    runQueueRef.current = runQueue;
  });

  useEffect(() => {
    const executeQueue = runQueueRef.current;
    if (!initialQueue || !executeQueue || hasStartedRef.current) return;
    hasStartedRef.current = true;
    void executeQueue(initialQueue);
  }, [initialQueue]);

  async function retryEntry(entry: UploadEntry) {
    if (hasActiveUploads) return;
    try {
      await processEntry(entry);
    } catch {
      failEntry(
        entry,
        entry.tusCompleted,
        "No se pudo completar la carga. Puedes reintentar este archivo.",
      );
    }
  }

  if (!initialQueue) {
    return (
      <Alert variant="warning" title="Solicitud registrada" aria-live="polite">
        <p>
          La reserva no coincide con los archivos seleccionados. No se transfirió
          ningún archivo y no se creó una nueva solicitud.
        </p>
      </Alert>
    );
  }

  return (
    <section className="mt-5" aria-live="polite" aria-label="Estado de archivos">
      <Alert variant="info" title="Solicitud registrada" className="mb-4">
        <p>Estamos adjuntando tus archivos.</p>
      </Alert>

      {batchSummary ? (
        <Alert variant={batchSummary.variant} title={batchSummary.title} className="mb-4">
          <p>{batchSummary.message}</p>
        </Alert>
      ) : null}

      <h2 className="text-base font-semibold text-text-primary">Estado de archivos</h2>
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
                  {statusLabel(entry.status)} · {progress}% · {formatFileSize(entry.bytesTotal)}
                </p>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted"
                  role="progressbar"
                  aria-label={`Progreso de ${entry.file.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <div className="h-full bg-brand-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                {entry.error ? <p className="mt-2 text-xs leading-5 text-danger">{entry.error}</p> : null}
              </div>
              {entry.status === "failed" ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={hasActiveUploads}
                  onClick={() => void retryEntry(entry)}
                >
                  Reintentar
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
