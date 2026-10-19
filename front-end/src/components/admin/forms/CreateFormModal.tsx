"use client";

import { useAuth } from "@clerk/clerk-react";
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchWithClerkAuth } from "@/lib/api";
import { createEmptyStructuredDocument } from "@/lib/formLayout";
import type { DocumentTypeApiRecord } from "@/types/documentType";
import type { ExtractionSchemaRecord } from "@/types/extractionSchema";
import type { FormDocument, FormGenerateResponse, FormRecord } from "@/types/form";

interface CreateFormModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (form: FormRecord) => void;
}

export default function CreateFormModal({ open, onOpenChange, onCreated }: CreateFormModalProps) {
    const { getToken } = useAuth();

    const [name, setName] = useState("");
    const [mode, setMode] = useState<"blank" | "ai">("blank");
    const [description, setDescription] = useState("");
    const [documentTypeId, setDocumentTypeId] = useState<string | null>(null);
    const [schemaId, setSchemaId] = useState<string | null>(null);
    const [documentTypes, setDocumentTypes] = useState<DocumentTypeApiRecord[]>([]);
    const [schemas, setSchemas] = useState<ExtractionSchemaRecord[]>([]);
    const [isCreating, setIsCreating] = useState(false);

    const request = useCallback(
        async (path: string, init?: RequestInit): Promise<Response> => {
            const token = await getToken();
            if (!token) throw new Error("Missing admin authentication token.");
            return fetchWithClerkAuth(path, token, init);
        },
        [getToken],
    );

    useEffect(() => {
        if (!open) return;
        void (async () => {
            try {
                const [docTypesRes, schemasRes] = await Promise.all([
                    request("/api/admin/document-types?status=active"),
                    request("/api/admin/extraction-schemas?status=active"),
                ]);
                if (docTypesRes.ok) setDocumentTypes((await docTypesRes.json()) as DocumentTypeApiRecord[]);
                if (schemasRes.ok) setSchemas((await schemasRes.json()) as ExtractionSchemaRecord[]);
            } catch {
                // Non-fatal: the selectors simply stay empty.
            }
        })();
    }, [open, request]);

    const selectedSchema = schemas.find((schema) => schema.id === schemaId) ?? null;

    const reset = () => {
        setName("");
        setMode("blank");
        setDescription("");
        setDocumentTypeId(null);
        setSchemaId(null);
    };

    const handleSchemaChange = (value: string) => {
        const nextId = value === "__none__" ? null : value;
        setSchemaId(nextId);
        const schema = schemas.find((item) => item.id === nextId) ?? null;
        if (schema?.document_type_id) setDocumentTypeId(schema.document_type_id);
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error("Please enter a form name.");
            return;
        }
        setIsCreating(true);
        try {
            let document: FormDocument = createEmptyStructuredDocument();
            if (mode === "ai") {
                if (!description.trim()) {
                    throw new Error("Please describe the form before generating.");
                }
                const genRes = await request("/api/admin/forms/generate", {
                    method: "POST",
                    body: JSON.stringify({
                        description,
                        fields: selectedSchema?.fields_json ?? null,
                    }),
                });
                if (!genRes.ok) {
                    throw new Error(`Generation failed with status ${genRes.status}.`);
                }
                const gen = (await genRes.json()) as FormGenerateResponse;
                document = gen.document_json;
                if (gen.warnings.length > 0) {
                    toast.warning(`${gen.warnings.length} AI field(s) could not be matched. Map or delete them before saving.`);
                }
            }

            const createRes = await request("/api/admin/forms", {
                method: "POST",
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || null,
                    document_type_id: documentTypeId,
                    document_json: document,
                }),
            });
            if (!createRes.ok) {
                const detail = await createRes.json().catch(() => null);
                throw new Error(`Create failed with status ${createRes.status}.${detail ? ` ${(detail as { detail?: string }).detail ?? ""}` : ""}`);
            }
            const form = (await createRes.json()) as FormRecord;
            toast.success("Form created.");
            onCreated(form);
            onOpenChange(false);
            reset();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create form.");
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create form</DialogTitle>
                    <DialogDescription>Start blank or generate a form structure with AI.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="create-form-name">Form name</Label>
                        <Input id="create-form-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Admission Form 2026-2027" />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Document type</Label>
                        <Select
                            value={documentTypeId ?? "__none__"}
                            onValueChange={(value) => setDocumentTypeId(value === "__none__" ? null : value)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select a document type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">No document type</SelectItem>
                                {documentTypes.map((type) => (
                                    <SelectItem key={type.id} value={type.id}>
                                        {type.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[11px] text-slate-400">
                            The document type is the stable identity used to resolve this form for students.
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <ModeButton active={mode === "blank"} onClick={() => setMode("blank")} label="Blank" />
                        <ModeButton active={mode === "ai"} onClick={() => setMode("ai")} label="Generate with AI" />
                    </div>

                    {mode === "ai" && (
                        <>
                            <div className="space-y-1.5">
                                <Label>Ground on extraction schema (optional)</Label>
                                <Select value={schemaId ?? "__none__"} onValueChange={handleSchemaChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="No schema" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">No schema — invent fields from the description</SelectItem>
                                        {schemas.map((schema) => (
                                            <SelectItem key={schema.id} value={schema.id}>
                                                {schema.name}
                                                {schema.version_label ? ` · ${schema.version_label}` : ""}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-[11px] text-slate-400">
                                    {selectedSchema
                                        ? `The AI may only use the ${selectedSchema.fields_json.length} field(s) in this schema. Unknown keys are flagged for review.`
                                        : "Without a schema the AI proposes its own fields."}
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="create-form-description">Describe the form and its fields</Label>
                                <Textarea
                                    id="create-form-description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Create a form with these fields: student name, LRN, date of birth, sex, grade level, SHS track"
                                    className="min-h-24"
                                />
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isCreating || !name.trim()} className="gap-2">
                        {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {isCreating ? "Creating…" : "Create form"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <Button type="button" variant={active ? "default" : "outline"} size="sm" onClick={onClick} className="flex-1">
            {label}
        </Button>
    );
}
