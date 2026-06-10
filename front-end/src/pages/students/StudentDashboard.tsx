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
  Bell,
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
  classification: string | null;
  documents: RequiredDocument[];
}

interface MeResponse {
  userId: string;
  firstName: string | null;
  lastName: string | null;
}

export default function StudentDashboard() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [isLoading, setIsLoading] = React.useState(true);
  const [data, setData] = React.useState<DataTableDashboard[]>([]);
  const [firstName, setFirstName] = React.useState<string | null>(null);
  const [lastName, setLastName] = React.useState<string | null>(null);
  const [schoolYear, setSchoolYear] = React.useState<string | null>(null);
  const [classification, setClassification] = React.useState<string | null>(null);

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

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex flex-col">
            {/* The "Welcome" part */}
            <span className="text-muted-foreground text-lg font-medium">
              Welcome,
            </span>

            {/* The Name part */}
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              {firstName ? `${firstName} ${lastName ?? ""}` : "Student Dashboard"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {schoolYear && (
              <Badge variant="outline" className="gap-1 text-xs">
                <GraduationCap className="h-3 w-3" />
                S.Y. {schoolYear}
              </Badge>
            )}
            {classification && (
              <Badge variant="secondary" className="gap-1 text-xs capitalize">
                <User className="h-3 w-3" />
                {classification} Student
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              Track your enrollment documents and verification status.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-base font-semibold">My Documents</CardTitle>
          </div>
          <Link to="/student/upload">
            <Button>Upload</Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-slate-700">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-6 py-4 text-left">Document Type</th>
                    <th className="px-6 py-4 text-left">Status</th>
                    <th className="px-6 py-4 text-left">Actions</th>
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
                      <td className="px-6 py-4">
                        <Skeleton className="h-8 w-16 rounded-full" />
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
