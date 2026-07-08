import { Alert } from "@/components/ui";
import {
  STORAGE_FILE_CATEGORY_LABELS,
  type PedidoFileListItem,
} from "@/lib/storage";
import { formatAppDateTime } from "@/lib/utils";

type PedidoFilesPanelProps = {
  pedidoId: string;
  files: readonly PedidoFileListItem[];
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

function getUploaderLabel(file: PedidoFileListItem): string {
  if (file.visibility === "cliente_solicitud") {
    return "Cliente";
  }

  if (file.uploadedBy?.full_name?.trim()) {
    return file.uploadedBy.full_name;
  }

  return "Usuario interno";
}

function getSortedFiles(files: readonly PedidoFileListItem[]) {
  return [...files].sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  );
}

export function PedidoFilesPanel({
  pedidoId,
  files,
  loadError,
}: PedidoFilesPanelProps) {
  const sortedFiles = getSortedFiles(files);

  return (
    <div>
      {loadError ? (
        <Alert variant="danger">
          {loadError}
        </Alert>
      ) : null}

      {sortedFiles.length > 0 ? (
        <ul className="mt-5 divide-y divide-border">
          {sortedFiles.map((file) => (
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
                    {STORAGE_FILE_CATEGORY_LABELS[file.visibility] ??
                      "Archivo"}
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
    </div>
  );
}
