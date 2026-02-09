import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/student/Dashboard Datatable/dataTable";
import {
  columns,
  type DataTableDashboard,
} from "@/components/student/Dashboard Datatable/columns";
import { motion, type Variants } from "framer-motion";
import {
  FileText,
  CheckCircle2,
  ShieldCheck,
  Clock3,
  Sparkles,
} from "lucide-react";

const stats = [
  { label: "Documents Uploaded", value: 6, icon: FileText, tone: "blue" },
  { label: "Pending Documents", value: "0 / 0", icon: Clock3, tone: "amber" },
  { label: "Verified Documents", value: 6, icon: ShieldCheck, tone: "emerald" },
  { label: "Ready for Admission", value: 6, icon: CheckCircle2, tone: "green" },
];

const documents: DataTableDashboard[] = [
  { id: "doc-1", documentType: "Birth Certificate", uploaded: true, status: "verified", sentToAdmin: true },
  { id: "doc-2", documentType: "Report Card", uploaded: true, status: "verified", sentToAdmin: true },
  { id: "doc-3", documentType: "Admission Form", uploaded: true, status: "verified", sentToAdmin: true },
  { id: "doc-4", documentType: "CET", uploaded: true, status: "verified", sentToAdmin: true },
  { id: "doc-5", documentType: "Medical Certificate", uploaded: true, status: "verified", sentToAdmin: true },
  { id: "doc-6", documentType: "Good Moral Certificate", uploaded: true, status: "verified", sentToAdmin: true },
];

async function getData(): Promise<DataTableDashboard[]> {
  return documents;
}

export default function StudentDashboard() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [data, setData] = React.useState<DataTableDashboard[]>([]);
  const pendingStat = stats.find((stat) => stat.label === "Pending Documents");
  const isAllCaughtUp = pendingStat?.value === "0 / 0";

  const cardContainer: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.05 },
    },
  };
  const cardItem: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 100, damping: 15 },
    },
  };

  React.useEffect(() => {
    let isMounted = true;
    getData().then((result) => {
      if (isMounted) {
        setData(result);
        setIsLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Student Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Track your enrollment documents and verification status.
            </p>
          </div>
        </div>
      </div>

      <motion.div
        className="grid gap-4 md:grid-cols-4"
        variants={cardContainer}
        initial="hidden"
        animate="show"
      >
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => (
            <Card
              key={`stat-skeleton-${index}`}
              className="h-full rounded-2xl border border-slate-200 shadow-sm transition-all"
            >
              <CardContent className="flex h-full flex-col justify-between p-6">
                <div className="flex items-start justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
                <Skeleton className="h-9 w-20" />
              </CardContent>
            </Card>
          ))
          : stats.map(({ label, value, icon: Icon, tone }) => {
            const isGolden = label === "Ready for Admission";
            const isPending = label === "Pending Documents";
            const displayValue = isPending && isAllCaughtUp ? "0" : value;
            const toneStyles =
              tone === "blue"
                ? "bg-blue-100 text-blue-600"
                : tone === "amber"
                  ? "bg-amber-100 text-amber-600"
                  : tone === "emerald"
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-green-100 text-green-600";
            const cardStyles = isGolden
              ? "border-l-4 border-green-500 bg-green-50 text-green-900"
              : "border-slate-200 bg-white text-slate-900";
            return (
              <motion.div
                key={label}
                variants={cardItem}
                whileHover={{
                  y: -5,
                  transition: { duration: 0.2 },
                  boxShadow: "0 12px 30px rgba(59, 130, 246, 0.15)",
                }}
              >
                <Card
                  className={`h-full rounded-2xl border shadow-sm transition-all hover:shadow-md ${cardStyles}`}
                >
                  <CardContent className="flex h-full flex-col justify-between p-6">
                    <div className="flex items-start justify-between">
                      <CardTitle className={isGolden ? "text-sm text-green-800" : "text-sm text-slate-500"}>
                        {label}
                      </CardTitle>
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${toneStyles}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="text-4xl font-bold">{displayValue}</div>
                    {isPending && isAllCaughtUp && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Sparkles className="h-3 w-3" />
                        All caught up!
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
      </motion.div>

      <Card className="rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">My Documents</CardTitle>
          <Button size="sm" variant="outline" className="border-slate-200">
            Upload
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-slate-700">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-6 py-4 text-left">Document Type</th>
                    <th className="px-6 py-4 text-left">Uploaded?</th>
                    <th className="px-6 py-4 text-left">Status</th>
                    <th className="px-6 py-4 text-left">Sent to Admin</th>
                    <th className="px-6 py-4 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`row-skeleton-${index}`}>
                      <td className="px-6 py-4">
                        <Skeleton className="h-4 w-44" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-4 w-10" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-4 w-10" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-8 w-20 rounded-full" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <DataTable columns={columns} data={data} />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
