import { Alert } from "@/components/ui";
import { STORAGE_FILE_CATEGORY_LABELS, type PedidoFileListItem } from "@/lib/storage";
import { formatAppDateTime } from "@/lib/utils";

type PedidoFilesPreviewProps = {
  pedidoId: string;
  files: readonly PedidoFileListItem[];
  loadError?: string;
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

function getPreviewFiles(files: readonly PedidoFileListItem[]) {
  return [...files]
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )
    .slice(0, 3);
}

export function PedidoFilesPreview({
  pedidoId,
  files,
  loadError,
}: PedidoFilesPreviewProps) {
  const previewFiles = getPreviewFiles(files);

  return (
    <section
      aria-labelledby="pedido-files-preview-title"
      className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
    >
      <div>
        <h2
          id="pedido-files-preview-title"
          className="text-lg font-semibold text-text-primary"
        >
          Archivos recientes
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Últimos archivos asociados al pedido.
        </p>
      </div>

      {loadError ? (
        <Alert variant="danger" className="mt-5">
          {loadError}
        </Alert>
      ) : null}

      {previewFiles.length > 0 ? (
        <ul className="mt-5 divide-y divide-border">
          {previewFiles.map((file) => (
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
                    {STORAGE_FILE_CATEGORY_LABELS[file.visibility] ?? "Archivo"}
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
                className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary-soft"
              >
                Descargar archivo
              </a>
            </li>
          ))}
        </ul>
      ) : !loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
          No hay archivos asociados a este pedido.
        </p>
      ) : null}
    </section>
  );
}
