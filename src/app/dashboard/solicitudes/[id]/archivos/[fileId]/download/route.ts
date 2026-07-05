import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { GODEL_FILES_BUCKET } from "@/lib/storage";
import {
  fileDownloadErrorResponse,
  fileNotAvailableResponse,
  parseDownloadRouteIds,
  redirectToSignedFileUrl,
} from "@/lib/storage/download-route";

type SolicitudFileDownloadRouteProps = {
  params: Promise<{
    id: string;
    fileId: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: SolicitudFileDownloadRouteProps,
) {
  const { id, fileId } = await params;
  const routeIds = parseDownloadRouteIds({ ownerId: id, fileId });

  if (!routeIds.ok) {
    return routeIds.response;
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "solicitudes.view")) {
    return fileNotAvailableResponse();
  }

  const supabase = await createClient();
  const { data: archivo, error } = await supabase
    .from("archivos")
    .select("id, solicitud_id, pedido_id, bucket")
    .eq("id", routeIds.fileId)
    .eq("solicitud_id", routeIds.ownerId)
    .maybeSingle<{
      id: string;
      solicitud_id: string | null;
      pedido_id: string | null;
      bucket: string;
    }>();

  if (error) {
    console.error("Error checking solicitud file before download", error);
    return fileDownloadErrorResponse(500);
  }

  if (
    !archivo ||
    archivo.bucket !== GODEL_FILES_BUCKET
  ) {
    return fileNotAvailableResponse();
  }

  return redirectToSignedFileUrl(archivo.id);
}
