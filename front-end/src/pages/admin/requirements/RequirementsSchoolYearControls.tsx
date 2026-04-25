import { motion } from "framer-motion";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useMemo } from "react";

import { fadeInUp } from "@/components/admin/motion-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { SchoolYearRecord } from "@/types/schoolYear";

type RequirementsSchoolYearControlsProps = {
    schoolYears: SchoolYearRecord[];
    selectedSchoolYearId: string;
    isRequirementsLoading: boolean;
    onSelectedSchoolYearChange: (schoolYearId: string) => void;
};

function toSchoolYearLabel(schoolYear: SchoolYearRecord): string {
    return schoolYear.name;
}

function compareSchoolYearsForRequirements(a: SchoolYearRecord, b: SchoolYearRecord): number {
    if (a.is_active !== b.is_active) {
        return a.is_active ? -1 : 1;
    }
    return a.start_date.localeCompare(b.start_date);
}

export default function RequirementsSchoolYearControls({
    schoolYears,
    selectedSchoolYearId,
    isRequirementsLoading,
    onSelectedSchoolYearChange,
}: RequirementsSchoolYearControlsProps) {
    const sortedSchoolYears = useMemo(
        () => [...schoolYears].sort(compareSchoolYearsForRequirements),
        [schoolYears],
    );


    return (
        <motion.div variants={fadeInUp}>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">School Year Controls</CardTitle>
                    <CardDescription>
                        These requirements apply to the entire school for the selected school year.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="w-full sm:w-60">
                            <Select
                                value={selectedSchoolYearId}
                                onValueChange={onSelectedSchoolYearChange}
                                disabled={schoolYears.length === 0 || isRequirementsLoading}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select school year" />
                                </SelectTrigger>
                                <SelectContent>
                                    {sortedSchoolYears.map((schoolYear) => (
                                        <SelectItem key={schoolYear.id} value={schoolYear.id}>
                                            {toSchoolYearLabel(schoolYear)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            {isRequirementsLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading saved requirements...
                                </>
                            ) : (
                                <>
                                    <ArrowLeftRight className="h-4 w-4" />
                                    Switching school year loads that year&apos;s saved requirement selection.
                                </>
                            )}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
