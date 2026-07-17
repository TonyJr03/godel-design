import { Alert } from "@/components/ui";
import {
  STORAGE_FILE_CATEGORY_LABELS,
  type SolicitudFileListItem,
} from "@/lib/storage";
import { formatAppDateTime } from "@/lib/utils";

type SolicitudFilesPreviewProps = {
  solicitudId: string;
  files: readonly SolicitudFileListItem[];
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

export function SolicitudFilesPreview({
  solicitudId,
  files,
  loadError,
}: SolicitudFilesPreviewProps) {
  const previewFiles = files.slice(0, 3);
  const hiddenFilesCount = Math.max(files.length - previewFiles.length, 0);

  return (
    <section
      aria-labelledby="solicitud-files-preview-title"
      className="flex min-h-0 flex-col rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
    >
      <h2
        id="solicitud-files-preview-title"
        className="shrink-0 text-lg font-semibold text-text-primary"
      >
        Archivos recientes
      </h2>

      {loadError ? (
        <Alert variant="danger" className="mt-5">
          No se pudieron cargar los archivos de la solicitud.
        </Alert>
      ) : (
        <div className="mt-5 min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
          {previewFiles.length > 0 ? (
            <>
              <ul className="divide-y divide-border">
                {previewFiles.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-col gap-3 py-4 first:pt-0 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-all text-sm font-semibold text-text-primary">
                          {file.file_name}
                        </p>
                        <span className="inline-flex rounded-(--radius-control) border border-border bg-surface-muted px-2 py-1 text-xs font-semibold text-text-secondary">
                          {STORAGE_FILE_CATEGORY_LABELS[file.visibility] ??
                            "Archivo"}
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
                      className="inline-flex min-h-11 w-fit items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary-soft"
                    >
                      Descargar
                    </a>
                  </li>
                ))}
              </ul>

              {hiddenFilesCount > 0 ? (
                <p className="pt-3 text-xs leading-5 text-text-muted">
                  Y {hiddenFilesCount} archivos más.
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
              No hay archivos asociados a esta solicitud.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
