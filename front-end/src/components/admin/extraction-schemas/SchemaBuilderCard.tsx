import {
    Archive,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    FileInput,
    FileJson,
    GripVertical,
    Loader2,
    Maximize2,
    Minimize2,
    Plus,
    Save,
    Trash2,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    FIELD_TYPES,
    formatSchemaOption,
    getPreviewSchema,
    normalizeFieldKey,
    statusLabel,
} from "@/lib/schema-utils";
import type { DocumentTypeApiRecord } from "@/types/documentType";
import type {
    ExtractionSchemaField,
    ExtractionSchemaFieldType,
    ExtractionSchemaPayload,
    ExtractionSchemaRecord,
    FieldOption,
} from "@/types/extractionSchema";

interface SchemaBuilderCardProps {
    schemas: ExtractionSchemaRecord[];
    documentTypes: DocumentTypeApiRecord[];
    selectedSchemaId: string | null;
    formState: ExtractionSchemaPayload;
    sampleFiles: File[];
    isSaving: boolean;
    isGenerating: boolean;
    isActionPending: boolean;
    formError: string;
    maximized: boolean;
    onToggleMaximize: () => void;
    onSchemaSelect: (schemaId: string) => void;
    onFieldUpdate: (fieldId: string, next: Partial<ExtractionSchemaField>) => void;
    onRemoveField: (fieldId: string) => void;
    onAddField: () => void;
    onFormStatePatch: (patch: Partial<ExtractionSchemaPayload>) => void;
    onDocumentTypeChange: (documentTypeId: string | null) => void;
    onSave: () => void;
    onGenerate: () => void;
    onActivate: () => void;
    onArchive: () => void;
}

interface SectionGroup {
    sectionId: string | null;
    sectionTitle: string | null;
    fields: ExtractionSchemaField[];
}

function groupBySection(fields: ExtractionSchemaField[]): SectionGroup[] {
    const grouped: Record<string, SectionGroup> = {};
    for (const field of fields) {
        const sid = field.section_id ?? "__nosection__";
        if (!grouped[sid]) {
            grouped[sid] = {
                sectionId: field.section_id ?? null,
                sectionTitle: field.section_title ?? null,
                fields: [],
            };
        }
        grouped[sid].fields.push(field);
    }
    const order = ["__nosection__", ...Object.keys(grouped).filter((k) => k !== "__nosection__")];
    return order.filter((k) => grouped[k]).map((k) => grouped[k]);
}

function FieldOptionChips({ options }: { options: FieldOption[] | null | undefined }) {
    if (!options || options.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1">
            {options.map((opt) => (
                <Badge key={opt.value} variant="outline" className="text-[10px]">
                    {opt.label}
                </Badge>
            ))}
        </div>
    );
}

export default function SchemaBuilderCard({
    schemas,
    documentTypes,
    selectedSchemaId,
    formState,
    sampleFiles,
    isSaving,
    isGenerating,
    isActionPending,
    formError,
    maximized,
    onToggleMaximize,
    onSchemaSelect,
    onFieldUpdate,
    onRemoveField,
    onAddField,
    onFormStatePatch,
    onDocumentTypeChange,
    onSave,
    onGenerate,
    onActivate,
    onArchive,
}: SchemaBuilderCardProps) {
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set());

    const filteredSchemas = useMemo(() => {
        const docTypeId = formState.document_type_id;
        return schemas.filter((s) => s.document_type_id === docTypeId || s.document_type_id === null);
    }, [schemas, formState.document_type_id]);

    const activeDocTypes = useMemo(
        () => documentTypes.filter((dt) => dt.status === "active"),
        [documentTypes],
    );

    const sections = useMemo(() => groupBySection(formState.fields_json), [formState.fields_json]);

    const toggleSection = (sid: string) => {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sid)) next.delete(sid);
            else next.add(sid);
            return next;
        });
    };

    const toggleOptions = (fid: string) => {
        setExpandedOptions((prev) => {
            const next = new Set(prev);
            if (next.has(fid)) next.delete(fid);
            else next.add(fid);
            return next;
        });
    };

    return (
        <Card className="flex h-[calc(100vh-230px)] min-h-[680px] flex-col overflow-hidden">
            <CardHeader className="shrink-0 border-b">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-center gap-2">
                        <div>
                            <CardTitle>Schema Builder</CardTitle>
                            <CardDescription>
                                Edit the field names and descriptions that Gemini will use for extraction.
                            </CardDescription>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={onToggleMaximize}
                            aria-label={maximized ? "Minimize panel" : "Maximize panel"}
                            className="shrink-0"
                        >
                            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={sampleFiles.length === 0 || isGenerating}
                            onClick={() => { void onGenerate(); }}
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
                            onClick={() => { void onActivate(); }}
                        >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Activate
                        </Button>
                        <Button
                            variant="outline"
                            disabled={!selectedSchemaId || formState.status === "archived" || isActionPending}
                            onClick={() => { void onArchive(); }}
                        >
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                        </Button>
                        <Button
                            disabled={isSaving}
                            onClick={() => { void onSave(); }}
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
                        <Label htmlFor="document-type-select">Document Type</Label>
                        <Select
                            value={formState.document_type_id ?? "__none__"}
                            onValueChange={(value) =>
                                onDocumentTypeChange(value === "__none__" ? null : value)
                            }
                        >
                            <SelectTrigger id="document-type-select">
                                <SelectValue placeholder="Select a document type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">None (Legacy)</SelectItem>
                                {activeDocTypes.map((dt) => (
                                    <SelectItem key={dt.id} value={dt.id}>
                                        {dt.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {activeDocTypes.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No active document types. Create one in Document Types first.
                            </p>
                        ) : null}
                    </div>
                    <div className="space-y-2 lg:col-span-2">
                        <Label htmlFor="saved-schema-select">Saved Schema</Label>
                        <Select
                            value={selectedSchemaId ?? ""}
                            onValueChange={onSchemaSelect}
                            disabled={filteredSchemas.length === 0}
                        >
                            <SelectTrigger id="saved-schema-select">
                                <SelectValue placeholder={
                                    formState.document_type_id
                                        ? "No schemas for this document type"
                                        : "Select a saved schema"
                                } />
                            </SelectTrigger>
                            <SelectContent>
                                {filteredSchemas.map((schema) => (
                                    <SelectItem key={schema.id} value={schema.id}>
                                        {formatSchemaOption(schema)} - {statusLabel(schema.status)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {filteredSchemas.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No saved schemas for this document type yet. Fill out the builder and save to create one.
                            </p>
                        ) : null}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="schema-name">Schema Name</Label>
                        <Input
                            id="schema-name"
                            value={formState.name}
                            onChange={(event) =>
                                onFormStatePatch({ name: event.target.value })
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
                                onFormStatePatch({ version_label: event.target.value })
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
                                onFormStatePatch({ effective_date: event.target.value })
                            }
                        />
                    </div>
                    <div className="space-y-2 lg:col-span-2">
                        <Label htmlFor="schema-description">Description</Label>
                        <Textarea
                            id="schema-description"
                            value={formState.description ?? ""}
                            onChange={(event) =>
                                onFormStatePatch({ description: event.target.value })
                            }
                            placeholder="Describe the document type this schema is intended for."
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
                            onClick={onAddField}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Field
                        </Button>
                    </div>

                    <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[840px] text-sm">
                            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                                <tr>
                                    <th className="w-6 px-2 py-2" />
                                    <th className="px-3 py-2 font-medium">Field Name</th>
                                    <th className="px-3 py-2 font-medium">Type / UI</th>
                                    <th className="px-3 py-2 font-medium">Options</th>
                                    <th className="px-3 py-2 font-medium">Description</th>
                                    <th className="px-3 py-2 font-medium">Required</th>
                                    <th className="px-3 py-2 font-medium">Remove</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sections.map((section) => {
                                    const sid = section.sectionId ?? "__nosection__";
                                    const isCollapsed = collapsedSections.has(sid);
                                    return (
                                        <Fragment key={sid}>
                                            {section.sectionId && (
                                                <tr
                                                    className="cursor-pointer border-t bg-muted/30 hover:bg-muted/50"
                                                    onClick={() => toggleSection(sid)}
                                                >
                                                    <td className="px-2 py-2">
                                                        {isCollapsed
                                                            ? <ChevronRight className="h-4 w-4" />
                                                            : <ChevronDown className="h-4 w-4" />}
                                                    </td>
                                                    <td
                                                        colSpan={6}
                                                        className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                                                    >
                                                        {section.sectionTitle ?? `Section: ${section.sectionId}`}
                                                        <span className="ml-2 font-normal text-[10px] normal-case">
                                                            ({section.fields.length} field{section.fields.length !== 1 ? "s" : ""})
                                                        </span>
                                                    </td>
                                                </tr>
                                            )}
                                            {!isCollapsed && section.fields.map((field) => {
                                                const hl = field.hierarchy_level ?? 0;
                                                const indent = hl * 20;
                                                const showOptions = expandedOptions.has(field.id);
                                                return (
                                                    <tr key={field.id} className="border-t">
                                                        <td className="px-2 py-2 align-top">
                                                            <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                                                        </td>
                                                        <td className="px-3 py-2 align-top">
                                                            <div style={{ paddingLeft: indent }}>
                                                                <Input
                                                                    value={field.key}
                                                                    placeholder="field_name"
                                                                    onChange={(event) =>
                                                                        onFieldUpdate(field.id, { key: event.target.value })
                                                                    }
                                                                    onBlur={(event) =>
                                                                        onFieldUpdate(field.id, {
                                                                            key: normalizeFieldKey(event.target.value),
                                                                        })
                                                                    }
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 align-top">
                                                            <div className="space-y-1">
                                                                <Select
                                                                    value={field.type}
                                                                    onValueChange={(value) =>
                                                                        onFieldUpdate(field.id, {
                                                                            type: value as ExtractionSchemaFieldType,
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
                                                                {field.ui_component && (
                                                                    <Badge variant="secondary" className="text-[10px]">
                                                                        {field.ui_component}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 align-top">
                                                            <div className="space-y-1">
                                                                {field.options && field.options.length > 0 ? (
                                                                    <>
                                                                        {showOptions ? (
                                                                            <FieldOptionChips options={field.options} />
                                                                        ) : (
                                                                            <span className="text-xs text-muted-foreground">
                                                                                {field.options.length} option{field.options.length !== 1 ? "s" : ""}
                                                                            </span>
                                                                        )}
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-5 px-1 text-[10px]"
                                                                            onClick={() => toggleOptions(field.id)}
                                                                        >
                                                                            {showOptions ? "Hide" : "Show"}
                                                                        </Button>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">—</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 align-top">
                                                            <Textarea
                                                                className="min-h-20"
                                                                value={field.description}
                                                                placeholder="Explain what this field means and where it appears."
                                                                onChange={(event) =>
                                                                    onFieldUpdate(field.id, { description: event.target.value })
                                                                }
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 align-top">
                                                            <Switch
                                                                checked={field.required}
                                                                onCheckedChange={(checked) =>
                                                                    onFieldUpdate(field.id, { required: checked })
                                                                }
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 align-top">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                disabled={formState.fields_json.length === 1}
                                                                onClick={() => onRemoveField(field.id)}
                                                                aria-label="Remove field"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </Fragment>
                                    );
                                })}
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
    );
}
