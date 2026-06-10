import { useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import {
    Archive,
    CheckCircle2,
    FileInput,
    FileJson,
    FileText,
    Loader2,
    Plus,
    Save,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import PageHeader from "@/components/admin/document-management/PageHeader";
import { fadeInUp, staggerContainer } from "@/components/admin/motion-variants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fetchWithClerkAuth } from "@/lib/api";
import { parseDocumentManagementApiError } from "@/lib/document-management-utils";
import type {
    AdmissionSchemaField,
    AdmissionSchemaFieldType,
    AdmissionSchemaGenerateResponse,
    AdmissionSchemaPayload,
    AdmissionSchemaRecord,
    AdmissionSchemaStatus,
} from "@/types/admissionSchema";

const FIELD_TYPES: AdmissionSchemaFieldType[] = ["string", "number", "integer", "boolean"];

function createField(): AdmissionSchemaField {
    const id = crypto.randomUUID();
    return {
        id,
        key: "",
        type: "string",
        description: "",
        required: false,
    };
}

function createEmptyPayload(): AdmissionSchemaPayload {
    return {
        name: "Default Admission Form Schema",
        version_label: "",
        effective_date: "",
        description: "",
        schema_json: {
            type: "object",
            properties: {},
        },
        fields_json: [createField()],
        status: "draft",
        source_file_name: null,
        generation_prompt: "",
    };
}

function normalizeFieldKey(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.]/g, "");
}

function hasSchemaProperties(schema: Record<string, unknown>): boolean {
    const properties = getSchemaProperties(schema);
    return properties !== null && Object.keys(properties).length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneSchema(schema: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
}

function getSchemaProperties(schema: Record<string, unknown>): Record<string, unknown> | null {
    return isRecord(schema.properties) ? schema.properties : null;
}

function getRequiredSet(schema: Record<string, unknown>): Set<string> {
    return new Set(Array.isArray(schema.required) ? schema.required.filter((item) => typeof item === "string") : []);
}

function setSchemaRequired(schema: Record<string, unknown>, key: string, required: boolean) {
    const requiredSet = getRequiredSet(schema);
    if (required) {
        requiredSet.add(key);
    } else {
        requiredSet.delete(key);
    }

    const requiredValues = Array.from(requiredSet);
    if (requiredValues.length > 0) {
        schema.required = requiredValues;
    } else {
        delete schema.required;
    }
}

function resolveFieldType(schema: Record<string, unknown>): AdmissionSchemaFieldType {
    return FIELD_TYPES.includes(schema.type as AdmissionSchemaFieldType)
        ? (schema.type as AdmissionSchemaFieldType)
        : "string";
}

function flattenSchemaToFields(schema: Record<string, unknown>, parentPath = ""): AdmissionSchemaField[] {
    const properties = getSchemaProperties(schema);
    if (!properties) return [];

    const requiredSet = getRequiredSet(schema);
    return Object.entries(properties).flatMap(([key, value]) => {
        if (!isRecord(value)) return [];

        const fieldPath = parentPath ? `${parentPath}.${key}` : key;
        const childProperties = getSchemaProperties(value);
        if (value.type === "object" && childProperties) {
            return flattenSchemaToFields(value, fieldPath);
        }

        return [
            {
                id: fieldPath,
                key: fieldPath,
                type: resolveFieldType(value),
                description: typeof value.description === "string" ? value.description : "",
                required: requiredSet.has(key),
            },
        ];
    });
}

function getSchemaFields(schema: Record<string, unknown>, fallback: AdmissionSchemaField[]): AdmissionSchemaField[] {
    const fields = flattenSchemaToFields(schema);
    return fields.length > 0 ? fields : fallback.length > 0 ? fallback : [createField()];
}

function getParentSchema(
    schema: Record<string, unknown>,
    parentPathParts: string[],
): Record<string, unknown> | null {
    let current: Record<string, unknown> = schema;

    for (const pathPart of parentPathParts) {
        const properties = getSchemaProperties(current);
        if (!properties || !isRecord(properties[pathPart])) return null;
        current = properties[pathPart];
    }

    return current;
}

function ensureParentSchema(
    schema: Record<string, unknown>,
    parentPathParts: string[],
): Record<string, unknown> {
    let current: Record<string, unknown> = schema;
    current.type = "object";
    if (!isRecord(current.properties)) current.properties = {};

    for (const pathPart of parentPathParts) {
        const properties = current.properties as Record<string, unknown>;
        if (!isRecord(properties[pathPart])) {
            properties[pathPart] = {
                type: "object",
                properties: {},
                additionalProperties: false,
            };
        }

        const next = properties[pathPart] as Record<string, unknown>;
        next.type = "object";
        if (!isRecord(next.properties)) next.properties = {};
        current = next;
    }

    return current;
}

function removeSchemaNode(schema: Record<string, unknown>, path: string): Record<string, unknown> | null {
    const pathParts = path.split(".").filter(Boolean);
    if (pathParts.length === 0) return null;

    const leafKey = pathParts[pathParts.length - 1];
    const parent = getParentSchema(schema, pathParts.slice(0, -1));
    const parentProperties = parent ? getSchemaProperties(parent) : null;
    if (!parent || !parentProperties || !isRecord(parentProperties[leafKey])) return null;

    const removedNode = parentProperties[leafKey];
    delete parentProperties[leafKey];
    setSchemaRequired(parent, leafKey, false);
    return removedNode;
}

function putSchemaNode(
    schema: Record<string, unknown>,
    path: string,
    node: Record<string, unknown>,
    required: boolean,
) {
    const pathParts = path.split(".").filter(Boolean);
    if (pathParts.length === 0) return;

    const leafKey = pathParts[pathParts.length - 1];
    const parent = ensureParentSchema(schema, pathParts.slice(0, -1));
    const parentProperties = getSchemaProperties(parent) ?? {};
    parent.properties = parentProperties;
    parentProperties[leafKey] = node;
    setSchemaRequired(parent, leafKey, required);
}

function patchSchemaField(
    schema: Record<string, unknown>,
    previousField: AdmissionSchemaField,
    nextField: AdmissionSchemaField,
): Record<string, unknown> {
    const oldPath = normalizeFieldKey(previousField.key);
    const nextPath = normalizeFieldKey(nextField.key);
    if (!oldPath && !nextPath) return schema;

    const nextSchema = cloneSchema(schema);
    const existingNode = oldPath ? removeSchemaNode(nextSchema, oldPath) : null;
    const node = existingNode ?? {};

    node.type = nextField.type;
    node.description = nextField.description.trim();

    if (nextPath) {
        putSchemaNode(nextSchema, nextPath, node, nextField.required);
    }

    return nextSchema;
}

function removeSchemaField(schema: Record<string, unknown>, field: AdmissionSchemaField): Record<string, unknown> {
    const fieldPath = normalizeFieldKey(field.key);
    if (!fieldPath) return schema;

    const nextSchema = cloneSchema(schema);
    removeSchemaNode(nextSchema, fieldPath);
    return nextSchema;
}

function buildJsonSchema(fields: AdmissionSchemaField[]): Record<string, unknown> {
    const schema: Record<string, unknown> = {
        type: "object",
        properties: {},
        additionalProperties: false,
    };

    fields.forEach((field) => {
        const key = normalizeFieldKey(field.key);
        if (!key) return;

        putSchemaNode(
            schema,
            key,
            {
                type: field.type,
                description: field.description.trim(),
            },
            field.required,
        );
    });

    return schema;
}

function getPreviewSchema(form: AdmissionSchemaPayload): Record<string, unknown> {
    return hasSchemaProperties(form.schema_json) ? form.schema_json : buildJsonSchema(form.fields_json);
}

function preparePayload(form: AdmissionSchemaPayload): AdmissionSchemaPayload {
    const fields = form.fields_json
        .map((field) => ({
            ...field,
            key: normalizeFieldKey(field.key),
            description: field.description.trim(),
        }))
        .filter((field) => field.key);

    return {
        ...form,
        name: form.name.trim(),
        version_label: form.version_label?.trim() || null,
        effective_date: form.effective_date || null,
        description: form.description?.trim() || null,
        source_file_name: form.source_file_name?.trim() || null,
        generation_prompt: form.generation_prompt?.trim() || null,
        fields_json: fields,
        schema_json: hasSchemaProperties(form.schema_json) ? form.schema_json : buildJsonSchema(fields),
    };
}

function statusLabel(status: AdmissionSchemaStatus): string {
    if (status === "active") return "Active";
    if (status === "archived") return "Archived";
    return "Draft";
}

function formatSchemaMeta(schema: Pick<AdmissionSchemaRecord, "version_label" | "effective_date">): string {
    const parts = [
        schema.version_label ? `Version: ${schema.version_label}` : null,
        schema.effective_date ? `Effective: ${schema.effective_date}` : null,
    ].filter(Boolean);
    return parts.join(" - ");
}

function formatSchemaOption(schema: AdmissionSchemaRecord): string {
    const meta = formatSchemaMeta(schema);
    return meta ? `${schema.name} (${meta})` : schema.name;
}

export default function AdmissionSchemasPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const sampleFileInputRef = useRef<HTMLInputElement | null>(null);
    const [schemas, setSchemas] = useState<AdmissionSchemaRecord[]>([]);
    const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
    const [formState, setFormState] = useState<AdmissionSchemaPayload>(createEmptyPayload);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isActionPending, setIsActionPending] = useState(false);
    const [formError, setFormError] = useState("");
    const [sampleFile, setSampleFile] = useState<File | null>(null);
    const [samplePreviewUrl, setSamplePreviewUrl] = useState("");

    const canPreviewSampleFile =
        sampleFile !== null &&
        (
            sampleFile.type === "application/pdf" ||
            sampleFile.type.startsWith("image/") ||
            sampleFile.name.toLowerCase().endsWith(".pdf")
        );
    const isSampleFilePdf =
        sampleFile !== null &&
        (sampleFile.type === "application/pdf" || sampleFile.name.toLowerCase().endsWith(".pdf"));

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

    const loadSchemas = useCallback(async () => {
        setIsLoading(true);
        try {
            const payload = (await requestWithAdminAuth(
                "/api/admin/admission-form-schemas?status=all",
            )) as AdmissionSchemaRecord[];
            setSchemas(payload);
            if (payload.length > 0) {
                const activeSchema = payload.find((schema) => schema.status === "active") ?? payload[0];
                setSelectedSchemaId(activeSchema.id);
                setFormState({
                    name: activeSchema.name,
                    version_label: activeSchema.version_label ?? "",
                    effective_date: activeSchema.effective_date ?? "",
                    description: activeSchema.description ?? "",
                    schema_json: activeSchema.schema_json,
                    fields_json: getSchemaFields(activeSchema.schema_json, activeSchema.fields_json),
                    status: activeSchema.status,
                    source_file_name: activeSchema.source_file_name,
                    generation_prompt: activeSchema.generation_prompt ?? "",
                });
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load admission schemas.");
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
        void loadSchemas();
    }, [isLoaded, isSignedIn, loadSchemas]);

    useEffect(() => {
        if (!sampleFile) {
            setSamplePreviewUrl("");
            return;
        }

        const nextPreviewUrl = URL.createObjectURL(sampleFile);
        setSamplePreviewUrl(nextPreviewUrl);
        return () => {
            URL.revokeObjectURL(nextPreviewUrl);
        };
    }, [sampleFile]);

    const startNewSchema = () => {
        setSelectedSchemaId(null);
        setFormState(createEmptyPayload());
        setSampleFile(null);
        setFormError("");
    };

    const selectSchema = (schema: AdmissionSchemaRecord) => {
        setSelectedSchemaId(schema.id);
        setFormState({
            name: schema.name,
            version_label: schema.version_label ?? "",
            effective_date: schema.effective_date ?? "",
            description: schema.description ?? "",
            schema_json: schema.schema_json,
            fields_json: getSchemaFields(schema.schema_json, schema.fields_json),
            status: schema.status,
            source_file_name: schema.source_file_name,
            generation_prompt: schema.generation_prompt ?? "",
        });
        setSampleFile(null);
        setFormError("");
    };

    const handleSchemaSelectChange = (schemaId: string) => {
        const schema = schemas.find((item) => item.id === schemaId);
        if (schema) selectSchema(schema);
    };

    const handleSampleFileChange = (file: File | null) => {
        setSampleFile(file);
        setFormState((prev) => ({
            ...prev,
            source_file_name: file?.name ?? prev.source_file_name,
        }));
    };

    const clearSampleFile = () => {
        setSampleFile(null);
        if (sampleFileInputRef.current) {
            sampleFileInputRef.current.value = "";
        }
    };

    const updateField = (fieldId: string, next: Partial<AdmissionSchemaField>) => {
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
                    `/api/admin/admission-form-schemas/${selectedSchemaId}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                    },
                )) as AdmissionSchemaRecord;
                setSchemas((prev) => prev.map((schema) => (schema.id === response.id ? response : schema)));
                setSelectedSchemaId(response.id);
                toast.success("Admission schema updated.");
            } else {
                const response = (await requestWithAdminAuth("/api/admin/admission-form-schemas", {
                    method: "POST",
                    body: JSON.stringify(payload),
                })) as AdmissionSchemaRecord;
                setSchemas((prev) => [response, ...prev]);
                setSelectedSchemaId(response.id);
                toast.success("Admission schema created.");
            }
            setFormState(payload);
            setFormError("");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to save admission schema.";
            setFormError(message);
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateSchema = async () => {
        if (!sampleFile || isGenerating) return;

        const formData = new FormData();
        formData.append("file", sampleFile);
        if (formState.generation_prompt?.trim()) {
            formData.append("prompt", formState.generation_prompt.trim());
        }

        setIsGenerating(true);
        try {
            const response = (await requestWithAdminAuth(
                "/api/admin/admission-form-schemas/generate",
                {
                    method: "POST",
                    body: formData,
                },
            )) as AdmissionSchemaGenerateResponse;

            setFormState((prev) => ({
                ...prev,
                schema_json: response.schema_json,
                fields_json: getSchemaFields(response.schema_json, response.fields_json.length > 0 ? response.fields_json : prev.fields_json),
                source_file_name: response.source_file_name ?? sampleFile.name,
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
                `/api/admin/admission-form-schemas/${selectedSchemaId}/activate`,
                { method: "POST" },
            )) as AdmissionSchemaRecord;
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
            toast.success("Admission schema is now active.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to activate admission schema.");
        } finally {
            setIsActionPending(false);
        }
    };

    const handleArchive = async () => {
        if (!selectedSchemaId || isActionPending) return;

        setIsActionPending(true);
        try {
            const response = (await requestWithAdminAuth(
                `/api/admin/admission-form-schemas/${selectedSchemaId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ status: "archived" }),
                },
            )) as AdmissionSchemaRecord;
            setSchemas((prev) => prev.map((schema) => (schema.id === response.id ? response : schema)));
            setFormState((prev) => ({ ...prev, status: "archived" }));
            toast.success("Admission schema archived.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to archive admission schema.");
        } finally {
            setIsActionPending(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading admission schemas...
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
                title="Admission Form Schemas"
                subtitle="Build the LlamaExtract schema used when an uploaded document is classified as an admission form."
                actions={(
                    <Button onClick={startNewSchema}>
                        <Plus className="mr-2 h-4 w-4" />
                        New Schema
                    </Button>
                )}
            />

            <motion.div
                variants={fadeInUp}
                className="grid gap-6 xl:grid-cols-[minmax(360px,44%)_minmax(0,56%)]"
            >
                <Card className="flex h-[calc(100vh-230px)] min-h-[680px] flex-col overflow-hidden">
                    <CardHeader className="shrink-0 border-b">
                        <CardTitle>Sample Preview</CardTitle>
                        <CardDescription>Review the uploaded admission form while editing schema fields.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col p-4">
                        <div className="flex flex-wrap items-center gap-2 pb-3">
                            <input
                                ref={sampleFileInputRef}
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                className="hidden"
                                onChange={(event) => {
                                    handleSampleFileChange(event.target.files?.[0] ?? null);
                                }}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => sampleFileInputRef.current?.click()}
                            >
                                <Upload className="mr-2 h-4 w-4" />
                                Upload
                            </Button>
                            <span className="text-sm font-medium text-foreground">
                                {sampleFile ? "1 file" : "No file"}
                            </span>
                            {sampleFile ? (
                                <div className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-3 py-1.5">
                                    <span className="truncate text-sm">{sampleFile.name}</span>
                                    <button
                                        type="button"
                                        className="text-muted-foreground hover:text-foreground"
                                        onClick={clearSampleFile}
                                        aria-label="Remove sample file"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        {sampleFile && samplePreviewUrl && canPreviewSampleFile ? (
                            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-slate-100">
                                {isSampleFilePdf ? (
                                    <iframe
                                        title="Admission form PDF preview"
                                        src={`${samplePreviewUrl}#toolbar=1&navpanes=0`}
                                        className="h-full min-h-[560px] w-full bg-white"
                                    />
                                ) : (
                                    <div className="flex h-full min-h-[560px] items-center justify-center overflow-auto bg-white p-4">
                                        <img
                                            src={samplePreviewUrl}
                                            alt="Admission form sample preview"
                                            className="max-h-full max-w-full object-contain"
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                                <div className="space-y-2">
                                    <FileText className="mx-auto h-7 w-7" />
                                    <p>
                                        {sampleFile
                                            ? "Preview is available for PDF and image sample files."
                                            : "Choose a PDF sample file to preview the admission form pages here."}
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="flex h-[calc(100vh-230px)] min-h-[680px] flex-col overflow-hidden">
                    <CardHeader className="shrink-0 border-b">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <CardTitle>Schema Builder</CardTitle>
                                <CardDescription>
                                    Edit the field names and descriptions that LlamaExtract will use later.
                                </CardDescription>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!sampleFile || isGenerating}
                                    onClick={() => {
                                        void handleGenerateSchema();
                                    }}
                                >
                                    {isGenerating ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <FileInput className="mr-2 h-4 w-4" />
                                    )}
                                    {isGenerating ? "Generating..." : "Generate"}
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={!selectedSchemaId || formState.status === "active" || isActionPending}
                                    onClick={() => {
                                        void handleActivate();
                                    }}
                                >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Activate
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={!selectedSchemaId || formState.status === "archived" || isActionPending}
                                    onClick={() => {
                                        void handleArchive();
                                    }}
                                >
                                    <Archive className="mr-2 h-4 w-4" />
                                    Archive
                                </Button>
                                <Button
                                    disabled={isSaving}
                                    onClick={() => {
                                        void handleSave();
                                    }}
                                >
                                    {isSaving ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="mr-2 h-4 w-4" />
                                    )}
                                    Save
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                        <section className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-2 lg:col-span-2">
                                <Label htmlFor="saved-schema-select">Saved Schema</Label>
                                <Select
                                    value={selectedSchemaId ?? ""}
                                    onValueChange={handleSchemaSelectChange}
                                    disabled={schemas.length === 0}
                                >
                                    <SelectTrigger id="saved-schema-select">
                                        <SelectValue placeholder="Select a saved schema" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {schemas.map((schema) => (
                                            <SelectItem key={schema.id} value={schema.id}>
                                                {formatSchemaOption(schema)} - {statusLabel(schema.status)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {schemas.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                        No saved schemas yet. Fill out the builder and save to create one.
                                    </p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="schema-name">Schema Name</Label>
                                <Input
                                    id="schema-name"
                                    value={formState.name}
                                    onChange={(event) =>
                                        setFormState((prev) => ({ ...prev, name: event.target.value }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="schema-version">Version Label</Label>
                                <Input
                                    id="schema-version"
                                    value={formState.version_label ?? ""}
                                    placeholder="e.g., S.Y. 2026-2027 or v1"
                                    onChange={(event) =>
                                        setFormState((prev) => ({ ...prev, version_label: event.target.value }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="schema-effective-date">Effective Date</Label>
                                <Input
                                    id="schema-effective-date"
                                    type="date"
                                    value={formState.effective_date ?? ""}
                                    onChange={(event) =>
                                        setFormState((prev) => ({ ...prev, effective_date: event.target.value }))
                                    }
                                />
                            </div>
                            <div className="space-y-2 lg:col-span-2">
                                <Label htmlFor="schema-description">Description</Label>
                                <Textarea
                                    id="schema-description"
                                    value={formState.description ?? ""}
                                    onChange={(event) =>
                                        setFormState((prev) => ({ ...prev, description: event.target.value }))
                                    }
                                    placeholder="Used for extracting admission form information after classification."
                                />
                            </div>
                            <div className="space-y-2 lg:col-span-2">
                                <Label htmlFor="schema-prompt">Generation Prompt</Label>
                                <Textarea
                                    id="schema-prompt"
                                    value={formState.generation_prompt ?? ""}
                                    onChange={(event) =>
                                        setFormState((prev) => ({ ...prev, generation_prompt: event.target.value }))
                                    }
                                    placeholder="Example: Extract student profile, guardian details, address, previous school, and preferred program."
                                />
                            </div>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <FileJson className="h-4 w-4 text-cyan-700" />
                                    <h3 className="text-sm font-semibold">Fields</h3>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        setFormState((prev) => ({
                                            ...prev,
                                            fields_json: [...prev.fields_json, createField()],
                                        }))
                                    }
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Field
                                </Button>
                            </div>

                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full min-w-[840px] text-sm">
                                    <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Field Name</th>
                                            <th className="px-3 py-2 font-medium">Type</th>
                                            <th className="px-3 py-2 font-medium">Description</th>
                                            <th className="px-3 py-2 font-medium">Required</th>
                                            <th className="px-3 py-2 font-medium">Remove</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {formState.fields_json.map((field) => (
                                            <tr key={field.id} className="border-t">
                                                <td className="px-3 py-2 align-top">
                                                    <Input
                                                        value={field.key}
                                                        placeholder="student_name"
                                                        onChange={(event) =>
                                                            updateField(field.id, { key: event.target.value })
                                                        }
                                                        onBlur={(event) =>
                                                            updateField(field.id, {
                                                                key: normalizeFieldKey(event.target.value),
                                                            })
                                                        }
                                                    />
                                                </td>
                                                <td className="px-3 py-2 align-top">
                                                    <Select
                                                        value={field.type}
                                                        onValueChange={(value) =>
                                                            updateField(field.id, {
                                                                type: value as AdmissionSchemaFieldType,
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {FIELD_TYPES.map((type) => (
                                                                <SelectItem key={type} value={type}>
                                                                    {type}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="px-3 py-2 align-top">
                                                    <Textarea
                                                        className="min-h-20"
                                                        value={field.description}
                                                        placeholder="Explain what this field means and where it appears."
                                                        onChange={(event) =>
                                                            updateField(field.id, { description: event.target.value })
                                                        }
                                                    />
                                                </td>
                                                <td className="px-3 py-2 align-top">
                                                    <Switch
                                                        checked={field.required}
                                                        onCheckedChange={(checked) =>
                                                            updateField(field.id, { required: checked })
                                                        }
                                                    />
                                                </td>
                                                <td className="px-3 py-2 align-top">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        disabled={formState.fields_json.length === 1}
                                                        onClick={() => removeField(field.id)}
                                                        aria-label="Remove field"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
                        </section>

                        <section className="space-y-2">
                            <Label>Generated JSON Schema Preview</Label>
                            <pre className="max-h-72 overflow-auto rounded-lg border bg-slate-950 p-4 text-xs text-slate-100">
                                {JSON.stringify(getPreviewSchema(formState), null, 2)}
                            </pre>
                        </section>
                    </CardContent>
                </Card>
            </motion.div>
        </motion.div>
    );
}
