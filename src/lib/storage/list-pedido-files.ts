import { getCurrentProfile } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { ListPedidoFilesResult, PedidoFileListItem } from "./types";

type PedidoFileRow = Omit<PedidoFileListItem, "uploadedBy"> & {
  uploader: PedidoFileListItem["uploadedBy"];
};

const PEDIDO_FILES_SELECT = `
  id,
  file_name,
  file_type,
  file_size,
  visibility,
  created_at,
  uploaded_by,
  uploader:perfiles!archivos_uploaded_by_fkey(id, full_name, role)
`;

export async function listPedidoFiles(
  pedidoId: string,
): Promise<ListPedidoFilesResult> {
  const normalizedPedidoId = pedidoId.trim();

  if (!isValidUuid(normalizedPedidoId)) {
    return { ok: false, reason: "invalid_id", files: [] };
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return { ok: false, reason: "unauthorized", files: [] };
  }

  const supabase = await createClient();

  try {
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id")
      .eq("id", normalizedPedidoId)
      .maybeSingle<{ id: string }>();

    if (pedidoError) {
      console.error("Error checking pedido access for files", pedidoError);
      return { ok: false, reason: "error", files: [] };
    }

    if (!pedido) {
      return { ok: false, reason: "unauthorized", files: [] };
    }

    const { data, error } = await supabase
      .from("archivos")
      .select(PEDIDO_FILES_SELECT)
      .eq("pedido_id", normalizedPedidoId)
      .in("visibility", [
        "cliente_solicitud",
        "interno_pedido",
        "avance",
        "final_entrega",
      ])
      .order("created_at", { ascending: false })
      .returns<PedidoFileRow[]>();

    if (error) {
      console.error("Error listing pedido files", error);
      return { ok: false, reason: "error", files: [] };
    }

    return {
      ok: true,
      files: (data ?? []).map(({ uploader, ...file }) => ({
        ...file,
        uploadedBy: uploader,
      })),
    };
  } catch (error) {
    console.error("Unexpected error listing pedido files", error);
    return { ok: false, reason: "error", files: [] };
  }
}
