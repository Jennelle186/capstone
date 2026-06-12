import * as React from "react";
import { useNavigate } from "react-router";
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DataTable from "@/components/common/data-table/DataTable";
import DocumentDetailModal, {
  type DocumentDetailItem,
} from "@/components/common/document-detail/DocumentDetailModal";
import {
  type RecentSubmission,
  teacherStatusConfig,
} from "@/types/teacher-dashboard";

const defaultSubmissions: RecentSubmission[] = [
  {
    id: "1", initials: "AM", name: "Arthur Morgan", studentId: "#44920",
    documentType: "Financial Aid Statement", submittedAt: "2 hours ago",
    avatarColor: "bg-emerald-100 text-emerald-700", status: "verified",
  },
  {
    id: "2", initials: "SC", name: "Sadie Creek", studentId: "#44921",
    documentType: "High School Transcript", submittedAt: "4 hours ago",
    avatarColor: "bg-blue-100 text-blue-700", status: "needs-revision",
  },
  {
    id: "3", initials: "JM", name: "John Marston", studentId: "#44922",
    documentType: "Medical Waiver", submittedAt: "Yesterday",
    avatarColor: "bg-red-100 text-red-700", status: "flagged",
  },
  {
    id: "4", initials: "DV", name: "Dutch Van", studentId: "#44923",
    documentType: "Language Proficiency", submittedAt: "Yesterday",
    avatarColor: "bg-amber-100 text-amber-700", status: "verified",
  },
];

interface RecentSubmissionsTableProps {
  data?: RecentSubmission[];
}

function toDocumentDetailItem(submission: RecentSubmission): DocumentDetailItem {
  const config = teacherStatusConfig[submission.status];
  return {
    id: submission.id,
    title: submission.documentType,
    subtitle: `${submission.name} \u2022 ${submission.studentId}`,
    metaLines: [`Submitted ${submission.submittedAt}`],
    initials: submission.initials,
    avatarColor: submission.avatarColor,
    statusLabel: config.label,
    statusBadge: config.badge,
    statusDot: config.dot,
    studentId: submission.studentId,
    extractions: [
      { label: "Document Number", value: "TRN-2023-X992", verified: true },
      { label: "Institution", value: "Stanford Global Institute", verified: true },
      { label: "Issue Date", value: "October 12, 2023", verified: true },
      { label: "Cumulative GPA", value: "3.92/4.00", verified: false, confidence: "68%", warning: true },
    ],
  };
}

export default function RecentSubmissionsTable({
  data = defaultSubmissions,
}: RecentSubmissionsTableProps) {
  const navigate = useNavigate();
  const [selectedItem, setSelectedItem] = React.useState<DocumentDetailItem | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [updatingStatus, setUpdatingStatus] = React.useState<string>("");

  const handleRowClick = React.useCallback(
    (row: RecentSubmission) => {
      const params = new URLSearchParams({
        name: row.name,
        documentType: row.documentType,
        submittedAt: row.submittedAt,
      });
      navigate(`/adviser/students/${encodeURIComponent(row.studentId)}?${params.toString()}`);
    },
    [navigate],
  );

  const handleReview = React.useCallback((submission: RecentSubmission) => {
    setSelectedItem(toDocumentDetailItem(submission));
    setUpdatingStatus(submission.status);
    setModalOpen(true);
  }, []);

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
              ID: {row.original.studentId}
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

  const teacherModalFooter = selectedItem && (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1 block">
          Update Status
        </label>
        <Select
          value={updatingStatus}
          onValueChange={(value) => {
            setUpdatingStatus(value);
            console.log(`Status updated to: ${value} for document ${selectedItem.id}`);
          }}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
            <SelectItem value="needs-revision">Needs Revision</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        className="w-full rounded-xl bg-primary text-white hover:bg-primary/90 shadow-sm text-sm gap-2"
        onClick={(e) => {
          e.stopPropagation();
          const sid = selectedItem.studentId ?? selectedItem.id;
          const params = new URLSearchParams({ name: selectedItem.title });
          navigate(`/adviser/students/${encodeURIComponent(sid)}?${params.toString()}`);
        }}
      >
        <ExternalLink className="h-4 w-4" />
        View Student Profile
      </Button>
    </div>
  );

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-5 py-4">
          <h4 className="text-base font-semibold text-slate-900">
            Recent Submissions
          </h4>
        </div>
        <div className="p-5">
          <DataTable
            data={data}
            columns={columns}
            searchColumn="name"
            searchPlaceholder="Search students..."
            filterColumn="documentType"
            filterOptions={docTypes}
            onRowClick={handleRowClick}
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
                      ID: {submission.studentId}
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
        </div>
      </div>
      <DocumentDetailModal
        item={selectedItem}
        open={modalOpen}
        onOpenChange={setModalOpen}
        footer={teacherModalFooter}
      />
    </>
  );
}
