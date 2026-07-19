import { Download } from "lucide-react";

import { ReadErrorAlert } from "@/components/ui";
import {
  STORAGE_FILE_CATEGORY_LABELS,
  type SolicitudFileListItem,
} from "@/lib/storage";
import { formatAppDateTime } from "@/lib/utils";

type SolicitudFilesPanelProps = {
  solicitudId: string;
  files: readonly SolicitudFileListItem[];
  loadError?: string;
  loadErrorRetryable?: boolean;
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

function getFileTypeLabel(file: SolicitudFileListItem): string {
  if (file.file_type?.trim()) {
    return file.file_type;
  }

  const extension = file.file_name.split(".").at(-1);

  return extension ? `.${extension.toLowerCase()}` : "Tipo no disponible";
}

export function SolicitudFilesPanel({
  solicitudId,
  files,
  loadError,
  loadErrorRetryable = false,
}: SolicitudFilesPanelProps) {
  if (loadError) {
    return (
      <ReadErrorAlert
        variant="warning"
        title="No se pudieron cargar los archivos"
        retryable={loadErrorRetryable}
      >
        <p>{loadError}</p>
      </ReadErrorAlert>
    );
  }

  if (files.length === 0) {
    return (
      <p className="rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
        No hay archivos asociados a esta solicitud.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-all text-sm font-semibold text-text-primary">
                {file.file_name}
              </p>
              <span className="inline-flex rounded-(--radius-control) border border-border bg-surface-muted px-2 py-1 text-xs font-semibold text-text-secondary">
                {STORAGE_FILE_CATEGORY_LABELS[file.visibility] ?? "Archivo"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              {getFileTypeLabel(file)}
              {" · "}
              {formatFileSize(file.file_size)}
              {" · "}
              Subido el {formatAppDateTime(file.created_at)}
            </p>
          </div>

          <a
            href={`/dashboard/solicitudes/${solicitudId}/archivos/${file.id}/download`}
            className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary-soft"
          >
            <Download
              aria-hidden="true"
              className="h-4 w-4"
              strokeWidth={1.75}
            />
            Descargar
          </a>
        </li>
      ))}
    </ul>
  );
}
