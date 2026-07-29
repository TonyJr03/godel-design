import { ReadErrorAlert } from "@/components/ui";
import {
  STORAGE_FILE_CATEGORY_LABELS,
  type PedidoFileListItem,
} from "@/lib/storage";
import { formatAppDateTime } from "@/lib/utils";

type PedidoFilesPreviewProps = {
  pedidoId: string;
  files: readonly PedidoFileListItem[];
  loadError?: string;
  loadErrorRetryable?: boolean;
};

function getUploaderLabel(file: PedidoFileListItem): string {
  if (file.visibility === "cliente_solicitud") {
    return "Cliente";
  }

  if (file.uploadedBy?.full_name?.trim()) {
    return file.uploadedBy.full_name;
  }

  return "Usuario interno";
}

function getWorkspaceFiles(files: readonly PedidoFileListItem[]) {
  return [...files].sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  );
}

export function PedidoFilesPreview({
  pedidoId,
  files,
  loadError,
  loadErrorRetryable = false,
}: PedidoFilesPreviewProps) {
  const workspaceFiles = getWorkspaceFiles(files);

  return (
    <section
      aria-labelledby="pedido-files-preview-title"
      className="flex min-h-0 flex-col rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6 xl:h-full xl:overflow-hidden"
    >
      <h2
        id="pedido-files-preview-title"
        className="shrink-0 text-lg font-semibold text-text-primary"
      >
        Archivos asociados
      </h2>

      {loadError ? (
        <ReadErrorAlert
          variant="warning"
          title="No se pudieron cargar los archivos"
          retryable={loadErrorRetryable}
          className="mt-5"
        >
          <p>{loadError}</p>
        </ReadErrorAlert>
      ) : (
        <div className="mt-5 min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
          {workspaceFiles.length > 0 ? (
            <ul className="divide-y divide-border">
              {workspaceFiles.map((file) => (
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
                      Subido el {formatAppDateTime(file.created_at)}
                      {" · "}
                      {getUploaderLabel(file)}
                    </p>
                  </div>

                  <a
                    href={`/dashboard/pedidos/${pedidoId}/archivos/${file.id}/download`}
                    className="inline-flex min-h-11 w-fit items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary-soft"
                  >
                    Descargar
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
              No hay archivos asociados a este pedido.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
