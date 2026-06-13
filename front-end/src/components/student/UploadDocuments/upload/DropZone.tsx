"use client";

import { useRef, useState, type DragEvent } from "react";
import { CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Accepted file formats for the hidden file input
const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.tif,.heic,.heif";

interface DropZoneProps {
  // Called when the user selects or drops files into the zone
  onFilesAdded: (files: FileList | File[]) => void;
}

// Drag-and-drop file upload zone with a click-to-browse fallback.
// Manages its own drag-over state for visual feedback.
export default function DropZone({ onFilesAdded }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer?.files?.length) {
      onFilesAdded(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center min-h-[280px] transition-all cursor-pointer",
        isDragOver
          ? "border-primary bg-emerald-50"
          : "border-slate-300 hover:border-primary/50"
      )}
    >
      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        <CloudUpload className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-1">Drop your documents here</h3>
      <p className="text-sm text-slate-500 mb-4 text-center max-w-sm">
        Support for PDF, PNG, and JPG files up to 315MB. Larger files will take longer to
        process.
      </p>
      <Button
        type="button"
        className="bg-primary text-white hover:bg-primary/90 rounded-xl"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        Select Files from Computer
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            onFilesAdded(e.target.files);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
