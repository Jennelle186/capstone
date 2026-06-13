import { Badge } from "@/components/ui/badge";

// Displays a submission's status as a styled Badge.
// Used in the previously uploaded list and anywhere submission status is rendered.
export default function SubmissionStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "flagged"
          ? "destructive"
          : status === "uploaded"
            ? "secondary"
            : status === "pending"
              ? "outline"
              : status === "verified"
                ? "outline"
                : "outline"
      }
      className={
        status === "verified"
          ? "border-emerald-200 text-emerald-700 bg-emerald-50"
          : status === "pending"
            ? "border-amber-200 text-amber-700 bg-amber-50"
            : ""
      }
    >
      {status === "flagged"
        ? "Flagged"
        : status === "uploaded"
          ? "Pending Verification"
          : status === "pending"
            ? "Pending Upload"
            : status === "verified"
              ? "Verified"
              : status}
    </Badge>
  );
}
