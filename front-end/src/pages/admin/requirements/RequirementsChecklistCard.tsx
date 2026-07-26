import { motion } from "framer-motion";
import { AlertTriangle, CheckCheck, ClipboardList, Save, X } from "lucide-react";
import { Link } from "react-router";

import EmptyState from "@/components/admin/document-management/EmptyState";
import RequirementChecklist from "@/components/admin/document-management/RequirementChecklist";
import { fadeInUp } from "@/components/admin/motion-variants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExtractionSchemaRecord } from "@/types/extractionSchema";
import type { DocumentTypeItem } from "@/types/documentType";
import type { SchoolYearRecord } from "@/types/schoolYear";

type RequirementsChecklistCardProps = {
    availableDocumentTypes: DocumentTypeItem[];
    draftSelectedRequirementIds: Set<string>;
    extractionSchemas: ExtractionSchemaRecord[];
    draftSchemaIds: Record<string, string>;
    selectedSchoolYear: SchoolYearRecord | null;
    selectedSchoolYearId: string;
    isSelectedSchoolYearClosed: boolean;
    isRequirementsLoading: boolean;
    isSaving: boolean;
    onRequirementToggle: (documentTypeId: string) => void;
    onSchemaChange: (documentTypeId: string, schemaId: string) => void;
    onSelectAllRequirements: () => void;
    onClearRequirements: () => void;
    onResetRequirements: () => void;
    onSaveRequirements: () => void | Promise<void>;
};

export default function RequirementsChecklistCard({
    availableDocumentTypes,
    draftSelectedRequirementIds,
    extractionSchemas,
    draftSchemaIds,
    selectedSchoolYear,
    selectedSchoolYearId,
    isSelectedSchoolYearClosed,
    isRequirementsLoading,
    isSaving,
    onRequirementToggle,
    onSchemaChange,
    onSelectAllRequirements,
    onClearRequirements,
    onResetRequirements,
    onSaveRequirements,
}: RequirementsChecklistCardProps) {
    const selectedAvailableCount = availableDocumentTypes.filter((item) => (
        draftSelectedRequirementIds.has(item.id)
    )).length;
    const allAvailableSelected =
        availableDocumentTypes.length > 0 && selectedAvailableCount === availableDocumentTypes.length;
    const isEditingDisabled = isSelectedSchoolYearClosed || isRequirementsLoading || isSaving;
    const formatSchemaOption = (schema: ExtractionSchemaRecord) => {
        const meta = [
            schema.version_label,
            schema.effective_date ? `effective ${schema.effective_date}` : null,
        ].filter(Boolean).join(" · ");
        return meta ? `${schema.name} (${meta})` : schema.name;
    };

    return (
        <motion.div variants={fadeInUp}>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-blue-700" />
                        Requirement Checklist {selectedSchoolYear ? `(${selectedSchoolYear.name})` : ""}
                    </CardTitle>
                    <CardDescription>
                        {isSelectedSchoolYearClosed
                            ? "Review document types required for this closed school year."
                            : "Select document types required for enrollment in this school year."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isSelectedSchoolYearClosed ? (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>
                                This school year is closed and archived. Requirements are read-only and cannot be changed.
                            </p>
                        </div>
                    ) : null}
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
                            <div className="flex flex-col gap-3 rounded-md border bg-slate-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={onSelectAllRequirements}
                                        disabled={isEditingDisabled || allAvailableSelected}
                                    >
                                        <CheckCheck className="mr-2 h-4 w-4" />
                                        Select All
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={onClearRequirements}
                                        disabled={isEditingDisabled || selectedAvailableCount === 0}
                                    >
                                        <X className="mr-2 h-4 w-4" />
                                        Clear
                                    </Button>
                                </div>
                            </div>
                            <RequirementChecklist
                                disabled={isEditingDisabled}
                                items={availableDocumentTypes}
                                selectedIds={draftSelectedRequirementIds}
                                onToggle={onRequirementToggle}
                                renderRowSuffix={(item) => {
                                    const docSchemas = extractionSchemas.filter(
                                        (s) => (s.document_type_id === item.id || s.document_type_id === null) && s.status !== "archived",
                                    );
                                    if (docSchemas.length === 0) return null;
                                    const isSelected = draftSelectedRequirementIds.has(item.id);
                                    const needsSchema = isSelected && !draftSchemaIds[item.id];
                                    return (
                                        <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                                            <Select
                                                value={draftSchemaIds[item.id] ?? "__none__"}
                                                onValueChange={(value) =>
                                                    onSchemaChange(item.id, value === "__none__" ? "" : value)
                                                }
                                                disabled={isEditingDisabled}
                                            >
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="Schema" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">None</SelectItem>
                                                    {docSchemas.map((schema) => (
                                                        <SelectItem key={schema.id} value={schema.id}>
                                                            {formatSchemaOption(schema)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {needsSchema && (
                                                <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                                    No schema selected
                                                </p>
                                            )}
                                        </div>
                                    );
                                }}
                            />
                            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                                <Button
                                    variant="outline"
                                    onClick={onResetRequirements}
                                    disabled={isEditingDisabled}
                                >
                                    Reset
                                </Button>
                                <Button
                                    onClick={() => {
                                        void onSaveRequirements();
                                    }}
                                    disabled={!selectedSchoolYearId || isEditingDisabled}
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
    );
}
