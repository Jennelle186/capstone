import * as React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
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
  { label: "Documents Uploaded", value: 6, icon: FileText },
  { label: "Pending Documents", value: "0 / 0", icon: Clock3 },
  { label: "Verified Documents", value: 6, icon: ShieldCheck },
  { label: "Ready for Admission", value: 6, icon: CheckCircle2 },
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
          <SidebarTrigger className="md:hidden" />
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
              <Card key={`stat-skeleton-${index}`} className="rounded-2xl border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          : stats.map(({ label, value, icon: Icon }) => {
              const isGolden = label === "Ready for Admission";
              const isPending = label === "Pending Documents";
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
                    className={`rounded-2xl border shadow-sm transition-colors ${
                      isGolden
                        ? "border-primary/30 bg-primary text-primary-foreground"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <CardHeader className="flex min-h-[84px] flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle
                        className={`text-sm font-medium ${
                          isGolden ? "text-primary-foreground/90" : "text-muted-foreground"
                        }`}
                      >
                        {label}
                      </CardTitle>
                      <Icon className={`h-4 w-4 ${isGolden ? "text-primary-foreground" : "text-muted-foreground"}`} />
                    </CardHeader>
                    <CardContent className="flex min-h-[64px] flex-col justify-between">
                      <div className="text-2xl font-bold">{value}</div>
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

      <Card className="rounded-2xl border-slate-200 shadow-sm">
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
                  <tr className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
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
