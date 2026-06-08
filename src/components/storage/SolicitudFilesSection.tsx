import {
  type SolicitudFileListItem,
} from "@/lib/storage";
import { STORAGE_FILE_CATEGORY_LABELS } from "@/lib/storage/labels";
import { formatAppDateTime } from "@/lib/utils";

type SolicitudFilesSectionProps = {
  solicitudId: string;
  files: SolicitudFileListItem[];
  loadError?: string;
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

export function SolicitudFilesSection({
  solicitudId,
  files,
  loadError,
}: SolicitudFilesSectionProps) {
  return (
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Archivos de la solicitud
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Archivos privados enviados como referencia para esta solicitud.
        </p>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">
          {loadError}
        </p>
      ) : null}

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
                    {STORAGE_FILE_CATEGORY_LABELS[file.visibility]}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {formatFileSize(file.file_size)}
                  {" · "}
                  Subido el {formatAppDateTime(file.created_at)}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {getFileTypeLabel(file)}
                </p>
              </div>

              <a
                href={`/dashboard/solicitudes/${solicitudId}/archivos/${file.id}/download`}
                className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary-soft"
              >
                Descargar
              </a>
            </li>
          ))}
        </ul>
      ) : !loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
          No hay archivos asociados a esta solicitud.
        </p>
      ) : null}
    </section>
  );
}
