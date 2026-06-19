import { Button } from "@/components/ui/button";
import DocumentDetailModal, {
  type DocumentDetailItem,
} from "@/components/common/document-detail/DocumentDetailModal";
import type { Submission } from "./types";
import { statusConfig } from "./types";

interface Props {
  submission: Submission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toDocumentDetailItem(submission: Submission): DocumentDetailItem {
  const config = statusConfig[submission.status];
  return {
    id: submission.id,
    title: submission.documentName,
    subtitle: `Uploaded on ${submission.uploadDate} \u2022 ${submission.fileSize} ${submission.fileType}`,
    metaLines: [],
    initials: submission.documentName.charAt(0),
    avatarColor: "bg-primary/10 text-primary",
    statusLabel: config.label,
    statusBadge: config.badge,
    statusDot: config.dot,
    extractionSections: [
      {
        title: "Extracted Fields",
        fields: [
          { label: "Document Number", value: "TRN-2023-X992", verified: true },
          { label: "Institution", value: "Stanford Global Institute", verified: true },
          { label: "Issue Date", value: "October 12, 2023", verified: true },
          { label: "Cumulative GPA", value: "3.92/4.00", verified: false, confidence: "68%", warning: true },
        ],
      },
    ],
  };
}

export default function StudentDocumentDetailModal({ submission, open, onOpenChange }: Props) {
  const item = submission ? toDocumentDetailItem(submission) : null;

  return (
    <DocumentDetailModal
      item={item}
      open={open}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button className="w-full rounded-xl bg-primary text-white hover:bg-primary/90 shadow-sm text-sm">
            Confirm All Data
          </Button>
          <Button variant="ghost" size="sm" className="w-full text-xs text-slate-500 hover:text-primary">
            Request Manual Re-verification
          </Button>
        </>
      }
    />
  );
}
