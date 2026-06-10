import { motion } from "framer-motion";
import { AlertTriangle, CheckCheck, ClipboardList, Save, X } from "lucide-react";
import { Link } from "react-router";

import EmptyState from "@/components/admin/document-management/EmptyState";
import RequirementChecklist from "@/components/admin/document-management/RequirementChecklist";
import { fadeInUp } from "@/components/admin/motion-variants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdmissionSchemaRecord } from "@/types/admissionSchema";
import type { DocumentTypeItem } from "@/types/documentType";
import type { SchoolYearRecord } from "@/types/schoolYear";

type RequirementsChecklistCardProps = {
    availableDocumentTypes: DocumentTypeItem[];
    draftSelectedRequirementIds: Set<string>;
    admissionSchemas: AdmissionSchemaRecord[];
    selectedAdmissionFormSchemaId: string;
    selectedSchoolYear: SchoolYearRecord | null;
    selectedSchoolYearId: string;
    isSelectedSchoolYearClosed: boolean;
    isRequirementsLoading: boolean;
    isSaving: boolean;
    onRequirementToggle: (documentTypeId: string) => void;
    onAdmissionFormSchemaChange: (schemaId: string) => void;
    onSelectAllRequirements: () => void;
    onClearRequirements: () => void;
    onResetRequirements: () => void;
    onSaveRequirements: () => void | Promise<void>;
};

export default function RequirementsChecklistCard({
    availableDocumentTypes,
    draftSelectedRequirementIds,
    admissionSchemas,
    selectedAdmissionFormSchemaId,
    selectedSchoolYear,
    selectedSchoolYearId,
    isSelectedSchoolYearClosed,
    isRequirementsLoading,
    isSaving,
    onRequirementToggle,
    onAdmissionFormSchemaChange,
    onSelectAllRequirements,
    onClearRequirements,
    onResetRequirements,
    onSaveRequirements,
}: RequirementsChecklistCardProps) {
    const selectedAvailableCount = availableDocumentTypes.filter((item) => (
        draftSelectedRequirementIds.has(item.id)
    )).length;
    const admissionFormDocumentType = availableDocumentTypes.find((item) => item.code === "ADMISSION_FORM") ?? null;
    const isAdmissionFormSelected =
        admissionFormDocumentType !== null && draftSelectedRequirementIds.has(admissionFormDocumentType.id);
    const allAvailableSelected =
        availableDocumentTypes.length > 0 && selectedAvailableCount === availableDocumentTypes.length;
    const isEditingDisabled = isSelectedSchoolYearClosed || isRequirementsLoading || isSaving;
    const formatSchemaOption = (schema: AdmissionSchemaRecord) => {
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
                            />
                            {isAdmissionFormSelected ? (
                                <div className="rounded-md border bg-cyan-50/50 p-4">
                                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
                                        <div>
                                            <h3 className="text-sm font-semibold text-foreground">
                                                Admission Form Extraction Schema
                                            </h3>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                Select the schema version LlamaExtract should use for this school year.
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="admission-form-schema">Schema Version</Label>
                                            <Select
                                                value={selectedAdmissionFormSchemaId}
                                                onValueChange={onAdmissionFormSchemaChange}
                                                disabled={isEditingDisabled}
                                            >
                                                <SelectTrigger id="admission-form-schema">
                                                    <SelectValue placeholder="Select a schema" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {admissionSchemas.map((schema) => (
                                                        <SelectItem key={schema.id} value={schema.id}>
                                                            {formatSchemaOption(schema)}
                                                            {schema.status === "active" ? " [active]" : ""}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {admissionSchemas.length === 0 ? (
                                                <p className="text-xs text-destructive">
                                                    Create an admission schema before saving this requirement.
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
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
