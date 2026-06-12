import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Eye, FileText, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/common/data-table/DataTable";
import type { Submission } from "./types";
import { statusConfig } from "./types";

interface Props {
  data: Submission[];
  onView: (submission: Submission) => void;
}

export default function SubmissionsTable({ data, onView }: Props) {
  const columns: ColumnDef<Submission>[] = [
    {
      accessorKey: "documentName",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Document Name
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-primary/10 text-primary rounded-lg shrink-0">
            <Eye className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium text-slate-900">{row.getValue("documentName")}</span>
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
          Type
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-slate-700">{row.getValue("documentType")}</span>
      ),
    },
    {
      accessorKey: "uploadDate",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Upload Date
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-slate-500">{row.getValue("uploadDate")}</span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Status
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as Submission["status"];
        const config = statusConfig[status];
        return (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${config.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
            {config.label}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "Action",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary/80 hover:bg-primary/5 font-semibold text-sm"
            onClick={() => onView(row.original)}
          >
            View Details
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      searchColumn="documentName"
      searchPlaceholder="Search documents..."
      filterColumn="status"
      filterOptions={[
        { label: "All Status", value: "all" },
        { label: "Verified", value: "verified" },
        { label: "In Review", value: "in-review" },
        { label: "Flagged", value: "flagged" },
        { label: "Uploaded", value: "uploaded" },
      ]}
      mobileCard={(submission) => {
        const config = statusConfig[submission.status];
        return (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 transition-all hover:shadow-sm active:scale-[0.99]">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg shrink-0 mt-0.5">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  {submission.documentName}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{submission.documentType}</p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${config.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                {config.label}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {submission.uploadDate}
                </span>
                <span className="text-slate-300">{submission.fileSize}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary/80 font-semibold text-xs h-8 px-3 -mr-2"
                onClick={() => onView(submission)}
              >
                View
                <Eye className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        );
      }}
    />
  );
}
