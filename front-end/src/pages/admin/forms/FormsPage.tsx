"use client";

import { useAuth } from "@clerk/clerk-react";
import { Eye, Loader2, Pencil, Printer, Save, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import CreateFormModal from "@/components/admin/forms/CreateFormModal";
import FormList from "@/components/admin/forms/FormList";
import FormPaper from "@/components/admin/forms/FormPaper";
import FormPrintRoot from "@/components/admin/forms/FormPrintRoot";
import PageSettingsPanel from "@/components/admin/forms/PageSettingsPanel";
import type { PrintMetrics } from "@/components/admin/forms/FormPrintDocument";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchWithClerkAuth } from "@/lib/api";
import { fieldsToBlocks, isPersistable, parseStructuredDocument, updatePageSettings } from "@/lib/formLayout";
import type { DocumentTypeApiRecord } from "@/types/documentType";
import type { FormPaperMode, FormRecord, FormUpdatePayload, StructuredFormDocument } from "@/types/form";
import type { LucideIcon } from "lucide-react";

export default function FormsPage() {
    const { getToken: _getToken, isLoaded, isSignedIn } = useAuth();
    const getTokenRef = useRef(_getToken);
    getTokenRef.current = _getToken;

    const [forms, setForms] = useState<FormRecord[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedForm, setSelectedForm] = useState<FormRecord | null>(null);
    const [doc, setDoc] = useState<StructuredFormDocument | null>(null);
    const [isLegacy, setIsLegacy] = useState(false);
    const [mode, setMode] = useState<FormPaperMode>("edit");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [documentTypes, setDocumentTypes] = useState<DocumentTypeApiRecord[]>([]);
    const [printMetrics, setPrintMetrics] = useState<PrintMetrics | null>(null);

    const request = useCallback(async (path: string, init?: RequestInit): Promise<Response> => {
        const token = await getTokenRef.current();
        if (!token) throw new Error("Missing admin authentication token.");
        return fetchWithClerkAuth(path, token, init);
    }, []);

    const handlePrintMeasured = useCallback((metrics: PrintMetrics) => {
        setPrintMetrics((prev) =>
            prev &&
            prev.pageCount === metrics.pageCount &&
            Math.abs(prev.scale - metrics.scale) < 0.001
                ? prev
                : metrics,
        );
    }, []);

    const loadForms = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await request("/api/admin/forms");
            if (!res.ok) throw new Error(`Failed to load forms (${res.status}).`);
            const list = (await res.json()) as FormRecord[];
            setForms(list);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load forms.");
        } finally {
            setIsLoading(false);
        }
    }, [request]);

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            void loadForms();
        }
    }, [isLoaded, isSignedIn, loadForms]);

    useEffect(() => {
        if (!isLoaded || !isSignedIn) return;
        void (async () => {
            try {
                const res = await request("/api/admin/document-types?status=active");
                if (!res.ok) return;
                setDocumentTypes((await res.json()) as DocumentTypeApiRecord[]);
            } catch {
                // Non-fatal: the dropdown simply stays empty.
            }
        })();
    }, [isLoaded, isSignedIn, request]);

    const handleSelect = (form: FormRecord) => {
        setSelectedId(form.id);
        setSelectedForm(form);
        const parsed = parseStructuredDocument(form.document_json);
        const normalized = parsed ? fieldsToBlocks(parsed) : null;
        setDoc(normalized);
        setIsLegacy(parsed === null);
        setMode("edit");
        setPrintMetrics(null);
    };

    const handleCreated = (form: FormRecord) => {
        void loadForms();
        handleSelect(form);
    };

    const handleSave = async () => {
        if (!selectedForm || !doc) return;
        if (!isPersistable(doc)) {
            toast.error("This form has unresolved AI-generated fields. Map or delete them before saving.");
            return;
        }
        setIsSaving(true);
        try {
            const payload: FormUpdatePayload = {
                name: selectedForm.name,
                description: selectedForm.description,
                document_type_id: selectedForm.document_type_id,
                document_json: doc,
            };
            const res = await request(`/api/admin/forms/${selectedForm.id}`, {
                method: "PATCH",
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`Save failed (${res.status}).`);
            const updated = (await res.json()) as FormRecord;
            setSelectedForm(updated);
            setForms((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
            toast.success("Form saved.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save form.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await request(`/api/admin/forms/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(`Delete failed (${res.status}).`);
            setForms((prev) => prev.filter((f) => f.id !== id));
            if (selectedId === id) {
                setSelectedId(null);
                setSelectedForm(null);
                setDoc(null);
                setIsLegacy(false);
                setPrintMetrics(null);
            }
            toast.success("Form deleted.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete form.");
        }
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                {isLoading ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                ) : (
                    <FormList
                        forms={forms}
                        selectedId={selectedId}
                        onSelect={handleSelect}
                        onDelete={handleDelete}
                        onCreate={() => setCreateOpen(true)}
                    />
                )}
            </div>

            <div className="min-w-0">
                {selectedForm && isLegacy ? (
                    <LegacyNotice />
                ) : selectedForm && doc ? (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="grid w-full max-w-md gap-2">
                                <Input
                                    value={selectedForm.name}
                                    onChange={(e) => setSelectedForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                                    className="h-8 font-semibold"
                                    placeholder="Form name"
                                />
                                <Textarea
                                    value={selectedForm.description ?? ""}
                                    onChange={(e) =>
                                        setSelectedForm((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                                    }
                                    className="min-h-9 text-xs"
                                    placeholder="Description (optional)"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {printMetrics && (
                                    <span
                                        title="Estimated printed pages"
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-medium text-slate-500"
                                    >
                                        <Printer className="h-3.5 w-3.5" />
                                        {printMetrics.pageCount === 1 ? "1 page" : `~${printMetrics.pageCount} pages`}
                                        {Math.round(printMetrics.scale * 100) < 100 &&
                                            ` · ${Math.round(printMetrics.scale * 100)}%`}
                                    </span>
                                )}
                                <Select
                                    value={selectedForm.document_type_id ?? "__none__"}
                                    onValueChange={(value) =>
                                        setSelectedForm((prev) =>
                                            prev ? { ...prev, document_type_id: value === "__none__" ? null : value } : prev,
                                        )
                                    }
                                >
                                    <SelectTrigger className="h-8 w-48" title="Document type">
                                        <SelectValue placeholder="Document type" />
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
                                <div className="flex rounded-lg border border-slate-200 p-0.5">
                                    <SegmentButton
                                        active={mode === "edit"}
                                        onClick={() => setMode("edit")}
                                        icon={Pencil}
                                        label="Edit"
                                    />
                                    <SegmentButton
                                        active={mode === "preview"}
                                        onClick={() => setMode("preview")}
                                        icon={Eye}
                                        label="Preview"
                                    />
                                </div>
                                <Button onClick={handleSave} disabled={isSaving} className="gap-1.5">
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    {isSaving ? "Saving…" : "Save"}
                                </Button>
                            </div>
                        </div>

                        <PageSettingsPanel
                            page={doc.page}
                            onChange={(patch) => setDoc((prev) => (prev ? updatePageSettings(prev, patch) : prev))}
                        />

                        <div className="overflow-x-auto rounded-2xl bg-slate-100/70 p-6">
                            <FormPaper doc={doc} mode={mode} onChange={setDoc} />
                        </div>
                    </div>
                ) : (
                    <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                        <p className="text-sm text-slate-500">Select a form to edit, or create a new one.</p>
                        <Button onClick={() => setCreateOpen(true)}>Create form</Button>
                    </div>
                )}
            </div>

            {selectedForm && doc && !isLegacy && (
                <FormPrintRoot doc={doc} onMeasured={handlePrintMeasured} />
            )}

            <CreateFormModal open={createOpen} onOpenChange={setCreateOpen} onCreated={handleCreated} />
        </div>
    );
}

function LegacyNotice() {
    return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-8 text-center">
            <TriangleAlert className="h-6 w-6 text-amber-500" />
            <p className="text-sm font-medium text-amber-800">This form uses an older layout format.</p>
            <p className="max-w-sm text-xs text-amber-700">
                It was saved before the structured form designer. Recreate it with the current designer to edit its layout.
            </p>
        </div>
    );
}

function SegmentButton({
    active,
    onClick,
    icon: Icon,
    label,
}: {
    active: boolean;
    onClick: () => void;
    icon: LucideIcon;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
        >
            <Icon className="h-3.5 w-3.5" />
            {label}
        </button>
    );
}
