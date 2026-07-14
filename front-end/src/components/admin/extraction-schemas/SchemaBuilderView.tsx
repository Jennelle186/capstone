import { useRef, useState } from "react";
import {
    ChevronDown,
    ChevronRight,
    Code,
    ListRestart,
    Loader2,
    Lock,
    Maximize2,
    Minimize2,
    Plus,
    Save,
    Sparkles,
    Unlock,
    Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getPreviewSchema, statusLabel } from "@/lib/schema-utils";
import type { DocumentTypeApiRecord } from "@/types/documentType";
import type { ExtractionSchemaField, ExtractionSchemaPayload } from "@/types/extractionSchema";
import FieldEditorRow from "./FieldEditorRow";

interface SectionGroup {
    sectionId: string | null;
    sectionTitle: string | null;
    fields: ExtractionSchemaField[];
}

interface SchemaBuilderViewProps {
    formState: ExtractionSchemaPayload;
    documentTypes: DocumentTypeApiRecord[];
    selectedSchemaId: string | null;
    isSaving: boolean;
    isGenerating: boolean;
    isActionPending: boolean;
    formError: string;
    maximized: boolean;
    onToggleMaximize: () => void;
    onFormStatePatch: (patch: Partial<ExtractionSchemaPayload>) => void;
    onDocumentTypeChange: (documentTypeId: string | null) => void;
    onSave: () => void;
    onGenerate: () => void;
    onAutoGenerate: (files: File[]) => void;
    onAddField: (afterFieldId?: string) => void;
    onAddSection: (afterFieldId?: string) => void;
    onFieldUpdate: (fieldId: string, next: Partial<ExtractionSchemaField>) => void;
    onRemoveField: (fieldId: string) => void;
}

function InsertZone({
    afterFieldId,
    onAddField,
    onAddSection,
}: {
    afterFieldId?: string;
    onAddField: (afterFieldId?: string) => void;
    onAddSection: (afterFieldId?: string) => void;
}) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="relative flex items-center justify-center"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="h-2 w-full" />
            {isHovered && (
                <div className="absolute inset-x-0 -top-1 z-10 flex items-center justify-center gap-1">
                    <div className="h-px flex-1 bg-slate-200" />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                        onClick={() => onAddField(afterFieldId)}
                    >
                        <Plus className="h-3 w-3" />
                        Add Field
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                        onClick={() => onAddSection(afterFieldId)}
                    >
                        <Plus className="h-3 w-3" />
                        Add Section
                    </Button>
                    <div className="h-px flex-1 bg-slate-200" />
                </div>
            )}
        </div>
    );
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

export default function SchemaBuilderView({
    formState,
    documentTypes,
    isSaving,
    isGenerating,
    formError,
    maximized,
    onToggleMaximize,
    onFormStatePatch,
    onDocumentTypeChange,
    onSave,
    onGenerate,
    onAutoGenerate,
    onAddField,
    onAddSection,
    onFieldUpdate,
    onRemoveField,
}: SchemaBuilderViewProps) {
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [showJsonPreview, setShowJsonPreview] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activeDocTypes = documentTypes.filter((dt) => dt.status === "active");
    const sections = groupBySection(formState.fields_json);

    const toggleSection = (sid: string) => {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sid)) next.delete(sid);
            else next.add(sid);
            return next;
        });
    };

    const handleFileDrop = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        onAutoGenerate(Array.from(files));
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onAutoGenerate(Array.from(e.dataTransfer.files));
        }
    };

    const content = (
        <div className={maximized ? "flex-1 overflow-y-auto p-6 space-y-6" : "space-y-6"}>
            <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-5 text-center hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => handleFileDrop(e.target.files)}
                />
                {isGenerating ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Auto-generating schema fields...
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 shadow-sm border border-slate-200/40">
                            <Upload className="h-5 w-5" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-semibold text-slate-700">Drop a document to auto-generate schema fields</p>
                            <p className="text-xs text-slate-400">or click to browse &mdash; supports PDF, PNG, JPG</p>
                        </div>
                    </div>
                )}
            </div>
            <Card className="border-slate-200 shadow-xs">
                <CardHeader className="border-b border-slate-100 pb-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-lg">Schema Core Properties</CardTitle>
                            <CardDescription>Define the metadata and AI instructions for this extraction.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant={formState.status === "active" ? "default" : "secondary"} className="h-6 text-xs">
                                {statusLabel(formState.status)}
                            </Badge>
                            <Button onClick={onToggleMaximize} variant="outline" size="sm" className="rounded-xl border-slate-200 font-bold text-slate-700 hover:bg-slate-50 text-xs gap-1.5 cursor-pointer">
                                {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                                {maximized ? "Minimize" : "Maximize"}
                            </Button>
                            <Button onClick={onSave} disabled={isSaving} variant="default" size="sm" className="rounded-xl px-4 font-bold bg-primary hover:bg-emerald-700 text-white cursor-pointer">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {isSaving ? "Saving..." : "Save Schema"}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                        <div className="md:col-span-4 space-y-1.5 text-left">
                            <Label>Document Type</Label>
                            <Select
                                value={formState.document_type_id ?? "__none__"}
                                onValueChange={(v) => onDocumentTypeChange(v === "__none__" ? null : v)}
                            >
                                <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">None (Legacy)</SelectItem>
                                    {activeDocTypes.map((dt) => (
                                        <SelectItem key={dt.id} value={dt.id}>{dt.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="md:col-span-4 space-y-1.5 text-left">
                            <Label>Schema Display Name</Label>
                            <Input value={formState.name} onChange={(e) => onFormStatePatch({ name: e.target.value })} />
                        </div>
                        <div className="md:col-span-2 space-y-1.5 text-left">
                            <Label>Version</Label>
                            <Input value={formState.version_label || ""} onChange={(e) => onFormStatePatch({ version_label: e.target.value })} />
                        </div>
                        <div className="md:col-span-2 space-y-1.5 text-left">
                            <Label>Effective Date</Label>
                            <Input
                                type="date"
                                value={formState.effective_date || ""}
                                onChange={(e) => onFormStatePatch({ effective_date: e.target.value })}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5 text-left">
                            <Label>Description</Label>
                            <Textarea value={formState.description || ""} onChange={(e) => onFormStatePatch({ description: e.target.value })} className="min-h-[80px]" />
                        </div>
                        <div className="space-y-1.5 text-left">
                            <Label className="flex items-center gap-1.5 text-slate-700 font-bold">
                                <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> Generation Prompt <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                            </Label>
                            <Textarea
                                value={formState.generation_prompt || ""}
                                onChange={(e) => onFormStatePatch({ generation_prompt: e.target.value })}
                                placeholder='Defaults to "extract all key-value pairs" if left blank.'
                                className="min-h-[80px]"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-xs">
                <CardHeader className="border-b border-slate-100 pb-4 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base font-extrabold flex items-center gap-2">
                                <ListRestart className="h-5 w-5 text-primary" /> Field Schema Schematic
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-500 font-medium">Define variables keys, strict schemas, and requirements</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button onClick={onGenerate} disabled={isGenerating} variant="outline" size="sm" className="rounded-xl border-emerald-200 font-bold text-emerald-700 hover:bg-emerald-50 text-xs gap-1.5 shadow-sm cursor-pointer">
                                {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-emerald-600" />}
                                {isGenerating ? "AI Drafting..." : "Draft Fields with AI"}
                            </Button>
                            <Button onClick={() => onAddField()} variant="outline" size="sm" className="rounded-xl bg-white text-slate-700 border-slate-200 text-xs font-semibold gap-1 shrink-0 cursor-pointer">
                                <Plus className="h-4 w-4 text-emerald-600" /> Add Field Row
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                    {formState.fields_json.length === 0 ? (
                        <InsertZone onAddField={onAddField} onAddSection={onAddSection} />
                    ) : (
                        sections.map((section) => {
                            const sid = section.sectionId ?? "__nosection__";
                            const isCollapsed = collapsedSections.has(sid);
                            return (
                                <div key={sid} className="space-y-0">
                                    {section.sectionId && (
                                        <div
                                            className="flex cursor-pointer items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 hover:bg-muted/50"
                                            onClick={() => toggleSection(sid)}
                                        >
                                            {isCollapsed
                                                ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                {section.sectionTitle ?? `Section: ${section.sectionId}`}
                                            </span>
                                            <span className="text-[10px] font-normal text-muted-foreground">
                                                ({section.fields.length} field{section.fields.length !== 1 ? "s" : ""})
                                            </span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const allLocked = section.fields.every((f) => f.readOnly);
                                                    section.fields.forEach((f) => onFieldUpdate(f.id, { readOnly: !allLocked }));
                                                }}
                                                className={`ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                                                    section.fields.every((f) => f.readOnly)
                                                        ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                                                        : "bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800"
                                                }`}
                                                title={
                                                    section.fields.every((f) => f.readOnly)
                                                        ? "Unlock all fields in this section"
                                                        : "Lock all fields in this section"
                                                }
                                            >
                                                {section.fields.every((f) => f.readOnly) ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                                            </button>
                                        </div>
                                    )}

                                    {!isCollapsed && section.fields.map((field) => (
                                        <div key={field.id}>
                                            <FieldEditorRow
                                                field={field}
                                                index={formState.fields_json.findIndex((f) => f.id === field.id)}
                                                allFields={formState.fields_json}
                                                isLast={formState.fields_json.length === 1}
                                                onUpdate={onFieldUpdate}
                                                onDelete={onRemoveField}
                                            />
                                            <InsertZone
                                                afterFieldId={field.id}
                                                onAddField={onAddField}
                                                onAddSection={onAddSection}
                                            />
                                        </div>
                                    ))}
                                </div>
                            );
                        })
                    )}
                    {formState.fields_json.length > 0 && (
                        <InsertZone
                            afterFieldId={formState.fields_json[formState.fields_json.length - 1]?.id}
                            onAddField={onAddField}
                            onAddSection={onAddSection}
                        />
                    )}

                    {formError ? <p className="text-sm text-destructive font-medium">{formError}</p> : null}
                </CardContent>
            </Card>

            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-900/5 p-4 dark:border-slate-800 dark:bg-slate-950/20">
                <button
                    type="button"
                    onClick={() => setShowJsonPreview(!showJsonPreview)}
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                    <Code className="h-4 w-4" />
                    {showJsonPreview ? "Hide" : "Show"} JSON Schema Preview
                </button>
                {showJsonPreview && (
                    <pre className="max-h-64 overflow-auto rounded-lg border bg-slate-950 p-4 text-xs text-slate-100 font-mono leading-relaxed shadow-inner mt-3">
                        {JSON.stringify(getPreviewSchema(formState), null, 2)}
                    </pre>
                )}
            </div>
        </div>
    );

    if (maximized) {
        return (
            <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md p-4 md:p-8 flex items-center justify-center overflow-hidden">
                <div className="bg-slate-50 border border-slate-200/50 shadow-2xl rounded-2xl w-full max-w-7xl h-full flex flex-col overflow-hidden text-left">
                    <div className="bg-primary/95 text-white py-3.5 px-6 flex items-center justify-between shadow-md shrink-0 select-none border-b border-white/10">
                        <span className="text-xs font-black uppercase tracking-wider">Maximized Schema Builder Workspace</span>
                        <Button onClick={onToggleMaximize} variant="outline" size="sm" className="h-7 text-xs font-extrabold border-white/20 text-white bg-white/10 hover:bg-white/20 rounded-lg cursor-pointer">
                            <Minimize2 className="h-3.5 w-3.5 mr-1" /> Minimize
                        </Button>
                    </div>
                    {content}
                </div>
            </div>
        );
    }

    return content;
}
