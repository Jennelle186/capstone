"use client";

// Represents a file the user has selected for upload (not yet submitted to the server).
export type FileItem = {
  id: string;
  file: File;
  previewUrl?: string;
  pdfUrl?: string;
  // Populated after a successful initiate call.
  submissionId?: string;
  uploadUrl?: string;
  fields?: Record<string, string>;
  // Error message from the last upload attempt.
  error?: string;
};
