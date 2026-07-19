import type { InternalSolicitudDetail } from "@/lib/solicitudes";
import type { SolicitudFileListItem } from "@/lib/storage";

import { SolicitudContactPreview } from "./SolicitudContactPreview";
import { SolicitudDescriptionPreview } from "./SolicitudDescriptionPreview";
import { SolicitudFilesPreview } from "./SolicitudFilesPreview";

type SolicitudWorkspaceMainProps = {
  solicitud: InternalSolicitudDetail;
  files: readonly SolicitudFileListItem[];
  filesLoadError?: string;
  filesLoadRetryable?: boolean;
};

export function SolicitudWorkspaceMain({
  solicitud,
  files,
  filesLoadError,
  filesLoadRetryable = false,
}: SolicitudWorkspaceMainProps) {
  return (
    <div className="grid min-w-0 gap-5 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.8fr)] xl:grid-rows-[auto_minmax(0,1fr)]">
      <SolicitudDescriptionPreview
        solicitud={solicitud}
        className="xl:row-span-2"
      />

      <SolicitudContactPreview solicitud={solicitud} />

      <SolicitudFilesPreview
        solicitudId={solicitud.id}
        files={files}
        loadError={filesLoadError}
        loadErrorRetryable={filesLoadRetryable}
      />
    </div>
  );
}
