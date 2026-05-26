const MAX_SAFE_FILE_NAME_LENGTH = 120;
const DEFAULT_SAFE_FILE_NAME = "archivo";

function getLastPathSegment(fileName: string) {
  const normalized = fileName.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? "";
}

export function getFileExtension(fileName: string): string {
  const segment = getLastPathSegment(fileName).trim();
  const lastDotIndex = segment.lastIndexOf(".");

  if (lastDotIndex <= 0 || lastDotIndex === segment.length - 1) {
    return "";
  }

  return segment.slice(lastDotIndex + 1).toLowerCase();
}

export function getBaseFileName(fileName: string): string {
  const segment = getLastPathSegment(fileName).trim();
  const lastDotIndex = segment.lastIndexOf(".");

  if (lastDotIndex <= 0) {
    return segment;
  }

  return segment.slice(0, lastDotIndex);
}

export function sanitizeFileName(fileName: string): string {
  const extension = getFileExtension(fileName)
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);

  const baseName = getBaseFileName(fileName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/["'`´]/g, "")
    .replace(/\.+/g, "-")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .toLowerCase();

  const fallbackName = baseName || DEFAULT_SAFE_FILE_NAME;
  const maxBaseLength =
    MAX_SAFE_FILE_NAME_LENGTH - (extension ? extension.length + 1 : 0);
  const safeBaseName = fallbackName.slice(0, Math.max(maxBaseLength, 1));

  return extension ? `${safeBaseName}.${extension}` : safeBaseName;
}
