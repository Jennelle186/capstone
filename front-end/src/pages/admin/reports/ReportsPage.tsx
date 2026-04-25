import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { FileText, Download } from "lucide-react";

export default function ReportsPage() {
    const reports = [
        {
            id: 1,
            name: "User Summary Report",
            description: "Overview of all users and their roles",
            generated: "2026-04-12",
            format: "PDF",
        },
        {
            id: 2,
            name: "Monthly Activity Report",
            description: "Activity logs for the current month",
            generated: "2026-04-11",
            format: "CSV",
        },
        {
            id: 3,
            name: "Role Distribution Report",
            description: "Distribution of users across different roles",
            generated: "2026-04-10",
            format: "PDF",
        },
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <AdminPageHeader
                title="Reports"
                description="Generate and view system reports"
                titleClassName="text-3xl font-bold tracking-tight text-foreground"
                descriptionClassName="mt-2"
            />

            {/* Generate Report Button */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Generate New Report</CardTitle>
                    <CardDescription>
                        Create a new report based on current data
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                    <Button disabled>
                        Generate User Report
                    </Button>
                    <Button variant="outline" disabled>
                        Generate Activity Report
                    </Button>
                </CardContent>
            </Card>

            {/* Recent Reports */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Recent Reports</CardTitle>
                    <CardDescription>
                        {reports.length} report{reports.length !== 1 ? "s" : ""} available
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {reports.map((report) => (
                            <div
                                key={report.id}
                                className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-muted">
                                        <FileText className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">{report.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {report.description}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge variant="outline">{report.format}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {report.generated}
                                    </span>
                                    <Button variant="ghost" size="icon" disabled>
                                        <Download className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Info */}
            <Card className="bg-muted/50 border-muted">
                <CardHeader>
                    <CardTitle className="text-base">Coming Soon</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    Advanced reporting features including custom date ranges,
                    export formats, and scheduled report generation will be available soon.
                </CardContent>
            </Card>
        </div>
    );
}
