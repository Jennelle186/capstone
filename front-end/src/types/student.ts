export interface RequiredDocument {
  id: string;
  name: string;
  code: string;
  description: string;
  is_required: boolean;
}

// ── Admin Students Page ──────────────────────────────────────────────

export interface AdminStudentResponse {
  id: string;
  name: string;
  student_number: string;
  email: string;
  image_url: string;
  department_code: string;
  department_name: string;
  classification: string;
  document_status: string;
  documents_submitted: number;
  documents_total: number;
}

export interface DepartmentSummaryResponse {
  code: string;
  name: string;
  enrolled_count: number;
  completed_count: number;
}

export interface StudentsPageResponse {
  students: AdminStudentResponse[];
  department_summaries: DepartmentSummaryResponse[];
}

export interface AdminStudent {
  id: string;
  name: string;
  studentNumber: string;
  email: string;
  imageUrl: string;
  departmentCode: string;
  departmentName: string;
  classification: string;
  documentStatus: string;
  documentsSubmitted: number;
  documentsTotal: number;
}

export interface DepartmentSummary {
  code: string;
  name: string;
  enrolledCount: number;
  completedCount: number;
  completionPct: number;
}

export const DOCUMENT_STATUS_BADGE: Record<string, string> = {
  complete: "bg-emerald-500/10 text-emerald-600",
  pending_review: "bg-amber-500/10 text-amber-600",
  incomplete: "bg-red-500/10 text-red-600",
  not_submitted: "bg-slate-200 text-slate-500",
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  complete: "Complete",
  pending_review: "Pending Review",
  incomplete: "Incomplete",
  not_submitted: "Not Submitted",
};
