"use client";

// Represents a file the user has selected for upload (not yet submitted to the server).
export type FileItem = {
  id: string;
  file: File;
  previewUrl?: string;
  pdfUrl?: string;
};
