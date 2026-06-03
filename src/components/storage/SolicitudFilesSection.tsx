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
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">
          Archivos de la solicitud
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Archivos privados enviados como referencia para esta solicitud.
        </p>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
          {loadError}
        </p>
      ) : null}

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
                    {STORAGE_FILE_CATEGORY_LABELS[file.visibility]}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {formatFileSize(file.file_size)}
                  {" · "}
                  Subido el {formatAppDateTime(file.created_at)}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {getFileTypeLabel(file)}
                </p>
              </div>

              <a
                href={`/dashboard/solicitudes/${solicitudId}/archivos/${file.id}/download`}
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
              >
                Descargar
              </a>
            </li>
          ))}
        </ul>
      ) : !loadError ? (
        <p className="mt-5 rounded-md border border-dashed border-zinc-300 px-4 py-3 text-sm leading-6 text-zinc-600">
          No hay archivos asociados a esta solicitud.
        </p>
      ) : null}
    </section>
  );
}
