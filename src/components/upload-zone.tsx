"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudUpload, FileText, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UploadItem = {
  id: string;
  file: File;
  progress: number;
  previewUrl?: string;
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

export default function UploadZone({ files, onFilesChange }: UploadZoneProps) {
  const [items, setItems] = React.useState<UploadItem[]>([]);
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
        existing = {
          id: `${file.name}-${file.lastModified}-${file.size}-${index}`,
          file,
          progress: 0,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
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

  const handleRemove = React.useCallback((id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    setProgressById((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    onFilesChange(files.filter((file) => file !== item.file));
  }, [files, items, onFilesChange]);

  React.useEffect(() => {
    return () => {
      items.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      Object.values(timersRef.current).forEach((timer) => window.clearInterval(timer));
      timersRef.current = {};
    };
  }, [items]);

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.dataTransfer.files?.length) {
        addFiles(event.dataTransfer.files);
      }
    },
    [addFiles]
  );

  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg font-bold text-slate-900">Upload Documents</CardTitle>
        <p className="text-sm text-slate-500">
          Drag & drop files or click to browse (5MB max per file).
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
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-600">
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {item.file.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatFileSize(item.file.size)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
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
    </Card>
  );
}
