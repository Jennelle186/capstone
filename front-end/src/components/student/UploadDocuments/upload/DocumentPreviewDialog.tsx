"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { Badge } from "@/components/ui/badge";
import type { SubmissionDetail } from "@/types/submission";

export type PreviewItem =
  | { type: "new"; id: string; file: File; previewUrl?: string; pdfUrl?: string }
  | { type: "existing"; submission: SubmissionDetail };

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PreviewItem[];
  index: number;
  onIndexChange: (index: number) => void;
}

export default function DocumentPreviewDialog({
  open,
  onOpenChange,
  items,
  index,
  onIndexChange,
}: DocumentPreviewDialogProps) {
  const [api, setApi] = useState<CarouselApi>();

  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      const snap = api.selectedScrollSnap();
      onIndexChange(snap);
    };
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, onIndexChange]);

  useEffect(() => {
    if (!api) return;
    const snap = api.selectedScrollSnap();
    if (snap !== index) api.scrollTo(index);
  }, [index, api]);

  const active = items[index];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] !max-w-[95vw] h-[95vh] !max-h-[95vh] p-0 gap-0">
        <div className="grid grid-rows-[auto_1fr_auto] h-full">
          <DialogHeader className="border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-base font-semibold text-slate-900 truncate">
                {active?.type === "new"
                  ? active.file.name
                  : active?.type === "existing"
                    ? active.submission.original_filename
                    : "Document Preview"}
              </DialogTitle>
              {active?.type === "existing" && (
                <Badge
                  variant={active.submission.status === "flagged" ? "destructive" : "outline"}
                  className={active.submission.status === "uploaded" ? "border-emerald-200 text-emerald-700 bg-emerald-50 shrink-0" : "shrink-0"}
                >
                  {active.submission.status === "flagged" ? "Flagged" : "Uploaded"}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-hidden">
            <Carousel setApi={setApi} opts={{ startIndex: index }} className="h-full">
              <CarouselContent className="-ms-0 h-full">
                {items.map((item, i) => (
                  <CarouselItem key={i} className="ps-0 h-full overflow-y-auto">
                    {item.type === "new" ? (
                      item.previewUrl ? (
                        <div className="flex items-center justify-center min-h-full w-full">
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className="rounded-xl block w-full max-h-[80vh] object-contain"
                          />
                        </div>
                      ) : item.pdfUrl ? (
                        <iframe
                          title={item.file.name}
                          src={item.pdfUrl}
                          className="h-[80vh] w-full rounded-xl border border-slate-200 bg-white"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-500">
                          <div className="flex flex-col items-center gap-3">
                            <FileText className="h-10 w-10" />
                            <span className="text-sm">No preview available.</span>
                          </div>
                        </div>
                      )
                    ) : item.type === "existing" ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="w-full max-w-lg mx-auto space-y-4 p-6">
                          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                                <FileText className="size-6 text-slate-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {item.submission.original_filename}
                                </p>
                                <Badge
                                  variant={item.submission.status === "flagged" ? "destructive" : "outline"}
                                  className={item.submission.status === "uploaded" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : ""}
                                >
                                  {item.submission.status === "flagged" ? "Flagged" : "Uploaded"}
                                </Badge>
                              </div>
                            </div>
                            <dl className="space-y-3 text-sm">
                              <div className="flex justify-between">
                                <dt className="text-slate-500">Document Type</dt>
                                <dd className="text-slate-900 font-medium">
                                  {item.submission.document_type_name ?? "\u2014"}
                                </dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-slate-500">File Size</dt>
                                <dd className="text-slate-900 font-medium">
                                  {item.submission.file_size
                                    ? `${(Number(item.submission.file_size) / 1024 / 1024).toFixed(1)} MB`
                                    : "\u2014"}
                                </dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-slate-500">MIME Type</dt>
                                <dd className="text-slate-900 font-medium">
                                  {item.submission.mime_type ?? "\u2014"}
                                </dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-slate-500">File Key</dt>
                                <dd className="text-slate-500 font-mono text-[11px] truncate max-w-[200px]">
                                  {item.submission.file_key}
                                </dd>
                              </div>
                              <div className="flex justify-between">
                                <dt className="text-slate-500">Uploaded</dt>
                                <dd className="text-slate-900 font-medium">
                                  {new Date(item.submission.created_at).toLocaleDateString("en-AU", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </dd>
                              </div>
                            </dl>
                          </div>
                          <p className="text-xs text-slate-400 text-center">
                            File preview requires a download endpoint to be configured.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-500">
                        <div className="flex flex-col items-center gap-3">
                          <FileText className="h-10 w-10" />
                          <span className="text-sm">No preview available.</span>
                        </div>
                      </div>
                    )}
                  </CarouselItem>
                ))}
              </CarouselContent>

              <CarouselPrevious className="start-2 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white shadow-md" />
              <CarouselNext className="end-2 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white shadow-md" />
            </Carousel>
          </div>

          <DialogFooter className="mx-0 mb-0 border-t bg-white px-6 py-4 flex-row items-center justify-between sm:justify-between">
            <span className="text-sm font-medium text-slate-600">
              {items.length ? `${index + 1} / ${items.length}` : "0 / 0"}
            </span>
            <Button
              className="bg-primary text-white hover:bg-primary/90 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Looks good
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
