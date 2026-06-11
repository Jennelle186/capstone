import * as React from "react";
import { useAuth } from "@clerk/clerk-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/student/Dashboard Datatable/dataTable";
import {
  columns,
  type DataTableDashboard,
} from "@/components/student/Dashboard Datatable/columns";
import {
  GraduationCap,
  User,
  BookOpen,
  PlusCircle,
  Clock,
  Verified,
  CheckCircle,
  MessageCircle,
} from "lucide-react";
import { Link } from "react-router";
import { fetchWithClerkAuth } from "@/lib/api";

interface RequiredDocument {
  id: string;
  name: string;
  code: string;
  description: string;
}

interface RequiredDocumentsData {
  school_year_id: string | null;
  school_year_name: string | null;
  auto_closure_date: string | null;
  classification: string | null;
  documents: RequiredDocument[];
}

interface MeResponse {
  userId: string;
  firstName: string | null;
  lastName: string | null;
}

const statCards = [
  { label: "Pending Uploads", value: 5, icon: Clock, color: "text-primary" },
  { label: "Verified", value: 12, icon: Verified, color: "text-primary" },
  { label: "Accepted", value: 8, icon: CheckCircle, color: "text-primary" },
];

export default function StudentDashboard() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [isLoading, setIsLoading] = React.useState(true);
  const [data, setData] = React.useState<DataTableDashboard[]>([]);
  const [firstName, setFirstName] = React.useState<string | null>(null);
  const [lastName, setLastName] = React.useState<string | null>(null);
  const [schoolYear, setSchoolYear] = React.useState<string | null>(null);
  const [classification, setClassification] = React.useState<string | null>(null);
  const [autoClosureDate, setAutoClosureDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let isMounted = true;
    const loadDashboard = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const [meRes, reqRes] = await Promise.all([
          fetchWithClerkAuth("/api/me", token),
          fetchWithClerkAuth("/api/me/required-documents", token),
        ]);

        if (!meRes.ok || !reqRes.ok) return;

        const me = (await meRes.json()) as MeResponse;
        const req = (await reqRes.json()) as RequiredDocumentsData;

        if (!isMounted) return;

        setFirstName(me.firstName);
        setLastName(me.lastName);
        setSchoolYear(req.school_year_name);
        setClassification(req.classification);
        setAutoClosureDate(req.auto_closure_date);
        setData(
          req.documents.map((doc) => ({
            id: doc.id,
            documentType: doc.name,
            description: doc.description,
            status: "uploaded",
          }))
        );
        setIsLoading(false);
      } catch {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadDashboard();
    return () => { isMounted = false; };
  }, [getToken, isLoaded, isSignedIn]);

  const daysRemaining = React.useMemo(() => {
    if (!autoClosureDate) return null;
    const now = new Date();
    const closure = new Date(autoClosureDate);
    const diff = Math.ceil((closure.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [autoClosureDate]);

  return (
    <main className="flex flex-1 flex-col gap-6">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="text-lg font-medium text-slate-500">Welcome,</span>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {firstName ? `${firstName} ${lastName ?? ""}` : "Student Dashboard"}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {schoolYear && (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 rounded-full border-0 gap-1 text-xs font-semibold">
                <GraduationCap className="h-3 w-3" />
                School Year: {schoolYear}
              </Badge>
            )}
            {classification && (
              <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 rounded-full border-0 gap-1 text-xs font-semibold capitalize">
                <User className="h-3 w-3" />
                Classification: {classification}
              </Badge>
            )}
          </div>
        </div>
        <Link to="/student/upload">
          <Button className="bg-primary text-white hover:bg-primary/90 rounded-xl gap-2">
            <PlusCircle className="h-4 w-4 fill-current" />
            Upload New Document
          </Button>
        </Link>
      </div>

      {/* Stat Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="relative bg-white border border-slate-200 p-5 rounded-2xl shadow-sm overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 text-primary group-hover:scale-110 transition-transform">
                <Icon className="h-12 w-12" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                {stat.label}
              </p>
              <p className="text-4xl font-bold text-primary">{stat.value}</p>
            </div>
          );
        })}
      </section>

      {/* Document Table */}
      <Card className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-base font-semibold">Document Requirements</CardTitle>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Last updated: Oct 24, 2024
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-slate-700">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-6 py-4 text-left">Document Type</th>
                    <th className="px-6 py-4 text-left">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`row-skeleton-${index}`}>
                      <td className="px-6 py-4">
                        <Skeleton className="h-4 w-44" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Skeleton className="h-8 w-16 rounded-full ml-auto" />
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

      {/* Bottom Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Deadlines Card */}
        <div className="relative h-48 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent flex items-end p-5">
            <div className="text-white">
              <h3 className="text-lg font-semibold">Upcoming Deadlines</h3>
              {autoClosureDate && (
                <p className="text-xs opacity-75 mb-0.5">Closure: {new Date(autoClosureDate).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}</p>
              )}
              <p className="text-sm opacity-90">
                {daysRemaining !== null
                  ? daysRemaining > 0
                    ? `Document submission closes in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`
                    : daysRemaining === 0
                      ? "Document submission closes today."
                      : "Document submission has closed."
                  : "No deadline set."}
              </p>
            </div>
          </div>
        </div>

        {/* Concierge Card */}
        <div className="bg-emerald-100 text-emerald-800 p-5 rounded-2xl flex flex-col justify-center relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-lg font-semibold mb-1">Document Concierge</h3>
            <p className="text-sm mb-3 opacity-90">
              Need help with your verification? Our advisers are available for live chat from 8 AM to 5 PM.
            </p>
            <Button className="bg-emerald-800 text-white hover:bg-emerald-900 rounded-xl gap-2">
              <MessageCircle className="h-4 w-4" />
              Chat with Support
            </Button>
          </div>
          <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute right-10 top-5 w-24 h-24 bg-white/10 rounded-full blur-xl" />
        </div>
      </div>
    </main>
  );
}
