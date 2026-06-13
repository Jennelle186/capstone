import { Badge } from "@/components/ui/badge";

// Maps a submission status value to a human-readable label.
function statusLabel(status: string): string {
  switch (status) {
    case "flagged":
      return "Flagged";
    case "uploaded":
      return "Pending Verification";
    case "pending":
      return "Pending Upload";
    case "verified":
      return "Verified";
    case "processing":
      return "Processing";
    case "classified":
      return "Classified";
    case "extracting":
      return "Extracting";
    case "in-review":
      return "In Review";
    default:
      return status;
  }
}

// Displays a submission's status as a styled Badge.
// Used in the previously uploaded list and anywhere submission status is rendered.
export default function SubmissionStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "flagged"
          ? "destructive"
          : status === "uploaded" || status === "classified"
            ? "secondary"
            : "outline"
      }
      className={
        status === "verified"
          ? "border-emerald-200 text-emerald-700 bg-emerald-50"
          : status === "pending" || status === "processing"
            ? "border-amber-200 text-amber-700 bg-amber-50"
            : status === "flagged"
              ? "border-rose-200 text-rose-700 bg-rose-50"
              : ""
      }
    >
      {statusLabel(status)}
    </Badge>
  );
}
