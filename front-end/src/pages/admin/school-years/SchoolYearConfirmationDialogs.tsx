import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SchoolYearActivationPreview, SchoolYearRecord } from "@/types/schoolYear";

interface SchoolYearConfirmationDialogsProps {
    activationIntent: unknown;
    activationPreview: SchoolYearActivationPreview | null;
    closeSchoolYear: (schoolYear: SchoolYearRecord) => void | Promise<void>;
    handleConfirmActivation: () => void;
    isActivationPreviewLoading: boolean;
    reopenSchoolYear: (schoolYear: SchoolYearRecord) => void | Promise<void>;
    schoolYearToClose: SchoolYearRecord | null;
    schoolYearToDeactivate: SchoolYearRecord | null;
    schoolYearToReopen: SchoolYearRecord | null;
    setActivationIntent: (value: null) => void;
    setSchoolYearToClose: (schoolYear: SchoolYearRecord | null) => void;
    setSchoolYearToDeactivate: (schoolYear: SchoolYearRecord | null) => void;
    setSchoolYearToReopen: (schoolYear: SchoolYearRecord | null) => void;
    setSchoolYearInactive: (schoolYear: SchoolYearRecord) => void | Promise<void>;
}

export default function SchoolYearConfirmationDialogs({
    activationIntent,
    activationPreview,
    closeSchoolYear,
    handleConfirmActivation,
    isActivationPreviewLoading,
    reopenSchoolYear,
    schoolYearToClose,
    schoolYearToDeactivate,
    schoolYearToReopen,
    setActivationIntent,
    setSchoolYearToClose,
    setSchoolYearToDeactivate,
    setSchoolYearToReopen,
    setSchoolYearInactive,
}: SchoolYearConfirmationDialogsProps) {
    return (
        <>
            <AlertDialog open={activationIntent !== null} onOpenChange={(open) => (!open ? setActivationIntent(null) : null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-amber-100 text-amber-700">
                            <AlertTriangle className="h-5 w-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Set School Year as Active?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Setting this school year as active will apply it to all new submissions and records.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {isActivationPreviewLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading activation preview...
                        </div>
                    ) : activationPreview ? (
                        <div className="space-y-3 rounded-md border p-3 text-sm">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                    <p className="text-muted-foreground">Selected</p>
                                    <p className="font-medium">{activationPreview.selected_school_year.name}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Current Active</p>
                                    <p className="font-medium">
                                        {activationPreview.current_active_school_year?.name ?? "None"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Assignments</p>
                                    <p className="font-medium">{activationPreview.adviser_assignment_count}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Requirements</p>
                                    <p className="font-medium">{activationPreview.requirement_count}</p>
                                </div>
                            </div>
                            {activationPreview.readiness_issues.length > 0 ? (
                                <div className="space-y-1">
                                    <p className="font-medium text-amber-800">Readiness warnings</p>
                                    <ul className="list-inside list-disc text-muted-foreground">
                                        {activationPreview.readiness_issues.map((issue) => (
                                            <li key={issue}>{issue}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmActivation}>Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={schoolYearToDeactivate !== null}
                onOpenChange={(open) => (!open ? setSchoolYearToDeactivate(null) : null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-amber-100 text-amber-700">
                            <AlertTriangle className="h-5 w-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Set School Year as Inactive?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {schoolYearToDeactivate
                                ? `This will set ${schoolYearToDeactivate.name} as inactive for new transactions until another school year is activated.`
                                : "This action will set the selected school year as inactive."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => schoolYearToDeactivate && void setSchoolYearInactive(schoolYearToDeactivate)}
                        >
                            Confirm Inactive
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={schoolYearToClose !== null}
                onOpenChange={(open) => (!open ? setSchoolYearToClose(null) : null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-amber-100 text-amber-700">
                            <AlertTriangle className="h-5 w-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Mark School Year as Closed?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {schoolYearToClose
                                ? `This will close ${schoolYearToClose.name}. Existing records are preserved, but new transactions will no longer use it.`
                                : "This action will close the selected school year."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => schoolYearToClose && void closeSchoolYear(schoolYearToClose)}>
                            Confirm Close
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={schoolYearToReopen !== null}
                onOpenChange={(open) => (!open ? setSchoolYearToReopen(null) : null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-emerald-100 text-emerald-700">
                            <RotateCcw className="h-5 w-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Reopen School Year?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {schoolYearToReopen
                                ? `This will reopen ${schoolYearToReopen.name} as upcoming. It will not become active automatically.`
                                : "This action will reopen the selected school year as upcoming."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => schoolYearToReopen && void reopenSchoolYear(schoolYearToReopen)}>
                            Confirm Reopen
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
