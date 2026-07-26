"use client";

import * as React from "react";
import ReviewDocumentDetailModal from "@/components/common/document-detail/ReviewDocumentDetailModal";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SubmissionItem, DownloadUrlResponse } from "@/types/submission";
import type { ExtractionItemResponse } from "@/types/extraction";
import type {
  DocumentDetailItem,
  ExtractionField,
  ExtractionSection,
} from "@/components/common/document-detail/DocumentDetailModal";

interface Props {
  submissions: SubmissionItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getToken: () => Promise<string | null>;
}

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

export default function StudentReviewDocumentDetailModal({
  submissions,
  currentIndex,
  onIndexChange,
  open,
  onOpenChange,
  getToken,
}: Props) {
  const getTokenRef = React.useRef(getToken);
  React.useEffect(() => {
    getTokenRef.current = getToken;
  });

  const [sectionsBySubmissionId, setSectionsBySubmissionId] = React.useState<
    Record<string, ExtractionSection[]>
  >({});

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const fetchAll = async () => {
      const token = await getTokenRef.current();
      if (!token) return;
      const extRes = await fetchWithClerkAuth("/api/me/documents/extractions", token);
      if (cancelled || !extRes.ok) return;
      const allExtractions = (await extRes.json()) as ExtractionItemResponse[];

      const map: Record<string, ExtractionSection[]> = {};
      for (const ext of allExtractions) {
        const grouped = new Map<string, ExtractionField[]>();
        for (const f of ext.fields) {
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
        map[ext.submission_id] = Array.from(grouped.entries()).map(
          ([title, fields]) => ({ title, fields }),
        );
      }
      if (!cancelled) setSectionsBySubmissionId(map);
    };

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [open, getToken]);

  const items: DocumentDetailItem[] = React.useMemo(
    () =>
      submissions.map((submission) => {
        const config =
          statusConfig[submission.status] ?? statusConfig.pending;
        return {
          id: submission.id,
          title: submission.fileName,
          subtitle: `Type: ${submission.documentType}`,
          metaLines: [],
          initials: submission.fileName.charAt(0).toUpperCase(),
          avatarColor: "bg-primary/10 text-primary",
          statusLabel: config.label,
          statusBadge: config.badge,
          statusDot: config.dot,
          extractionSections: sectionsBySubmissionId[submission.id] ?? [],
        };
      }),
    [submissions, sectionsBySubmissionId],
  );

  return (
    <ReviewDocumentDetailModal
      items={items}
      currentIndex={currentIndex}
      onIndexChange={onIndexChange}
      open={open}
      onOpenChange={onOpenChange}
      getPreviewUrl={async (id) => {
        const token = await getTokenRef.current();
        if (!token) return undefined;
        const res = await fetchWithClerkAuth(
          `/api/me/documents/${id}/download-url`,
          token,
        );
        if (!res.ok) return undefined;
        const data = (await res.json()) as DownloadUrlResponse;
        return data.url;
      }}
      footer={
        <div className="w-full text-center py-2 px-4 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-xs text-slate-500 leading-relaxed">
            This is a read-only preview of your auto-extracted details. You can
            complete the overall submission using the main{" "}
            <strong className="font-semibold text-slate-700">
              Submit All Documents
            </strong>{" "}
            option on the dashboard.
          </p>
        </div>
      }
    />
  );
}
