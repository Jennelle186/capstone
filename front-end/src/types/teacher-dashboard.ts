export interface DashboardStats {
  totalStudents: number;
  pendingReviews: number;
  submittedToday: number;
  verifiedCount: number;
  progressPercent: number;
}

export type TeacherSubmissionStatus = "submitted" | "verified" | "flagged" | "needs-revision";

export interface RecentSubmission {
  id: string;
  initials: string;
  name: string;
  studentId: string;
  documentType: string;
  submittedAt: string;
  avatarColor: string;
  status: TeacherSubmissionStatus;
}

export const teacherStatusConfig: Record<TeacherSubmissionStatus, { label: string; badge: string; dot: string }> = {
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

export interface QuickAnalyticsData {
  reviewProgress: number;
}
