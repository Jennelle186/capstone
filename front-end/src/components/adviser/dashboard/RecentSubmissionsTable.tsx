import * as React from "react";
import { useNavigate } from "react-router";
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import DataTable from "@/components/common/data-table/DataTable";
import { useAdviserSubmissions } from "@/hooks/useAdviserSubmissions";
import type { RecentSubmission } from "@/types/adviser-dashboard";

interface RecentSubmissionsTableProps {
  data?: RecentSubmission[];
}

export default function RecentSubmissionsTable({
  data: propData,
}: RecentSubmissionsTableProps) {
  const navigate = useNavigate();
  const { data, loading } = useAdviserSubmissions(propData);

  const handleReview = React.useCallback((submission: RecentSubmission) => {
    const mappedSubmissions = data.map((s) => ({
      id: s.id,
      student_id: s.studentId,
      student_name: s.name,
      student_number: s.studentNumber ?? null,
      document_type: s.documentType,
      status: s.status,
      submitted_at: s.submittedAt,
      extraction_fields: {},
    }));
    navigate(
      `/adviser/students/${encodeURIComponent(submission.studentId)}/review/${submission.id}`,
      { state: { submissions: mappedSubmissions } },
    );
  }, [navigate, data]);

  const columns: ColumnDef<RecentSubmission>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Student Name
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${row.original.avatarColor}`}
          >
            {row.original.initials}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{row.original.name}</p>
            <p className="text-[10px] uppercase tracking-tighter text-slate-400">
              {row.original.studentNumber ?? row.original.studentId}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "documentType",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Document Type
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-slate-600">{row.getValue("documentType")}</span>
      ),
    },
    {
      accessorKey: "submittedAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Submitted
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-slate-400">{row.getValue("submittedAt")}</span>
      ),
    },
    {
      id: "actions",
      header: "Action",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            size="sm"
            className="rounded-full bg-primary px-4 text-xs font-semibold text-white shadow-sm hover:bg-primary/90"
            onClick={(e) => { e.stopPropagation(); handleReview(row.original); }}
          >
            <Eye className="mr-1 h-3.5 w-3.5" />
            Review
          </Button>
        </div>
      ),
    },
  ];

  const docTypes = React.useMemo(() => {
    const types = new Set(data.map((s) => s.documentType));
    return [
      { label: "All Types", value: "all" },
      ...Array.from(types).map((t) => ({ label: t, value: t })),
    ];
  }, [data]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-5 py-4">
        <h4 className="text-base font-semibold text-slate-900">
          Recent Submissions
        </h4>
      </div>
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading submissions...
          </div>
        ) : (
        <DataTable
          data={data}
          columns={columns}
          searchColumn="name"
          searchPlaceholder="Search students..."
          filterColumn="documentType"
          filterOptions={docTypes}
          mobileCard={(submission) => (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 transition-all hover:shadow-sm active:scale-[0.99]">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 ${submission.avatarColor}`}
                >
                  {submission.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{submission.name}</p>
                  <p className="text-[10px] uppercase tracking-tighter text-slate-400">
                    {submission.studentNumber ?? submission.studentId}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{submission.documentType}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{submission.submittedAt}</p>
                </div>
                <Button
                  size="sm"
                  className="rounded-full bg-primary px-3 text-[10px] font-semibold text-white shadow-sm hover:bg-primary/90 h-7"
                  onClick={(e) => { e.stopPropagation(); handleReview(submission); }}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Review
                </Button>
              </div>
            </div>
          )}
        />
        )}
      </div>
    </div>
  );
}
