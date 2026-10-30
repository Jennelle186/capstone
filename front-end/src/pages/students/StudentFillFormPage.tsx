"use client";

import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, Loader2, Printer, Save, Send, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import FormFillBody from "@/components/student/forms/FormFillBody";
import FormPrintRoot from "@/components/admin/forms/FormPrintRoot";
import { Button } from "@/components/ui/button";
import { fetchWithClerkAuth } from "@/lib/api";
import { fieldsToBlocks, parseStructuredDocument } from "@/lib/formLayout";
import type { FormFillResponse, FormSubmissionRecord, FormValue, FormValues, StructuredFormDocument } from "@/types/form";
import type { FieldBlock } from "@/types/formLayout";

type LoadState = "loading" | "ready" | "error";

function isBlank(value: FormValue | undefined): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return !value.trim();
    return value.length === 0;
}

function fieldBlocks(doc: StructuredFormDocument): FieldBlock[] {
    const result: FieldBlock[] = [];
    for (const section of doc.sections) {
        const blocks = section.blocks;
        if (blocks && blocks.length > 0) {
            for (const block of blocks) if (block.type === "field") result.push(block);
        }
    }
    return result;
}

function missingRequiredLabels(doc: StructuredFormDocument, values: FormValues): string[] {
    return fieldBlocks(doc)
        .filter((block) => block.required && isBlank(values[block.field_key]))
        .map((block) => block.label || block.field_key);
}

export default function StudentFillFormPage() {
    const { itemId } = useParams<{ itemId: string }>();
    const { getToken } = useAuth();

    const [state, setState] = useState<LoadState>("loading");
    const [error, setError] = useState("");
    const [formName, setFormName] = useState("");
    const [doc, setDoc] = useState<StructuredFormDocument | null>(null);
    const [values, setValues] = useState<FormValues>({});
    const [submission, setSubmission] = useState<FormSubmissionRecord | null>(null);
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!itemId) {
            setError("Missing requirement.");
            setState("error");
            return;
        }

        let cancelled = false;
        void (async () => {
            try {
                const token = await getToken();
                if (!token) throw new Error("Not authenticated.");

                const res = await fetchWithClerkAuth(`/api/me/requirement-items/${itemId}/fill`, token);
                if (!res.ok) {
                    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
                    throw new Error(body?.detail ?? `Failed to load form (${res.status}).`);
                }

                const data = (await res.json()) as FormFillResponse;
                const parsed = parseStructuredDocument(data.document_json);
                if (!parsed) throw new Error("This form uses an unsupported layout.");

                if (cancelled) return;
                setFormName(data.form_name);
                setDoc(fieldsToBlocks(parsed));
                setSubmission(data.submission);
                setValues(data.submission?.values ?? {});
                setState("ready");
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : "Failed to load form.");
                setState("error");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [itemId, getToken]);

    const setValue = useCallback((key: string, value: FormValue) => {
        setValues((prev) => ({ ...prev, [key]: value }));
    }, []);

    const handleSaveDraft = async () => {
        if (!itemId) return;
        const token = await getToken();
        if (!token) return;
        setSaving(true);
        try {
            const res = await fetchWithClerkAuth(`/api/me/requirement-items/${itemId}/form-submission`, token, {
                method: "PUT",
                body: JSON.stringify({ values }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { detail?: string } | null;
                throw new Error(body?.detail ?? `Save failed (${res.status}).`);
            }
            const saved = (await res.json()) as FormSubmissionRecord;
            setSubmission(saved);
            toast.success("Draft saved.");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save draft.");
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async () => {
        if (!itemId || !doc) return;
        const missing = missingRequiredLabels(doc, values);
        if (missing.length > 0) {
            toast.error(`Missing required fields: ${missing.join(", ")}`);
            return;
        }
        const token = await getToken();
        if (!token) return;
        setSubmitting(true);
        try {
            const res = await fetchWithClerkAuth(`/api/me/requirement-items/${itemId}/form-submission/submit`, token, {
                method: "POST",
                body: JSON.stringify({ values }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { detail?: string } | null;
                throw new Error(body?.detail ?? `Submit failed (${res.status}).`);
            }
            const saved = (await res.json()) as FormSubmissionRecord;
            setSubmission(saved);
            setValues(saved.values);
            toast.success("Form submitted.");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to submit.");
        } finally {
            setSubmitting(false);
        }
    };

    const isSubmitted = submission?.status === "submitted";

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900">{formName || "Fill form"}</h1>
                    <p className="text-sm text-slate-500">
                        {isSubmitted ? "Submitted: Review or export your completed form." : "Fill in the form online. Save a draft to finish later, or submit when complete."}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                        <Link to="/student/upload">
                            <ArrowLeft className="h-4 w-4" />
                            Back to upload
                        </Link>
                    </Button>
                    {state === "ready" && !isSubmitted && (
                        <>
                            <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving} className="gap-1.5">
                                <Save className="h-4 w-4" />
                                {saving ? "Saving…" : "Save draft"}
                            </Button>
                            <Button size="sm" onClick={handleSubmit} disabled={submitting} className="gap-1.5">
                                <Send className="h-4 w-4" />
                                {submitting ? "Submitting…" : "Submit"}
                            </Button>
                        </>
                    )}
                    <Button
                        variant={isSubmitted ? "default" : "outline"}
                        size="sm"
                        onClick={() => window.print()}
                        disabled={state !== "ready"}
                        className="gap-1.5"
                    >
                        <Printer className="h-4 w-4" />
                        Export / Print
                    </Button>
                </div>
            </div>

            {state === "loading" && (
                <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading form…
                </div>
            )}

            {state === "error" && (
                <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-8 text-center">
                    <TriangleAlert className="h-6 w-6 text-amber-500" />
                    <p className="text-sm font-medium text-amber-800">This form is not available.</p>
                    <p className="max-w-sm text-xs text-amber-700">{error}</p>
                </div>
            )}

            {state === "ready" && doc && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <FormFillBody doc={doc} values={values} onChange={setValue} readOnly={isSubmitted} />
                </div>
            )}

            {state === "ready" && doc && <FormPrintRoot doc={doc} values={values} />}
        </div>
    );
}
