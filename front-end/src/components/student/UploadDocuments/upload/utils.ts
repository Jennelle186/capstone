"use client";

import type { SubmissionDetail } from "@/types/submission";

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

// FastAPI sends a string for most errors, but a list of objects for request-validation failures.
// Returns the string, or null so the caller can show its own fallback message.
export function errorDetailText(detail: unknown): string | null {
  return typeof detail === "string" && detail.trim() ? detail : null;
}

// Statuses that mean the adviser already has this file, so the student must not replace or delete it.
// Mirrors the backend's DELETE_LOCKED_STATUSES: a file in one of these states cannot be replaced or deleted.
export const LOCKED_SUBMISSION_STATUSES = new Set(["submitted", "in-review", "processing"]);

// The API nests the segments of a split compiled PDF under their parent. Returns every row as a
// flat list (each parent followed by its segments), so a segment is found like any other file.
export function withCompiledSegments(submissions: SubmissionDetail[]): SubmissionDetail[] {
  const out: SubmissionDetail[] = [];
  for (const s of submissions) {
    out.push(s);
    for (const child of s.children ?? []) out.push(child);
  }
  return out;
}

// The student's current file for a required document: not verified and not PENDING. A PENDING row is an
// upload that never finished (for example, the GCS upload failed), so it must not stand in for the file the
// student already has. A file the adviser has already received wins, so the card shows that lock state.
export function currentFileFor(documentTypeId: string, submissions: SubmissionDetail[]): SubmissionDetail | undefined {
  const matches = submissions.filter(
    (s) => s.document_type_id === documentTypeId && s.status !== "verified" && s.status !== "pending",
  );
  return matches.find((s) => LOCKED_SUBMISSION_STATUSES.has(s.status)) ?? matches[0];
}

// Every file for a required document that a new upload replaces: not verified and not already with the
// adviser. Compiled segments count too, so replacing the document also removes the segment that held it.
export function previousFilesFor(documentTypeId: string, submissions: SubmissionDetail[]): SubmissionDetail[] {
  return submissions.filter(
    (s) =>
      s.document_type_id === documentTypeId &&
      s.status !== "verified" &&
      !LOCKED_SUBMISSION_STATUSES.has(s.status),
  );
}

// Document types the adviser has already verified for this student.
export function verifiedDocumentTypeIds(submissions: SubmissionDetail[]): Set<string> {
  const ids = new Set<string>();
  for (const s of submissions) {
    if (s.status === "verified" && s.document_type_id) ids.add(s.document_type_id);
  }
  return ids;
}
