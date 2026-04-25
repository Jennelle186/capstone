import { useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { ArrowLeftRight, ClipboardList, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import EmptyState from "@/components/admin/document-management/EmptyState";
import PageHeader from "@/components/admin/document-management/PageHeader";
import RequirementChecklist from "@/components/admin/document-management/RequirementChecklist";
import { fadeInUp, staggerContainer } from "@/components/admin/motion-variants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { parseDocumentManagementApiError, toDocumentTypeItem } from "@/lib/document-management-utils";
import { fetchWithClerkAuth } from "@/lib/api";
import type { DocumentTypeApiRecord, DocumentTypeItem } from "@/types/documentType";
import type {
    RequirementAssignmentPayload,
    RequirementAssignmentResponse,
} from "@/types/requirement";
import type { SchoolYearRecord } from "@/types/schoolYear";

function toSchoolYearLabel(schoolYear: SchoolYearRecord): string {
    return schoolYear.name;
}

export default function RequirementsPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [documentTypes, setDocumentTypes] = useState<DocumentTypeItem[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
    const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
    const [initialSelectedRequirementIds, setInitialSelectedRequirementIds] = useState<Set<string>>(new Set());
    const [draftSelectedRequirementIds, setDraftSelectedRequirementIds] = useState<Set<string>>(new Set());
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [isRequirementsLoading, setIsRequirementsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const requestWithAdminAuth = useCallback(
        async (path: string, init?: RequestInit): Promise<unknown> => {
            const token = await getToken();
            if (!token) throw new Error("Missing admin authentication token.");

            const response = await fetchWithClerkAuth(path, token, init);
            if (!response.ok) {
                let message = `Request failed with status ${response.status}.`;
                try {
                    const payload = (await response.json()) as unknown;
                    message = parseDocumentManagementApiError(payload, message);
                } catch {
                    // Ignore malformed payloads.
                }
                throw new Error(message);
            }
            return response.status === 204 ? null : ((await response.json()) as unknown);
        },
        [getToken],
    );

    const loadPageData = useCallback(async () => {
        setIsPageLoading(true);
        try {
            const [documentTypePayload, schoolYearPayload] = await Promise.all([
                requestWithAdminAuth("/api/admin/document-types?status=active"),
                requestWithAdminAuth("/api/admin/school-years"),
            ]);

            const nextDocumentTypes = (documentTypePayload as DocumentTypeApiRecord[]).map(toDocumentTypeItem);
            const nextSchoolYears = schoolYearPayload as SchoolYearRecord[];

            setDocumentTypes(nextDocumentTypes);
            setSchoolYears(nextSchoolYears);

            const defaultSchoolYearId =
                nextSchoolYears.find((schoolYear) => schoolYear.is_active)?.id ??
                nextSchoolYears[0]?.id ??
                "";
            setSelectedSchoolYearId((current) => {
                if (current && nextSchoolYears.some((schoolYear) => schoolYear.id === current)) {
                    return current;
                }
                return defaultSchoolYearId;
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load requirements page data.");
        } finally {
            setIsPageLoading(false);
        }
    }, [requestWithAdminAuth]);

    const loadSchoolYearRequirements = useCallback(
        async (schoolYearId: string) => {
            setIsRequirementsLoading(true);
            try {
                const payload = (await requestWithAdminAuth(
                    `/api/admin/requirements?school_year_id=${schoolYearId}`,
                )) as RequirementAssignmentResponse;
                const nextSelectedIds = new Set(payload.document_type_ids);
                setInitialSelectedRequirementIds(nextSelectedIds);
                setDraftSelectedRequirementIds(new Set(payload.document_type_ids));
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load school year requirements.");
                setInitialSelectedRequirementIds(new Set());
                setDraftSelectedRequirementIds(new Set());
            } finally {
                setIsRequirementsLoading(false);
            }
        },
        [requestWithAdminAuth],
    );

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setIsPageLoading(false);
            return;
        }
        void loadPageData();
    }, [isLoaded, isSignedIn, loadPageData]);

    useEffect(() => {
        if (!selectedSchoolYearId) {
            setInitialSelectedRequirementIds(new Set());
            setDraftSelectedRequirementIds(new Set());
            return;
        }
        void loadSchoolYearRequirements(selectedSchoolYearId);
    }, [loadSchoolYearRequirements, selectedSchoolYearId]);

    const availableDocumentTypes = useMemo(
        () => documentTypes.filter((item) => item.isActive && !item.isArchived),
        [documentTypes],
    );

    const selectedSchoolYear = useMemo(
        () => schoolYears.find((item) => item.id === selectedSchoolYearId) ?? null,
        [schoolYears, selectedSchoolYearId],
    );

    const handleRequirementToggle = (documentTypeId: string) => {
        setDraftSelectedRequirementIds((prev) => {
            const next = new Set(prev);
            if (next.has(documentTypeId)) {
                next.delete(documentTypeId);
            } else {
                next.add(documentTypeId);
            }
            return next;
        });
    };

    const handleSaveRequirements = async () => {
        if (!selectedSchoolYearId || isSaving) return;

        const nextSelectedIds = availableDocumentTypes
            .map((item) => item.id)
            .filter((id) => draftSelectedRequirementIds.has(id));

        const payload: RequirementAssignmentPayload = {
            school_year_id: selectedSchoolYearId,
            document_type_ids: nextSelectedIds,
        };

        setIsSaving(true);
        try {
            const response = (await requestWithAdminAuth("/api/admin/requirements", {
                method: "PUT",
                body: JSON.stringify(payload),
            })) as RequirementAssignmentResponse;

            const nextSelectedSet = new Set(response.document_type_ids);
            setInitialSelectedRequirementIds(nextSelectedSet);
            setDraftSelectedRequirementIds(new Set(response.document_type_ids));

            toast.success(`Requirements for ${selectedSchoolYear?.name ?? "selected school year"} saved.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save requirements.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetRequirements = () => {
        setDraftSelectedRequirementIds(new Set(initialSelectedRequirementIds));
        toast.message(
            `Reset to last saved requirements for ${selectedSchoolYear?.name ?? "selected school year"}.`,
        );
    };

    if (isPageLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading requirements...
            </div>
        );
    }

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-6"
        >
            <PageHeader
                title="Requirements"
                subtitle="Manage required enrollment documents per school year."
            />

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
                                    onValueChange={setSelectedSchoolYearId}
                                    disabled={schoolYears.length === 0 || isRequirementsLoading}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select school year" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {schoolYears.map((schoolYear) => (
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

            <motion.div variants={fadeInUp}>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-blue-700" />
                            Requirement Checklist {selectedSchoolYear ? `(${selectedSchoolYear.name})` : ""}
                        </CardTitle>
                        <CardDescription>
                            Select document types required for enrollment in this school year.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {availableDocumentTypes.length === 0 ? (
                            <EmptyState
                                icon={<ClipboardList className="h-6 w-6" />}
                                title="No document types found."
                                description="No document types found. Create document types first before setting requirements."
                                action={(
                                    <Button asChild>
                                        <Link to="/admin/document-types">Go to Document Types</Link>
                                    </Button>
                                )}
                            />
                        ) : (
                            <>
                                <RequirementChecklist
                                    items={availableDocumentTypes}
                                    selectedIds={draftSelectedRequirementIds}
                                    onToggle={handleRequirementToggle}
                                />
                                <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                                    <Button
                                        variant="outline"
                                        onClick={handleResetRequirements}
                                        disabled={isRequirementsLoading || isSaving}
                                    >
                                        Reset
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            void handleSaveRequirements();
                                        }}
                                        disabled={!selectedSchoolYearId || isRequirementsLoading || isSaving}
                                    >
                                        <Save className="mr-2 h-4 w-4" />
                                        {isSaving ? "Saving..." : "Save Requirements"}
                                    </Button>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </motion.div>
    );
}
