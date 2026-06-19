"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import DocumentDetailModal, {
  type DocumentDetailItem,
  type ExtractionField,
  type ExtractionSection,
} from "@/components/common/document-detail/DocumentDetailModal";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SubmissionItem, DownloadUrlResponse } from "@/types/submission";
import type { ExtractionItemResponse } from "@/types/extraction";

interface ReviewDocumentDetailModalProps {
  submissions: SubmissionItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getToken: () => Promise<string | null>;
}

export default function ReviewDocumentDetailModal({
  submissions,
  currentIndex,
  onIndexChange,
  open,
  onOpenChange,
  getToken,
}: ReviewDocumentDetailModalProps) {
  const current = submissions[currentIndex];
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const [sections, setSections] = React.useState<ExtractionSection[]>([]);
  const getTokenRef = React.useRef(getToken);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  });

  const submissionId = current?.id;

  React.useEffect(() => {
    if (!open || !submissionId) return;

    let cancelled = false;
    setPreviewUrl(undefined);
    setSections([]);

    const fetchData = async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;

        const [urlRes, extRes] = await Promise.all([
          fetchWithClerkAuth(`/api/me/documents/${submissionId}/download-url`, token),
          fetchWithClerkAuth("/api/me/documents/extractions", token),
        ]);

        if (cancelled) return;

        if (urlRes.ok) {
          const urlData = (await urlRes.json()) as DownloadUrlResponse;
          setPreviewUrl(urlData.url);
        }

        if (extRes.ok) {
          const allExtractions = (await extRes.json()) as ExtractionItemResponse[];
          const activeItem = allExtractions.find(
            (e) => e.submission_id === submissionId
          );
          if (activeItem) {
            const grouped = new Map<string, ExtractionField[]>();
            for (const f of activeItem.fields) {
              const title = f.section_title ?? "Extracted Fields";
              if (!grouped.has(title)) grouped.set(title, []);
              grouped.get(title)!.push({
                label: f.description || f.key,
                value: f.value || "",
                verified: !f.needs_review,
                confidence: `${Math.round(f.confidence * 100)}%`,
                warning: f.needs_review || f.confidence < 0.7,
              });
            }
            setSections(
              Array.from(grouped.entries()).map(([title, fields]) => ({ title, fields })),
            );
          }
        }
      } catch {
        // ignore
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [open, submissionId]);

  const canPrev = currentIndex > 0;
  const canNext = currentIndex < submissions.length - 1;

  const statusConfig: Record<string, { label: string; badge: string; dot: string }> = {
    ready: {
      label: "Ready",
      badge: "bg-emerald-100 text-emerald-700",
      dot: "bg-emerald-500",
    },
    "needs-review": {
      label: "Needs Review",
      badge: "bg-amber-100 text-amber-700",
      dot: "bg-amber-500",
    },
    pending: {
      label: "Pending",
      badge: "bg-slate-100 text-slate-600",
      dot: "bg-slate-400",
    },
  };

  const config = current ? statusConfig[current.status] ?? statusConfig.pending : statusConfig.pending;

  const item: DocumentDetailItem | null = current
    ? {
      id: current.id,
      title: current.fileName,
      subtitle: `Type: ${current.documentType}`,
      metaLines: [],
      initials: current.fileName.charAt(0).toUpperCase(),
      avatarColor: "bg-primary/10 text-primary",
      statusLabel: config.label,
      statusBadge: config.badge,
      statusDot: config.dot,
      extractionSections: sections,
    }
    : null;

  return (
    <DocumentDetailModal
      item={item}
      open={open}
      onOpenChange={onOpenChange}
      previewUrl={previewUrl}
      navigation={
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
            {currentIndex + 1}/{submissions.length}
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
      }
      footer={
        <div className="w-full text-center py-2 px-4 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-xs text-slate-500 leading-relaxed">
            This is a read-only preview of your auto-extracted details. You can complete the overall submission using the main <strong className="font-semibold text-slate-700">Submit All Documents</strong> option on the dashboard.
          </p>
        </div>
      }
    />
  );
}
