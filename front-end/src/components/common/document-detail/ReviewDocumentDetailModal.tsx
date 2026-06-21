"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import DocumentDetailModal, {
  type DocumentDetailItem,
} from "@/components/common/document-detail/DocumentDetailModal";

interface Props {
  items: DocumentDetailItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  footer: React.ReactNode;
  getPreviewUrl?: (itemId: string) => Promise<string | undefined>;
  onOpenFullPage?: (item: DocumentDetailItem) => void;
}

export default function ReviewDocumentDetailModal({
  items,
  currentIndex,
  onIndexChange,
  open,
  onOpenChange,
  footer,
  getPreviewUrl,
  onOpenFullPage,
}: Props) {
  const current = items[currentIndex] ?? null;
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>();
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < items.length - 1;

  const getPreviewUrlRef = React.useRef(getPreviewUrl);
  React.useEffect(() => {
    getPreviewUrlRef.current = getPreviewUrl;
  });

  React.useEffect(() => {
    if (!open || !current || !getPreviewUrlRef.current) {
      setPreviewUrl(undefined);
      return;
    }
    let cancelled = false;
    setPreviewUrl(undefined);
    getPreviewUrlRef.current(current.id).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, current?.id]);

  return (
    <DocumentDetailModal
      item={current}
      open={open}
      onOpenChange={onOpenChange}
      previewUrl={previewUrl}
      onOpenFullPage={
        current && onOpenFullPage ? () => onOpenFullPage(current) : undefined
      }
      navigation={
        items.length > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canPrev}
              onClick={() => onIndexChange(currentIndex - 1)}
              className="gap-1 text-xs h-8"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <span className="text-xs font-medium text-slate-500 min-w-[32px] text-center tabular-nums">
              {currentIndex + 1}/{items.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canNext}
              onClick={() => onIndexChange(currentIndex + 1)}
              className="gap-1 text-xs h-8"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : undefined
      }
      footer={footer}
    />
  );
}
