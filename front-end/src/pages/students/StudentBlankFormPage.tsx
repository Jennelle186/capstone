"use client";

import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, Loader2, Printer, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import FormPrintRoot from "@/components/admin/forms/FormPrintRoot";
import FormStaticBody from "@/components/admin/forms/FormStaticBody";
import { Button } from "@/components/ui/button";
import { fetchWithClerkAuth } from "@/lib/api";
import { fieldsToBlocks, getPaperDimensions, normalizePageSettings, parseStructuredDocument } from "@/lib/formLayout";
import type { StructuredFormDocument } from "@/types/form";

interface BlankFormResponse {
    form_id: string;
    form_name: string;
    document_json: unknown;
}

type LoadState = "loading" | "ready" | "error";

export default function StudentBlankFormPage() {
    const { itemId } = useParams<{ itemId: string }>();
    const { getToken } = useAuth();

    const [state, setState] = useState<LoadState>("loading");
    const [error, setError] = useState("");
    const [formName, setFormName] = useState("");
    const [doc, setDoc] = useState<StructuredFormDocument | null>(null);

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

                const res = await fetchWithClerkAuth(`/api/me/requirement-items/${itemId}/form`, token);
                if (!res.ok) {
                    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
                    throw new Error(body?.detail ?? `Failed to load form (${res.status}).`);
                }

                const data = (await res.json()) as BlankFormResponse;
                const parsed = parseStructuredDocument(data.document_json);
                if (!parsed) throw new Error("This form uses an unsupported layout and cannot be printed.");

                if (cancelled) return;
                setFormName(data.form_name);
                setDoc(fieldsToBlocks(parsed));
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

    const page = doc ? normalizePageSettings(doc.page) : null;
    const margins = page?.margins ?? null;
    const dimensions = page ? getPaperDimensions(page) : null;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900">{formName || "Blank form"}</h1>
                    <p className="text-sm text-slate-500">
                        Print this form, fill it in by hand, then upload a scan of the completed document.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                        <Link to="/student/upload">
                            <ArrowLeft className="h-4 w-4" />
                            Back to upload
                        </Link>
                    </Button>
                    <Button
                        size="sm"
                        disabled={state !== "ready"}
                        onClick={() => window.print()}
                        className="gap-1.5"
                    >
                        <Printer className="h-4 w-4" />
                        Print / Save as PDF
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

            {state === "ready" && doc && dimensions && margins && (
                <div className="overflow-x-auto rounded-2xl bg-slate-100/70 p-6">
                    <div
                        className="mx-auto bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.10),0_18px_50px_-20px_rgba(15,23,42,0.35)]"
                        style={{
                            width: `${dimensions.width}mm`,
                            minHeight: `${dimensions.height}mm`,
                            padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
                        }}
                    >
                        <FormStaticBody doc={doc} />
                    </div>
                </div>
            )}

            {state === "ready" && doc && <FormPrintRoot doc={doc} />}
        </div>
    );
}
