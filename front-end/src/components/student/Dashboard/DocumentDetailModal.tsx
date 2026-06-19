import * as React from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import DocumentDetailModal, {
  type DocumentDetailItem,
  type ExtractionField,
  type ExtractionSection,
} from "@/components/common/document-detail/DocumentDetailModal";
import { fetchWithClerkAuth } from "@/lib/api";
import type { Submission } from "./types";
import { statusConfig } from "./types";
import type { DownloadUrlResponse } from "@/types/submission";
import type { ExtractionItemResponse } from "@/types/extraction";

interface Props {
  submissions: Submission[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function StudentDocumentDetailModal({
  submissions,
  currentIndex,
  onIndexChange,
  open,
  onOpenChange,
}: Props) {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const getTokenRef = React.useRef(getToken);
  const submission = currentIndex >= 0 && currentIndex < submissions.length
    ? submissions[currentIndex]
    : null;

  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const [sections, setSections] = React.useState<ExtractionSection[]>([]);

  const submissionId = submission?.id;

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
          fetchWithClerkAuth(
            "/api/me/documents/extractions?status=classified,flagged,processing,submitted,in-review,verified",
            token,
          ),
        ]);

        if (cancelled) return;

        if (urlRes.ok) {
          const urlData = (await urlRes.json()) as DownloadUrlResponse;
          if (!cancelled) setPreviewUrl(urlData.url);
        }

        if (extRes.ok) {
          const allExtractions = (await extRes.json()) as ExtractionItemResponse[];
          const activeItem = allExtractions.find((e) => e.submission_id === submissionId);
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
            if (!cancelled) {
              setSections(
                Array.from(grouped.entries()).map(([title, fields]) => ({ title, fields })),
              );
            }
          }
        }
      } catch {
        // ignore
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [open, submissionId]);

  const config = submission ? statusConfig[submission.status] : statusConfig.uploaded;

  const canPrev = currentIndex > 0;
  const canNext = currentIndex < submissions.length - 1;

  const item: DocumentDetailItem | null = submission
    ? {
        id: submission.id,
        title: submission.documentName,
        subtitle: `Uploaded on ${submission.uploadDate} \u2022 ${submission.fileSize} ${submission.fileType}`,
        metaLines: [],
        initials: submission.documentName.charAt(0).toUpperCase(),
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
      onOpenFullPage={submissionId ? () => navigate(`/student/extraction/${submissionId}`) : undefined}
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
            This is a read-only preview of your document and extracted data.
          </p>
        </div>
      }
    />
  );
}
