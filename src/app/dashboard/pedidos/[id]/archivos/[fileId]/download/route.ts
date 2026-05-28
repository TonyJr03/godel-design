import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSignedFileUrl } from "@/lib/storage";
import { isValidUuid } from "@/lib/validators";

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
  const pedidoId = id.trim();
  const archivoId = fileId.trim();

  if (!isValidUuid(pedidoId) || !isValidUuid(archivoId)) {
    return new Response("Archivo no disponible.", { status: 404 });
  }

  const supabase = await createClient();
  const { data: archivo, error } = await supabase
    .from("archivos")
    .select("id, pedido_id")
    .eq("id", archivoId)
    .eq("pedido_id", pedidoId)
    .maybeSingle<{ id: string; pedido_id: string | null }>();

  if (error) {
    console.error("Error checking pedido file before download", error);
    return new Response("No se pudo preparar la descarga.", { status: 500 });
  }

  if (!archivo) {
    return new Response("Archivo no disponible.", { status: 404 });
  }

  const signedUrlResult = await createSignedFileUrl(archivo.id);

  if (!signedUrlResult.ok) {
    return new Response("No se pudo preparar la descarga.", { status: 403 });
  }

  return NextResponse.redirect(signedUrlResult.url);
}
