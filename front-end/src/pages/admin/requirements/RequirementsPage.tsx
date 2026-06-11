import { useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import PageHeader from "@/components/admin/document-management/PageHeader";
import { staggerContainer } from "@/components/admin/motion-variants";
import { parseDocumentManagementApiError, toDocumentTypeItem } from "@/lib/document-management-utils";
import { fetchWithClerkAuth } from "@/lib/api";
import type { ExtractionSchemaRecord } from "@/types/extractionSchema";
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
    const [extractionSchemas, setExtractionSchemas] = useState<ExtractionSchemaRecord[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
    const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
    const [initialSelectedRequirementIds, setInitialSelectedRequirementIds] = useState<Set<string>>(new Set());
    const [draftSelectedRequirementIds, setDraftSelectedRequirementIds] = useState<Set<string>>(new Set());
    const [initialSchemaIds, setInitialSchemaIds] = useState<Record<string, string>>({});
    const [draftSchemaIds, setDraftSchemaIds] = useState<Record<string, string>>({});
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
            const [documentTypePayload, schoolYearPayload, extractionSchemaPayload] = await Promise.all([
                requestWithAdminAuth("/api/admin/document-types?status=active"),
                requestWithAdminAuth("/api/admin/school-years"),
                requestWithAdminAuth("/api/admin/extraction-schemas?status=all"),
            ]);

            const nextDocumentTypes = (documentTypePayload as DocumentTypeApiRecord[]).map(toDocumentTypeItem);
            const nextSchoolYears = schoolYearPayload as SchoolYearRecord[];
            const nextExtractionSchemas = (extractionSchemaPayload as ExtractionSchemaRecord[]).filter(
                (schema) => schema.status !== "archived",
            );

            setDocumentTypes(nextDocumentTypes);
            setSchoolYears(nextSchoolYears);
            setExtractionSchemas(nextExtractionSchemas);

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
                const schemaMap: Record<string, string> = {};
                for (const requirement of payload.requirements) {
                    if (requirement.extraction_schema_id) {
                        schemaMap[requirement.document_type_id] = requirement.extraction_schema_id;
                    }
                }
                setInitialSelectedRequirementIds(nextSelectedIds);
                setDraftSelectedRequirementIds(new Set(payload.document_type_ids));
                setInitialSchemaIds(schemaMap);
                setDraftSchemaIds({ ...schemaMap });
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load school year requirements.");
                setInitialSelectedRequirementIds(new Set());
                setDraftSelectedRequirementIds(new Set());
                setInitialSchemaIds({});
                setDraftSchemaIds({});
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
            setInitialSchemaIds({});
            setDraftSchemaIds({});
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

    const handleRequirementToggle = (documentTypeId: string) => {
        if (isSelectedSchoolYearClosed) return;

        setDraftSelectedRequirementIds((prev) => {
            const next = new Set(prev);
            if (next.has(documentTypeId)) {
                next.delete(documentTypeId);
                setDraftSchemaIds((prevSchemas) => {
                    const updated = { ...prevSchemas };
                    delete updated[documentTypeId];
                    return updated;
                });
            } else {
                next.add(documentTypeId);
            }
            return next;
        });
    };

    const handleSchemaChange = (documentTypeId: string, schemaId: string) => {
        setDraftSchemaIds((prev) => ({ ...prev, [documentTypeId]: schemaId }));
    };

    const handleSelectAllRequirements = () => {
        if (isSelectedSchoolYearClosed) return;
        setDraftSelectedRequirementIds(new Set(availableDocumentTypes.map((item) => item.id)));
    };

    const handleClearRequirements = () => {
        if (isSelectedSchoolYearClosed) return;
        setDraftSelectedRequirementIds(new Set());
        setDraftSchemaIds({});
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

        setIsSaving(true);
        try {
            const payload: RequirementAssignmentPayload = {
                school_year_id: selectedSchoolYearId,
                document_type_ids: nextSelectedIds,
                requirements: nextSelectedIds.map((documentTypeId) => ({
                    document_type_id: documentTypeId,
                    extraction_schema_id: draftSchemaIds[documentTypeId] || null,
                })),
            };

            const response = (await requestWithAdminAuth("/api/admin/requirements", {
                method: "PUT",
                body: JSON.stringify(payload),
            })) as RequirementAssignmentResponse;

            const nextSelectedSet = new Set(response.document_type_ids);
            const schemaMap: Record<string, string> = {};
            for (const requirement of response.requirements) {
                if (requirement.extraction_schema_id) {
                    schemaMap[requirement.document_type_id] = requirement.extraction_schema_id;
                }
            }
            setInitialSelectedRequirementIds(nextSelectedSet);
            setDraftSelectedRequirementIds(new Set(response.document_type_ids));
            setInitialSchemaIds(schemaMap);
            setDraftSchemaIds({ ...schemaMap });

            toast.success(`Requirements for ${selectedSchoolYear?.name ?? "selected school year"} saved.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save requirements.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetRequirements = () => {
        setDraftSelectedRequirementIds(new Set(initialSelectedRequirementIds));
        setDraftSchemaIds({ ...initialSchemaIds });
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
                extractionSchemas={extractionSchemas}
                draftSchemaIds={draftSchemaIds}
                selectedSchoolYear={selectedSchoolYear}
                selectedSchoolYearId={selectedSchoolYearId}
                isSelectedSchoolYearClosed={isSelectedSchoolYearClosed}
                isRequirementsLoading={isRequirementsLoading}
                isSaving={isSaving}
                onRequirementToggle={handleRequirementToggle}
                onSchemaChange={handleSchemaChange}
                onSelectAllRequirements={handleSelectAllRequirements}
                onClearRequirements={handleClearRequirements}
                onResetRequirements={handleResetRequirements}
                onSaveRequirements={handleSaveRequirements}
            />
        </motion.div>
    );
}
