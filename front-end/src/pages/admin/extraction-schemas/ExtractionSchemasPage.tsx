import { useAuth } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import ExtractionLayout from "@/components/admin/extraction-schemas/ExtractionLayout";
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
import type { CanonicalKeyItem, CanonicalKeysResponse } from "@/types/analytics";
import type {
    ExtractionSchemaField,
    ExtractionSchemaGenerateResponse,
    ExtractionSchemaPayload,
    ExtractionSchemaRecord,
    SandboxExtractionResponse,
} from "@/types/extractionSchema";

export default function ExtractionSchemasPage() {
    const { getToken: _getToken, isLoaded, isSignedIn } = useAuth();
    const getTokenRef = useRef(_getToken);
    getTokenRef.current = _getToken;

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
    const [isExtracting, setIsExtracting] = useState(false);
    const [sandboxResponse, setSandboxResponse] = useState<unknown>(null);
    const [canonicalKeySuggestions, setCanonicalKeySuggestions] = useState<CanonicalKeyItem[]>([]);
    const [analyticsGroupSuggestions, setAnalyticsGroupSuggestions] = useState<string[]>([]);

    const requestWithAdminAuth = useCallback(
        async (path: string, init?: RequestInit): Promise<unknown> => {
            const token = await getTokenRef.current();
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
        [],
    );

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [schemaPayload, docTypePayload, canonicalKeysResult] = await Promise.allSettled([
                requestWithAdminAuth("/api/admin/extraction-schemas?status=all"),
                requestWithAdminAuth("/api/admin/document-types?status=all"),
                requestWithAdminAuth("/api/admin/analytics/canonical-keys"),
            ]);

            if (schemaPayload.status === "rejected") {
                toast.error(schemaPayload.reason instanceof Error ? schemaPayload.reason.message : "Failed to load extraction schemas.");
            }
            if (docTypePayload.status === "rejected") {
                toast.error(docTypePayload.reason instanceof Error ? docTypePayload.reason.message : "Failed to load document types.");
            }

            const payload = (schemaPayload.status === "fulfilled" ? schemaPayload.value : []) as ExtractionSchemaRecord[];
            setDocumentTypes((docTypePayload.status === "fulfilled" ? docTypePayload.value : []) as DocumentTypeApiRecord[]);
            setSchemas(payload);

            const canonicalKeys = canonicalKeysResult.status === "fulfilled"
                ? ((canonicalKeysResult.value as CanonicalKeysResponse | null)?.keys ?? [])
                : [];
            setCanonicalKeySuggestions(canonicalKeys);
            const groups = Array.from(
                new Set(
                    canonicalKeys
                        .map((item) => item.analytics_group)
                        .filter((g): g is string => typeof g === "string" && g.length > 0),
                ),
            ).sort();
            setAnalyticsGroupSuggestions(groups);

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

    const handleDocumentTypeChange = useCallback((documentTypeId: string | null) => {
        setFormState((prev) => ({ ...prev, document_type_id: documentTypeId }));
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

    const addField = useCallback((afterFieldId?: string) => {
        setFormState((prev) => {
            const newField = createField();
            if (!afterFieldId) {
                return { ...prev, fields_json: [...prev.fields_json, newField] };
            }
            const idx = prev.fields_json.findIndex((f) => f.id === afterFieldId);
            if (idx === -1) {
                return { ...prev, fields_json: [...prev.fields_json, newField] };
            }
            let sectionId: string | null = null;
            let sectionTitle: string | null = null;
            for (let i = idx; i >= 0; i--) {
                if (prev.fields_json[i].section_id) {
                    sectionId = prev.fields_json[i].section_id!;
                    sectionTitle = prev.fields_json[i].section_title!;
                    break;
                }
            }
            const field = { ...newField, section_id: sectionId, section_title: sectionTitle };
            const fields = [...prev.fields_json];
            fields.splice(idx + 1, 0, field);
            return { ...prev, fields_json: fields };
        });
    }, []);

    const addSection = useCallback((afterFieldId?: string) => {
        const title = window.prompt("Section name:") || "New Section";
        const sectionKey = title.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        const sectionField: ExtractionSchemaField = {
            ...createField(),
            section_id: sectionKey || "new_section",
            section_title: title.trim(),
        };
        setFormState((prev) => {
            if (!afterFieldId) {
                return { ...prev, fields_json: [...prev.fields_json, sectionField] };
            }
            const idx = prev.fields_json.findIndex((f) => f.id === afterFieldId);
            if (idx === -1) {
                return { ...prev, fields_json: [...prev.fields_json, sectionField] };
            }
            const fields = [...prev.fields_json];
            fields.splice(idx + 1, 0, sectionField);
            return { ...prev, fields_json: fields };
        });
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
        if (isGenerating) return;

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

            setFormState((prev) => {
                const blueprint = response.schema_json as Record<string, unknown> | undefined;
                return {
                    ...prev,
                    schema_json: response.schema_json,
                    fields_json: getSchemaFields(response.schema_json, response.fields_json.length > 0 ? response.fields_json : prev.fields_json),
                    source_file_name: response.source_file_name ?? sampleFiles[0]?.name ?? prev.source_file_name,
                    name: prev.name || (blueprint?.form_name as string) || "",
                    version_label: prev.version_label || (blueprint?.form_control_id as string) || "",
                    document_type_id: response.document_type_id ?? prev.document_type_id,
                    effective_date: prev.effective_date || response.effective_date || "",
                };
            });
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

    const handleAutoGenerate = useCallback(async (files: File[]) => {
        if (isGenerating) return;
        setSampleFiles(files);
        setCurrentPageIndex(0);
        setIsGenerating(true);
        try {
            const formData = new FormData();
            files.forEach((f) => formData.append("files", f));
            if (formState.generation_prompt?.trim()) {
                formData.append("prompt", formState.generation_prompt.trim());
            }
            const response = (await requestWithAdminAuth(
                "/api/admin/extraction-schemas/generate",
                { method: "POST", body: formData },
            )) as ExtractionSchemaGenerateResponse;
            setFormState((prev) => {
                const blueprint = response.schema_json as Record<string, unknown> | undefined;
                return {
                    ...prev,
                    schema_json: response.schema_json,
                    fields_json: getSchemaFields(response.schema_json, response.fields_json),
                    source_file_name: response.source_file_name ?? files[0]?.name ?? prev.source_file_name,
                    name: prev.name || (blueprint?.form_name as string) || "",
                    version_label: prev.version_label || (blueprint?.form_control_id as string) || "",
                    document_type_id: response.document_type_id ?? prev.document_type_id,
                    effective_date: prev.effective_date || response.effective_date || "",
                };
            });
            setFormError("");
            toast.success("Schema auto-generated from uploaded file.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Auto-generation failed.";
            setFormError(message);
            toast.error(message);
        } finally {
            setIsGenerating(false);
        }
    }, [isGenerating, formState.generation_prompt, requestWithAdminAuth]);

    const handleActivate = async (schemaId: string) => {
        if (!schemaId || isActionPending) return;

        setIsActionPending(true);
        try {
            const response = (await requestWithAdminAuth(
                `/api/admin/extraction-schemas/${schemaId}/activate`,
                { method: "POST" },
            )) as ExtractionSchemaRecord;
            setSchemas((prev) =>
                prev.map((schema) =>
                    schema.id === response.id
                        ? response
                        : schema.status === "active" && schema.document_type_id === response.document_type_id
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

    const handleArchive = async (schemaId: string) => {
        if (!schemaId || isActionPending) return;

        setIsActionPending(true);
        try {
            const response = (await requestWithAdminAuth(
                `/api/admin/extraction-schemas/${schemaId}`,
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

    const handleRunExtraction = useCallback(async () => {
        if (isExtracting || sampleFiles.length === 0) return;
        setIsExtracting(true);
        setSandboxResponse(null);
        try {
            const token = await getTokenRef.current();
            if (!token) throw new Error("Missing admin authentication token.");
            const formData = new FormData();
            sampleFiles.forEach((file) => formData.append("files", file));
            const response = await fetchWithClerkAuth("/api/admin/extractions/run", token, {
                method: "POST",
                body: formData,
            });
            if (!response.ok) throw new Error("Extraction request failed.");
            const result = (await response.json()) as SandboxExtractionResponse;
            setSandboxResponse(result);
            toast.success("Extraction completed successfully.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Extraction failed.";
            toast.error(message);
        } finally {
            setIsExtracting(false);
        }
    }, [isExtracting, sampleFiles]);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading extraction schemas...
            </div>
        );
    }

    return (
        <ExtractionLayout
            schemas={schemas}
            documentTypes={documentTypes}
            selectedSchemaId={selectedSchemaId}
            formState={formState}
            sampleFiles={sampleFiles}
            samplePreviewUrls={samplePreviewUrls}
            currentPageIndex={currentPageIndex}
            isSaving={isSaving}
            isGenerating={isGenerating}
            isActionPending={isActionPending}
            formError={formError}
            isExtracting={isExtracting}
            sandboxResponse={sandboxResponse}
            onSchemaSelect={handleSchemaSelectChange}
            onFieldUpdate={updateField}
            onRemoveField={removeField}
            onAddField={addField}
            onAddSection={addSection}
            onFormStatePatch={handleFormPatch}
            onDocumentTypeChange={handleDocumentTypeChange}
            onSave={handleSave}
            onGenerate={handleGenerateSchema}
            onAutoGenerate={handleAutoGenerate}
            onActivate={handleActivate}
            onArchive={handleArchive}
            onClearSampleFiles={clearSampleFiles}
            onPageChange={setCurrentPageIndex}
            onRemoveFileAt={removeFileAt}
            onSampleFilesChange={handleSampleFilesChange}
            onNewSchema={startNewSchema}
            onRunExtraction={handleRunExtraction}
            canonicalKeySuggestions={canonicalKeySuggestions}
            analyticsGroupSuggestions={analyticsGroupSuggestions}
        />
    );
}
