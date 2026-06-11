"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudUpload, FileText, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type UploadItem = {
  id: string;
  file: File;
  progress: number;
  previewUrl?: string;
  pdfUrl?: string;
};

const MotionButton = motion.create(Button);

type UploadZoneProps = {
  files: File[];
  onFilesChange: (files: File[]) => void;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function ProgressRing({ value }: { value: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg className="h-9 w-9" viewBox="0 0 40 40">
      <circle
        cx="20"
        cy="20"
        r={radius}
        className="stroke-slate-200"
        strokeWidth="4"
        fill="transparent"
      />
      <circle
        cx="20"
        cy="20"
        r={radius}
        className="stroke-emerald-500"
        strokeWidth="4"
        fill="transparent"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function isPreviewable(file: File) {
  if (file.type.startsWith("image/") || file.type === "application/pdf") return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "pdf" || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext ?? "");
}

export default function UploadZone({ files, onFilesChange }: UploadZoneProps) {
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const timersRef = React.useRef<Record<string, number>>({});
  const itemMapRef = React.useRef<WeakMap<File, UploadItem>>(new WeakMap());
  const prevFilesRef = React.useRef<File[]>([]);
  const [progressById, setProgressById] = React.useState<Record<string, number>>({});

  const addFiles = React.useCallback(
    (incoming: FileList | File[]) => {
      const nextFiles = [...files, ...Array.from(incoming)];
      onFilesChange(nextFiles);
    },
    [files, onFilesChange]
  );

  React.useEffect(() => {
    const nextItems: UploadItem[] = files.map((file, index) => {
      let existing = itemMapRef.current.get(file);
      if (!existing) {
        const isImage =
          file.type.startsWith("image/") ||
          ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(
            file.name.split(".").pop()?.toLowerCase() ?? ""
          );
        const isPdf =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        existing = {
          id: `${file.name}-${file.lastModified}-${file.size}-${index}`,
          file,
          progress: 0,
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
          pdfUrl: isPdf ? URL.createObjectURL(file) : undefined,
        };
        itemMapRef.current.set(file, existing);
      }
      return {
        ...existing,
        progress: progressById[existing.id] ?? 0,
      };
    });

    setItems(nextItems);
  }, [files, progressById]);

  React.useEffect(() => {
    const prevFiles = prevFilesRef.current;
    const nextFilesSet = new Set(files);
    prevFiles.forEach((file) => {
      if (!nextFilesSet.has(file)) {
        const item = itemMapRef.current.get(file);
        if (item?.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
        if (item?.pdfUrl) {
          URL.revokeObjectURL(item.pdfUrl);
        }
      }
    });
    prevFilesRef.current = files;
  }, [files]);

  React.useEffect(() => {
    const activeIds = new Set(items.map((item) => item.id));
    Object.entries(timersRef.current).forEach(([id, timer]) => {
      if (!activeIds.has(id)) {
        window.clearInterval(timer);
        delete timersRef.current[id];
      }
    });

    items.forEach((item) => {
      if (item.progress >= 100) {
        const timer = timersRef.current[item.id];
        if (timer) {
          window.clearInterval(timer);
          delete timersRef.current[item.id];
        }
        return;
      }
      if (timersRef.current[item.id]) return;

      const timer = window.setInterval(() => {
        setProgressById((prev) => ({
          ...prev,
          [item.id]: Math.min(100, (prev[item.id] ?? 0) + 5),
        }));
      }, 200);

      timersRef.current[item.id] = timer;
    });
  }, [items]);

  const handleRemove = React.useCallback(
    (id: string) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      setProgressById((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      onFilesChange(files.filter((file) => file !== item.file));
    },
    [files, items, onFilesChange]
  );

  React.useEffect(() => {
    return () => {
      items.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
        if (item.pdfUrl) {
          URL.revokeObjectURL(item.pdfUrl);
        }
      });
      Object.values(timersRef.current).forEach((timer) => window.clearInterval(timer));
      timersRef.current = {};
    };
    // Only run on unmount; we handle per-file cleanup when files change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.dataTransfer.files?.length) {
        addFiles(event.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const previewableItems = React.useMemo(
    () => items.filter((item) => isPreviewable(item.file)),
    [items]
  );

  React.useEffect(() => {
    if (!isPreviewOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setSelectedFileIndex((prev) =>
          prev + 1 >= previewableItems.length ? 0 : prev + 1
        );
      }
      if (event.key === "ArrowLeft") {
        setSelectedFileIndex((prev) =>
          prev - 1 < 0 ? previewableItems.length - 1 : prev - 1
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPreviewOpen, previewableItems.length]);

  const activePreview = previewableItems[selectedFileIndex];
  React.useEffect(() => {
    if (selectedFileIndex >= previewableItems.length) {
      setSelectedFileIndex(0);
    }
  }, [previewableItems.length, selectedFileIndex]);

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg font-bold text-slate-900">Upload Documents</CardTitle>
        <p className="text-sm text-slate-500">
          Drag & drop files or click to browse (25MB max per file).
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <motion.div
          whileHover={{ scale: 1.01 }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-white px-6 py-10 text-center text-slate-600"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
            <CloudUpload className="h-6 w-6" />
          </div>
          <div className="text-sm font-medium text-slate-700">
            Click to upload or drag and drop
          </div>
        </motion.div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) {
              addFiles(event.target.files);
              event.target.value = "";
            }
          }}
        />

        <AnimatePresence initial={false}>
          {items.length > 0 && (
            <div className="space-y-3">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      onClick={() => {
                        if (previewableItems.length === 0) {
                          return;
                        }
                        const index = previewableItems.findIndex(
                          (preview) => preview.id === item.id
                        );
                        setSelectedFileIndex(index >= 0 ? index : 0);
                        setIsPreviewOpen(true);
                      }}
                      className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-600"
                    >
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </motion.button>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {item.file.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatFileSize(item.file.size)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <ProgressRing value={item.progress} />
                      <span className="font-medium text-emerald-600">
                        {item.progress}%
                      </span>
                    </div>
                    <MotionButton
                      variant="ghost"
                      size="sm"
                      whileTap={{ scale: 0.98 }}
                      className="text-slate-500 hover:text-slate-900"
                      onClick={() => handleRemove(item.id)}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Remove
                    </MotionButton>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </CardContent>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl p-0">
          <div className="flex max-h-[80vh] flex-col">
            <DialogHeader className="gap-2 border-b p-4">
              <DialogTitle className="text-base font-semibold text-slate-900">
                {activePreview?.file.name ?? "Document Preview"}
              </DialogTitle>
              <DialogDescription>
                {previewableItems.length
                  ? `File ${selectedFileIndex + 1} of ${previewableItems.length}`
                  : "No previewable files yet."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-1 items-center justify-center overflow-auto p-4">
              <AnimatePresence mode="wait">
                {activePreview ? (
                  <motion.div
                    key={activePreview.id}
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.2 }}
                    className="flex w-full items-center justify-center"
                  >
                    {activePreview.previewUrl ? (
                      <img
                        src={activePreview.previewUrl}
                        alt={activePreview.file.name}
                        className="max-h-[60vh] w-full rounded-xl object-contain"
                      />
                    ) : activePreview.pdfUrl ? (
                      <iframe
                        title={activePreview.file.name}
                        src={activePreview.pdfUrl}
                        className="h-[60vh] w-full rounded-xl border border-slate-200 bg-white"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-slate-500">
                        <FileText className="h-10 w-10" />
                        <span className="text-sm">No preview available.</span>
                      </div>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="border-t bg-slate-50/60 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewableItems.length <= 1}
                    onClick={() =>
                      setSelectedFileIndex((prev) =>
                        prev - 1 < 0 ? previewableItems.length - 1 : prev - 1
                      )
                    }
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewableItems.length <= 1}
                    onClick={() =>
                      setSelectedFileIndex((prev) =>
                        prev + 1 >= previewableItems.length ? 0 : prev + 1
                      )
                    }
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => {
                    setIsPreviewOpen(false);
                    toast.info(
                      'After verifying your images, please click "Upload" to start the OCR processing.'
                    );
                  }}
                >
                  Looks good
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
