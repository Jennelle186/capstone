import { useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import PageHeader from "@/components/admin/document-management/PageHeader";
import { staggerContainer } from "@/components/admin/motion-variants";
import { parseDocumentManagementApiError, toDocumentTypeItem } from "@/lib/document-management-utils";
import { fetchWithClerkAuth } from "@/lib/api";
import type { AdmissionSchemaRecord } from "@/types/admissionSchema";
import type { DocumentTypeApiRecord, DocumentTypeItem } from "@/types/documentType";
import type {
    RequirementAssignmentPayload,
    RequirementAssignmentResponse,
} from "@/types/requirement";
import type { SchoolYearRecord } from "@/types/schoolYear";
import RequirementsChecklistCard from "./RequirementsChecklistCard";
import RequirementsSchoolYearControls from "./RequirementsSchoolYearControls";

export default function RequirementsPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [documentTypes, setDocumentTypes] = useState<DocumentTypeItem[]>([]);
    const [admissionSchemas, setAdmissionSchemas] = useState<AdmissionSchemaRecord[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
    const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
    const [initialSelectedRequirementIds, setInitialSelectedRequirementIds] = useState<Set<string>>(new Set());
    const [draftSelectedRequirementIds, setDraftSelectedRequirementIds] = useState<Set<string>>(new Set());
    const [initialAdmissionFormSchemaId, setInitialAdmissionFormSchemaId] = useState("");
    const [draftAdmissionFormSchemaId, setDraftAdmissionFormSchemaId] = useState("");
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
            const [documentTypePayload, schoolYearPayload, admissionSchemaPayload] = await Promise.all([
                requestWithAdminAuth("/api/admin/document-types?status=active"),
                requestWithAdminAuth("/api/admin/school-years"),
                requestWithAdminAuth("/api/admin/admission-form-schemas?status=all"),
            ]);

            const nextDocumentTypes = (documentTypePayload as DocumentTypeApiRecord[]).map(toDocumentTypeItem);
            const nextSchoolYears = schoolYearPayload as SchoolYearRecord[];
            const nextAdmissionSchemas = (admissionSchemaPayload as AdmissionSchemaRecord[]).filter(
                (schema) => schema.status !== "archived",
            );

            setDocumentTypes(nextDocumentTypes);
            setSchoolYears(nextSchoolYears);
            setAdmissionSchemas(nextAdmissionSchemas);

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
                const admissionRequirement = payload.requirements.find((requirement) => {
                    const documentType = documentTypes.find((item) => item.id === requirement.document_type_id);
                    return documentType?.code === "ADMISSION_FORM";
                });
                const nextAdmissionSchemaId = admissionRequirement?.admission_form_schema_id ?? "";
                setInitialSelectedRequirementIds(nextSelectedIds);
                setDraftSelectedRequirementIds(new Set(payload.document_type_ids));
                setInitialAdmissionFormSchemaId(nextAdmissionSchemaId);
                setDraftAdmissionFormSchemaId(nextAdmissionSchemaId);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load school year requirements.");
                setInitialSelectedRequirementIds(new Set());
                setDraftSelectedRequirementIds(new Set());
                setInitialAdmissionFormSchemaId("");
                setDraftAdmissionFormSchemaId("");
            } finally {
                setIsRequirementsLoading(false);
            }
        },
        [documentTypes, requestWithAdminAuth],
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
            setInitialAdmissionFormSchemaId("");
            setDraftAdmissionFormSchemaId("");
            return;
        }
        void loadSchoolYearRequirements(selectedSchoolYearId);
    }, [loadSchoolYearRequirements, selectedSchoolYearId]);

    const availableDocumentTypes = useMemo(
        () => documentTypes.filter((item) => {
            if (!item.isActive || item.isArchived) return false;
            const classifications = item.applicableClassifications ?? [];
            return classifications.length > 0;
        }),
        [documentTypes],
    );

    const selectedSchoolYear = useMemo(
        () => schoolYears.find((item) => item.id === selectedSchoolYearId) ?? null,
        [schoolYears, selectedSchoolYearId],
    );
    const isSelectedSchoolYearClosed = selectedSchoolYear?.status === "closed";
    const admissionFormDocumentType = useMemo(
        () => availableDocumentTypes.find((item) => item.code === "ADMISSION_FORM") ?? null,
        [availableDocumentTypes],
    );

    const handleRequirementToggle = (documentTypeId: string) => {
        if (isSelectedSchoolYearClosed) return;

        setDraftSelectedRequirementIds((prev) => {
            const next = new Set(prev);
            if (next.has(documentTypeId)) {
                next.delete(documentTypeId);
                if (admissionFormDocumentType?.id === documentTypeId) {
                    setDraftAdmissionFormSchemaId("");
                }
            } else {
                next.add(documentTypeId);
            }
            return next;
        });
    };

    const handleSelectAllRequirements = () => {
        if (isSelectedSchoolYearClosed) return;
        setDraftSelectedRequirementIds(new Set(availableDocumentTypes.map((item) => item.id)));
    };

    const handleClearRequirements = () => {
        if (isSelectedSchoolYearClosed) return;
        setDraftSelectedRequirementIds(new Set());
        setDraftAdmissionFormSchemaId("");
    };

    const handleSaveRequirements = async () => {
        if (!selectedSchoolYearId || isSaving) return;
        if (isSelectedSchoolYearClosed) {
            toast.error("Closed school years are read-only. Requirements cannot be changed.");
            return;
        }

        const nextSelectedIds = availableDocumentTypes
            .map((item) => item.id)
            .filter((id) => draftSelectedRequirementIds.has(id));
        const isAdmissionFormSelected =
            admissionFormDocumentType !== null && nextSelectedIds.includes(admissionFormDocumentType.id);

        if (isAdmissionFormSelected && !draftAdmissionFormSchemaId) {
            toast.error("Select an admission form schema for this school year before saving.");
            return;
        }

        setIsSaving(true);
        try {
            const payload: RequirementAssignmentPayload = {
                school_year_id: selectedSchoolYearId,
                document_type_ids: nextSelectedIds,
                requirements: nextSelectedIds.map((documentTypeId) => ({
                    document_type_id: documentTypeId,
                    admission_form_schema_id:
                        admissionFormDocumentType?.id === documentTypeId
                            ? draftAdmissionFormSchemaId
                            : null,
                })),
            };

            const response = (await requestWithAdminAuth("/api/admin/requirements", {
                method: "PUT",
                body: JSON.stringify(payload),
            })) as RequirementAssignmentResponse;

            const nextSelectedSet = new Set(response.document_type_ids);
            const admissionRequirement = response.requirements.find((requirement) => {
                const documentType = availableDocumentTypes.find((item) => item.id === requirement.document_type_id);
                return documentType?.code === "ADMISSION_FORM";
            });
            const nextAdmissionSchemaId = admissionRequirement?.admission_form_schema_id ?? "";
            setInitialSelectedRequirementIds(nextSelectedSet);
            setDraftSelectedRequirementIds(new Set(response.document_type_ids));
            setInitialAdmissionFormSchemaId(nextAdmissionSchemaId);
            setDraftAdmissionFormSchemaId(nextAdmissionSchemaId);

            toast.success(`Requirements for ${selectedSchoolYear?.name ?? "selected school year"} saved.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save requirements.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetRequirements = () => {
        setDraftSelectedRequirementIds(new Set(initialSelectedRequirementIds));
        setDraftAdmissionFormSchemaId(initialAdmissionFormSchemaId);
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

            <RequirementsSchoolYearControls
                schoolYears={schoolYears}
                selectedSchoolYearId={selectedSchoolYearId}
                isRequirementsLoading={isRequirementsLoading}
                onSelectedSchoolYearChange={setSelectedSchoolYearId}
            />

            <RequirementsChecklistCard
                availableDocumentTypes={availableDocumentTypes}
                draftSelectedRequirementIds={draftSelectedRequirementIds}
                admissionSchemas={admissionSchemas}
                selectedAdmissionFormSchemaId={draftAdmissionFormSchemaId}
                selectedSchoolYear={selectedSchoolYear}
                selectedSchoolYearId={selectedSchoolYearId}
                isSelectedSchoolYearClosed={isSelectedSchoolYearClosed}
                isRequirementsLoading={isRequirementsLoading}
                isSaving={isSaving}
                onRequirementToggle={handleRequirementToggle}
                onAdmissionFormSchemaChange={setDraftAdmissionFormSchemaId}
                onSelectAllRequirements={handleSelectAllRequirements}
                onClearRequirements={handleClearRequirements}
                onResetRequirements={handleResetRequirements}
                onSaveRequirements={handleSaveRequirements}
            />
        </motion.div>
    );
}
