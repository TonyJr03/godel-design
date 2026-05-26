export const GODEL_FILES_BUCKET = "godel-files" as const;

export const SIGNED_FILE_URL_EXPIRES_IN_SECONDS = 120;

export const MAX_STORAGE_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export const STORAGE_ROOTS = {
  solicitudes: "solicitudes",
  pedidos: "pedidos",
} as const;

export const STORAGE_SOLICITUD_FOLDERS = {
  originales: "originales",
} as const;

export const STORAGE_PEDIDO_FOLDERS = {
  internos: "internos",
  avances: "avances",
  finales: "finales",
} as const;

export const PEDIDO_FILE_CATEGORY_TO_FOLDER = {
  interno_pedido: STORAGE_PEDIDO_FOLDERS.internos,
  avance: STORAGE_PEDIDO_FOLDERS.avances,
  final_entrega: STORAGE_PEDIDO_FOLDERS.finales,
} as const;

export const SOLICITUD_FILE_CATEGORY_TO_FOLDER = {
  cliente_solicitud: STORAGE_SOLICITUD_FOLDERS.originales,
} as const;

export const ALLOWED_STORAGE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
] as const;

export const ALLOWED_STORAGE_FILE_EXTENSIONS = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "doc",
  "docx",
  "zip",
] as const;

export const BLOCKED_STORAGE_FILE_EXTENSIONS = [
  "exe",
  "bat",
  "cmd",
  "msi",
  "sh",
  "scr",
  "js",
  "mjs",
  "ts",
  "tsx",
  "ps1",
  "vbs",
  "html",
  "htm",
  "svg",
] as const;
