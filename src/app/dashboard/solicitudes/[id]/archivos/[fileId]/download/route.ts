import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  GODEL_FILES_BUCKET,
  createSignedFileUrl,
  isValidUuid,
} from "@/lib/storage";

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
  const solicitudId = id.trim();
  const archivoId = fileId.trim();

  if (!isValidUuid(solicitudId) || !isValidUuid(archivoId)) {
    return new Response("Archivo no disponible.", { status: 404 });
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "solicitudes.view")) {
    return new Response("Archivo no disponible.", { status: 404 });
  }

  const supabase = await createClient();
  const { data: archivo, error } = await supabase
    .from("archivos")
    .select("id, solicitud_id, pedido_id, bucket")
    .eq("id", archivoId)
    .eq("solicitud_id", solicitudId)
    .maybeSingle<{
      id: string;
      solicitud_id: string | null;
      pedido_id: string | null;
      bucket: string;
    }>();

  if (error) {
    console.error("Error checking solicitud file before download", error);
    return new Response("No se pudo preparar la descarga.", { status: 500 });
  }

  if (
    !archivo ||
    archivo.bucket !== GODEL_FILES_BUCKET
  ) {
    return new Response("Archivo no disponible.", { status: 404 });
  }

  const signedUrlResult = await createSignedFileUrl(archivo.id);

  if (!signedUrlResult.ok) {
    return new Response("No se pudo preparar la descarga.", { status: 403 });
  }

  return NextResponse.redirect(signedUrlResult.url);
}
