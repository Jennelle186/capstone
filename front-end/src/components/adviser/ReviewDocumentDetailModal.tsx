"use client";

import * as React from "react";
import { useAuth } from "@clerk/clerk-react";
import ReviewDocumentDetailModal from "@/components/common/document-detail/ReviewDocumentDetailModal";
import { fetchWithClerkAuth } from "@/lib/api";
import type {
  DocumentDetailItem,
  ExtractionField,
  ExtractionSection,
} from "@/components/common/document-detail/DocumentDetailModal";

interface SubmissionBrief {
  id: string;
  student_id: string;
  student_name: string;
  document_type: string;
  status: string;
  submitted_at: string;
}

interface ExtractionFieldResponse {
  id: string;
  key: string;
  description: string;
  value: string;
  confidence: number;
  needs_review: boolean;
  section_title: string | null;
}

interface ExtractionItemResponse {
  submission_id: string;
  fields: ExtractionFieldResponse[];
}

interface Props {
  submissions: SubmissionBrief[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  footer?: React.ReactNode;
}

const statusConfig: Record<string, { label: string; badge: string; dot: string }> = {
  submitted: {
    label: "Pending Review",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
  verified: {
    label: "Verified",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  flagged: {
    label: "Flagged",
    badge: "bg-rose-100 text-rose-700",
    dot: "bg-rose-500",
  },
  "needs-revision": {
    label: "Needs Revision",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
};

export default function TeacherReviewDocumentDetailModal({
  submissions,
  currentIndex,
  onIndexChange,
  open,
  onOpenChange,
  footer,
}: Props) {
  const { getToken } = useAuth();
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

      const results = await Promise.allSettled(
        submissions.map(async (sub) => {
          const res = await fetchWithClerkAuth(
            `/api/adviser/submissions/${sub.id}/extractions`,
            token,
          );
          if (!res.ok) return null;
          const data = (await res.json()) as ExtractionItemResponse | null;
          return data;
        }),
      );

      if (cancelled) return;

      const map: Record<string, ExtractionSection[]> = {};
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status !== "fulfilled" || !result.value) continue;
        const item = result.value;
        const grouped = new Map<string, ExtractionField[]>();
        for (const f of item.fields) {
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
        map[item.submission_id] = Array.from(grouped.entries()).map(
          ([title, fields]) => ({ title, fields }),
        );
      }
      if (!cancelled) setSectionsBySubmissionId(map);
    };

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [open, getToken, submissions]);

  const items: DocumentDetailItem[] = React.useMemo(
    () =>
      submissions.map((sub) => {
        const config = statusConfig[sub.status] ?? statusConfig.submitted;
        return {
          id: sub.id,
          title: sub.document_type,
          subtitle: sub.student_name,
          metaLines: [`Submitted ${sub.submitted_at}`],
          initials: sub.student_name.charAt(0).toUpperCase(),
          avatarColor: "bg-primary/10 text-primary",
          statusLabel: config.label,
          statusBadge: config.badge,
          statusDot: config.dot,
          extractionSections: sectionsBySubmissionId[sub.id] ?? [],
          studentId: sub.student_id,
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
          `/api/adviser/submissions/${id}/download-url`,
          token,
        );
        if (!res.ok) return undefined;
        const data = await res.json();
        return data.url as string;
      }}
      footer={footer}
    />
  );
}
