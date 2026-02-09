"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, FileText, ImageIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type PreviewItem = {
  id: string;
  file: File;
  previewUrl?: string;
};

type UploadPreviewDialogProps = {
  files: File[];
};

export default function UploadPreviewDialog({ files }: UploadPreviewDialogProps) {
  const [items, setItems] = React.useState<PreviewItem[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    const nextItems: PreviewItem[] = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${file.size}-${index}`,
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));

    setItems(nextItems);
    setActiveIndex(0);

    return () => {
      nextItems.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [files]);

  const activeItem = items[activeIndex];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={files.length === 0}>
          Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl p-0">
        <div className="flex max-h-[80vh] flex-col">
          <DialogHeader className="gap-2 border-b p-4">
            <DialogTitle>Document Preview</DialogTitle>
            <DialogDescription>Review uploaded files in the carousel.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
            {activeItem ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {activeItem.file.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {activeItem.file.type || "Unknown type"}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {activeIndex + 1} of {items.length}
                  </div>
                </div>

                <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4">
                  {activeItem.previewUrl ? (
                    <img
                      src={activeItem.previewUrl}
                      alt={activeItem.file.name}
                      className="max-h-[50vh] w-full rounded-lg object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-slate-500">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
                        <FileText className="h-8 w-8" />
                      </div>
                      <span className="text-sm">No preview available for this file.</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 p-8 text-slate-500">
                <ImageIcon className="h-8 w-8" />
                <span className="text-sm">No files to preview yet.</span>
              </div>
            )}
          </div>

          <DialogFooter className="mt-auto">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setActiveIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1))
                  }
                  disabled={items.length <= 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveIndex((prev) => (prev + 1) % items.length)}
                  disabled={items.length <= 1}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
              <Button>Looks good</Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
