export const GODEL_FILES_BUCKET = "godel-files" as const;

export const SIGNED_FILE_URL_EXPIRES_IN_SECONDS = 120;

export const MAX_STORAGE_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export const MAX_UPLOAD_SESSION_ITEMS = 10;

export const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

export const PPO03_MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
  rar: "application/vnd.rar",
  cdr: "application/vnd.corel-draw",
} as const;

export const PPO03_STORAGE_FILE_INPUT_ACCEPT = Object.keys(
  PPO03_MIME_BY_EXTENSION,
)
  .map((extension) => `.${extension}`)
  .join(",");
