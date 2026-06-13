"use client";

// Formats a byte size into a human-readable string (e.g. "1.5 MB").
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Returns true if the file is an image (by MIME type or common extension).
export function isImageFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext ?? "");
}

// Returns true if the file can be previewed in the browser (image or PDF).
export function isPreviewable(file: File) {
  if (file.type.startsWith("image/") || file.type === "application/pdf") return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "pdf" || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext ?? "");
}
