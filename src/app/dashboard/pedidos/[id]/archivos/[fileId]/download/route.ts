import { createClient } from "@/lib/supabase/server";
import {
  fileDownloadErrorResponse,
  fileNotAvailableResponse,
  parseDownloadRouteIds,
  redirectToSignedFileUrl,
} from "@/lib/storage/download-route";

type PedidoFileDownloadRouteProps = {
  params: Promise<{
    id: string;
    fileId: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: PedidoFileDownloadRouteProps,
) {
  const { id, fileId } = await params;
  const routeIds = parseDownloadRouteIds({ ownerId: id, fileId });

  if (!routeIds.ok) {
    return routeIds.response;
  }

  const supabase = await createClient();
  const { data: archivo, error } = await supabase
    .from("archivos")
    .select("id, pedido_id")
    .eq("id", routeIds.fileId)
    .eq("pedido_id", routeIds.ownerId)
    .maybeSingle<{ id: string; pedido_id: string | null }>();

  if (error) {
    console.error("Error checking pedido file before download", error);
    return fileDownloadErrorResponse(500);
  }

  if (!archivo) {
    return fileNotAvailableResponse();
  }

  return redirectToSignedFileUrl(archivo.id);
}
