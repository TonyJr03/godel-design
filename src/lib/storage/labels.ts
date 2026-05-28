import type { StorageFileCategory } from "./types";

export const STORAGE_FILE_CATEGORY_LABELS: Record<StorageFileCategory, string> = {
  cliente_solicitud: "Archivo enviado por cliente",
  interno_pedido: "Interno del pedido",
  avance: "Avance",
  final_entrega: "Final de entrega",
};
