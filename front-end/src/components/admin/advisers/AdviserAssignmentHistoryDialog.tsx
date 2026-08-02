import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/adviser-utils";
import type { AdviserAssignmentHistoryRecord } from "@/types/adviser";

interface AdviserAssignmentHistoryDialogProps {
    adviserName: string | null;
    assignments: AdviserAssignmentHistoryRecord[];
    isLoading: boolean;
    onOpenChange: (open: boolean) => void;
    open: boolean;
}

export default function AdviserAssignmentHistoryDialog({
    adviserName,
    assignments,
    isLoading,
    onOpenChange,
    open,
}: AdviserAssignmentHistoryDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Assignment History</DialogTitle>
                    <DialogDescription>
                        {adviserName ? `${adviserName}'s academic program assignments by school year.` : "Academic program assignment history."}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading assignment history...
                    </div>
                ) : assignments.length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">No assignment history found for this adviser.</p>
                ) : (
                    <div className="space-y-3 py-2">
                        {assignments.map((assignment) => (
                            <div key={assignment.school_year_id} className="rounded-md border p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium text-foreground">{assignment.school_year_name}</p>
                                    <Badge variant="outline">{assignment.department ?? "Unassigned"}</Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Updated {formatDate(assignment.assigned_at)}
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
