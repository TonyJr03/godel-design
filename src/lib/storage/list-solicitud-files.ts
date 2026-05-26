import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "./file-paths";
import type { ListSolicitudFilesResult, SolicitudFileListItem } from "./types";

const SOLICITUD_FILES_SELECT = `
  id,
  file_name,
  file_type,
  file_size,
  visibility,
  created_at
`;

export async function listSolicitudFiles(
  solicitudId: string,
): Promise<ListSolicitudFilesResult> {
  const normalizedSolicitudId = solicitudId.trim();

  if (!isValidUuid(normalizedSolicitudId)) {
    return { ok: false, reason: "invalid_id", files: [] };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "solicitudes.view")) {
    return { ok: false, reason: "unauthorized", files: [] };
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("archivos")
      .select(SOLICITUD_FILES_SELECT)
      .eq("solicitud_id", normalizedSolicitudId)
      .eq("visibility", "cliente_solicitud")
      .order("created_at", { ascending: false })
      .returns<SolicitudFileListItem[]>();

    if (error) {
      console.error("Error listing solicitud files", error);
      return { ok: false, reason: "error", files: [] };
    }

    return {
      ok: true,
      files: data ?? [],
    };
  } catch (error) {
    console.error("Unexpected error listing solicitud files", error);
    return { ok: false, reason: "error", files: [] };
  }
}
