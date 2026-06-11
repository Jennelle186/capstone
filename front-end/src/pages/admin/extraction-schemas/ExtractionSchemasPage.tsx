import { useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import SchemaBuilderCard from "@/components/admin/extraction-schemas/SchemaBuilderCard";
import SchemaPreviewCard from "@/components/admin/extraction-schemas/SchemaPreviewCard";
import PageHeader from "@/components/admin/document-management/PageHeader";
import { fadeInUp, staggerContainer } from "@/components/admin/motion-variants";
import { Button } from "@/components/ui/button";
import { fetchWithClerkAuth } from "@/lib/api";
import { parseDocumentManagementApiError } from "@/lib/document-management-utils";
import {
    createEmptyPayload,
    createField,
    getSchemaFields,
    hasSchemaProperties,
    patchSchemaField,
    preparePayload,
    removeSchemaField,
} from "@/lib/schema-utils";
import type { DocumentTypeApiRecord } from "@/types/documentType";
import type {
    ExtractionSchemaField,
    ExtractionSchemaGenerateResponse,
    ExtractionSchemaPayload,
    ExtractionSchemaRecord,
} from "@/types/extractionSchema";

type MaximizedPanel = "preview" | "builder" | null;

export default function ExtractionSchemasPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();

    const [schemas, setSchemas] = useState<ExtractionSchemaRecord[]>([]);
    const [documentTypes, setDocumentTypes] = useState<DocumentTypeApiRecord[]>([]);
    const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
    const [formState, setFormState] = useState<ExtractionSchemaPayload>(createEmptyPayload);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isActionPending, setIsActionPending] = useState(false);
    const [formError, setFormError] = useState("");
    const [sampleFiles, setSampleFiles] = useState<File[]>([]);
    const [samplePreviewUrls, setSamplePreviewUrls] = useState<string[]>([]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [maximizedPanel, setMaximizedPanel] = useState<MaximizedPanel>(null);

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

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [schemaPayload, docTypePayload] = await Promise.all([
                requestWithAdminAuth("/api/admin/extraction-schemas?status=all"),
                requestWithAdminAuth("/api/admin/document-types?status=all"),
            ]);
            const payload = schemaPayload as ExtractionSchemaRecord[];
            setDocumentTypes(docTypePayload as DocumentTypeApiRecord[]);
            setSchemas(payload);

            const hasSchemaQuery = window.location.search.includes("s=");
            if (!hasSchemaQuery && payload.length > 0) {
                const activeSchema = payload.find((schema) => schema.status === "active") ?? payload[0];
                setSelectedSchemaId(activeSchema.id);
                setFormState({
                    name: activeSchema.name,
                    version_label: activeSchema.version_label ?? "",
                    effective_date: activeSchema.effective_date ?? "",
                    description: activeSchema.description ?? "",
                    schema_json: activeSchema.schema_json,
                    fields_json: getSchemaFields(activeSchema.schema_json, activeSchema.fields_json),
                    document_type_id: activeSchema.document_type_id ?? null,
                    status: activeSchema.status,
                    source_file_name: activeSchema.source_file_name,
                    generation_prompt: activeSchema.generation_prompt ?? "",
                });
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load extraction schemas.");
        } finally {
            setIsLoading(false);
        }
    }, [requestWithAdminAuth]);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setIsLoading(false);
            return;
        }
        void loadData();
    }, [isLoaded, isSignedIn, loadData]);

    useEffect(() => {
        const urls = sampleFiles.map((file) => URL.createObjectURL(file));
        setSamplePreviewUrls(urls);
        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [sampleFiles]);

    useEffect(() => {
        if (currentPageIndex >= sampleFiles.length) {
            setCurrentPageIndex(Math.max(0, sampleFiles.length - 1));
        }
    }, [sampleFiles.length, currentPageIndex]);

    const [searchParams] = useSearchParams();
    const initialParamAppliedRef = useRef(false);

    useEffect(() => {
        if (initialParamAppliedRef.current) return;
        if (schemas.length === 0) return;

        const schemaIdFromUrl = searchParams.get("s");
        if (!schemaIdFromUrl) return;

        const match = schemas.find((s) => s.id === schemaIdFromUrl);
        if (match) {
            setSelectedSchemaId(match.id);
            setFormState({
                name: match.name,
                version_label: match.version_label ?? "",
                effective_date: match.effective_date ?? "",
                description: match.description ?? "",
                schema_json: match.schema_json,
                fields_json: getSchemaFields(match.schema_json, match.fields_json),
                document_type_id: match.document_type_id ?? null,
                status: match.status,
                source_file_name: match.source_file_name,
                generation_prompt: match.generation_prompt ?? "",
            });
            setSampleFiles([]);
            setCurrentPageIndex(0);
            setFormError("");
            initialParamAppliedRef.current = true;
        }
    }, [searchParams, schemas]);

    const startNewSchema = () => {
        setSelectedSchemaId(null);
        setFormState(createEmptyPayload());
        setSampleFiles([]);
        setCurrentPageIndex(0);
        setFormError("");
    };

    const selectSchema = (schema: ExtractionSchemaRecord) => {
        setSelectedSchemaId(schema.id);
        setFormState({
            name: schema.name,
            version_label: schema.version_label ?? "",
            effective_date: schema.effective_date ?? "",
            description: schema.description ?? "",
            schema_json: schema.schema_json,
            fields_json: getSchemaFields(schema.schema_json, schema.fields_json),
            document_type_id: schema.document_type_id ?? null,
            status: schema.status,
            source_file_name: schema.source_file_name,
            generation_prompt: schema.generation_prompt ?? "",
        });
        setSampleFiles([]);
        setCurrentPageIndex(0);
        setFormError("");
    };

    const handleSchemaSelectChange = (schemaId: string) => {
        const schema = schemas.find((item) => item.id === schemaId);
        if (schema) selectSchema(schema);
    };

    const handleSampleFilesChange = (files: File[]) => {
        setSampleFiles(files);
        setCurrentPageIndex(0);
        setFormState((prev) => ({
            ...prev,
            source_file_name: files[0]?.name ?? prev.source_file_name,
        }));
    };

    const clearSampleFiles = () => {
        setSampleFiles([]);
        setCurrentPageIndex(0);
    };

    const removeFileAt = (index: number) => {
        setSampleFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const toggleMaximize = (panel: MaximizedPanel) => {
        setMaximizedPanel((prev) => (prev === panel ? null : panel));
    };

    const handleDocumentTypeChange = useCallback((documentTypeId: string | null) => {
        setSelectedSchemaId(null);
        setFormState(createEmptyPayload());
        setFormState((prev) => ({ ...prev, document_type_id: documentTypeId }));
        setSampleFiles([]);
        setCurrentPageIndex(0);
        setFormError("");
    }, []);

    const handleFormPatch = useCallback((patch: Partial<ExtractionSchemaPayload>) => {
        setFormState((prev) => ({ ...prev, ...patch }));
    }, []);

    const updateField = (fieldId: string, next: Partial<ExtractionSchemaField>) => {
        setFormState((prev) => {
            const previousField = prev.fields_json.find((field) => field.id === fieldId);
            const fields = prev.fields_json.map((field) =>
                field.id === fieldId ? { ...field, ...next } : field,
            );
            const nextField = fields.find((field) => field.id === fieldId);
            const schema_json =
                previousField && nextField && hasSchemaProperties(prev.schema_json)
                    ? patchSchemaField(prev.schema_json, previousField, nextField)
                    : prev.schema_json;

            return {
                ...prev,
                fields_json: fields,
                schema_json,
            };
        });
        setFormError("");
    };

    const removeField = (fieldId: string) => {
        setFormState((prev) => {
            if (prev.fields_json.length <= 1) return prev;

            const fieldToRemove = prev.fields_json.find((field) => field.id === fieldId);
            return {
                ...prev,
                fields_json: prev.fields_json.filter((field) => field.id !== fieldId),
                schema_json:
                    fieldToRemove && hasSchemaProperties(prev.schema_json)
                        ? removeSchemaField(prev.schema_json, fieldToRemove)
                        : prev.schema_json,
            };
        });
    };

    const addField = useCallback(() => {
        setFormState((prev) => ({
            ...prev,
            fields_json: [...prev.fields_json, createField()],
        }));
    }, []);

    const handleSave = async () => {
        if (isSaving) return;

        const payload = preparePayload(formState);
        if (!payload.name) {
            setFormError("Schema name is required.");
            return;
        }
        if (payload.fields_json.length === 0) {
            setFormError("Add at least one schema field before saving.");
            return;
        }

        setIsSaving(true);
        try {
            if (selectedSchemaId) {
                const response = (await requestWithAdminAuth(
                    `/api/admin/extraction-schemas/${selectedSchemaId}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                    },
                )) as ExtractionSchemaRecord;
                setSchemas((prev) => prev.map((schema) => (schema.id === response.id ? response : schema)));
                setSelectedSchemaId(response.id);
                toast.success("Extraction schema updated.");
            } else {
                const response = (await requestWithAdminAuth("/api/admin/extraction-schemas", {
                    method: "POST",
                    body: JSON.stringify(payload),
                })) as ExtractionSchemaRecord;
                setSchemas((prev) => [response, ...prev]);
                setSelectedSchemaId(response.id);
                toast.success("Extraction schema created.");
            }
            setFormState(payload);
            setFormError("");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to save extraction schema.";
            setFormError(message);
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateSchema = async () => {
        if (sampleFiles.length === 0 || isGenerating) return;

        const formData = new FormData();
        sampleFiles.forEach((file) => formData.append("files", file));
        if (formState.generation_prompt?.trim()) {
            formData.append("prompt", formState.generation_prompt.trim());
        }

        setIsGenerating(true);
        try {
            const response = (await requestWithAdminAuth(
                "/api/admin/extraction-schemas/generate",
                {
                    method: "POST",
                    body: formData,
                },
            )) as ExtractionSchemaGenerateResponse;

            setFormState((prev) => ({
                ...prev,
                schema_json: response.schema_json,
                fields_json: getSchemaFields(response.schema_json, response.fields_json.length > 0 ? response.fields_json : prev.fields_json),
                source_file_name: response.source_file_name ?? sampleFiles[0]?.name ?? prev.source_file_name,
            }));
            setFormError("");
            toast.success("Schema generated. Review and edit the fields before saving.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to generate schema.";
            setFormError(message);
            toast.error(message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleActivate = async () => {
        if (!selectedSchemaId || isActionPending) return;

        setIsActionPending(true);
        try {
            const response = (await requestWithAdminAuth(
                `/api/admin/extraction-schemas/${selectedSchemaId}/activate`,
                { method: "POST" },
            )) as ExtractionSchemaRecord;
            setSchemas((prev) =>
                prev.map((schema) =>
                    schema.id === response.id
                        ? response
                        : schema.status === "active"
                            ? { ...schema, status: "draft" }
                            : schema,
                ),
            );
            setFormState((prev) => ({ ...prev, status: "active" }));
            toast.success("Extraction schema is now active.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to activate extraction schema.");
        } finally {
            setIsActionPending(false);
        }
    };

    const handleArchive = async () => {
        if (!selectedSchemaId || isActionPending) return;

        setIsActionPending(true);
        try {
            const response = (await requestWithAdminAuth(
                `/api/admin/extraction-schemas/${selectedSchemaId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ status: "archived" }),
                },
            )) as ExtractionSchemaRecord;
            setSchemas((prev) => prev.map((schema) => (schema.id === response.id ? response : schema)));
            setFormState((prev) => ({ ...prev, status: "archived" }));
            toast.success("Extraction schema archived.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to archive extraction schema.");
        } finally {
            setIsActionPending(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading extraction schemas...
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
                title="Extraction Schemas"
                subtitle="Build and manage LlamaExtract schemas used when documents are classified and extracted."
                actions={(
                    <Button onClick={startNewSchema}>
                        <Plus className="mr-2 h-4 w-4" />
                        New Schema
                    </Button>
                )}
            />

            <motion.div
                variants={fadeInUp}
                className={
                    maximizedPanel
                        ? "grid gap-6 grid-cols-1"
                        : "grid gap-6 xl:grid-cols-[minmax(360px,44%)_minmax(0,56%)]"
                }
            >
                {!maximizedPanel || maximizedPanel === "preview" ? (
                    <SchemaPreviewCard
                        sampleFiles={sampleFiles}
                        samplePreviewUrls={samplePreviewUrls}
                        currentPageIndex={currentPageIndex}
                        maximized={maximizedPanel === "preview"}
                        onToggleMaximize={() => toggleMaximize("preview")}
                        onSampleFilesChange={handleSampleFilesChange}
                        onClearSampleFiles={clearSampleFiles}
                        onPageChange={setCurrentPageIndex}
                        onRemoveFileAt={removeFileAt}
                    />
                ) : null}

                {!maximizedPanel || maximizedPanel === "builder" ? (
                    <SchemaBuilderCard
                        schemas={schemas}
                        documentTypes={documentTypes}
                        selectedSchemaId={selectedSchemaId}
                        formState={formState}
                        sampleFiles={sampleFiles}
                        isSaving={isSaving}
                        isGenerating={isGenerating}
                        isActionPending={isActionPending}
                        formError={formError}
                        maximized={maximizedPanel === "builder"}
                        onToggleMaximize={() => toggleMaximize("builder")}
                        onSchemaSelect={handleSchemaSelectChange}
                        onFieldUpdate={updateField}
                        onRemoveField={removeField}
                        onAddField={addField}
                        onFormStatePatch={handleFormPatch}
                        onDocumentTypeChange={handleDocumentTypeChange}
                        onSave={handleSave}
                        onGenerate={handleGenerateSchema}
                        onActivate={handleActivate}
                        onArchive={handleArchive}
                    />
                ) : null}
            </motion.div>
        </motion.div>
    );
}
