"use client";

import { useMemo } from "react";
import { Printer } from "lucide-react";

import FormPrintRoot from "@/components/admin/forms/FormPrintRoot";
import FormStaticBody from "@/components/admin/forms/FormStaticBody";
import { Button } from "@/components/ui/button";
import { fieldsToBlocks, getPaperDimensions, normalizePageSettings, parseStructuredDocument } from "@/lib/formLayout";
import type { FormValues, StructuredFormDocument } from "@/types/form";

/** Renders a filled-online form exactly as it would print, plus a print action. */
export default function FilledFormPreview({
    document_json,
    values,
}: {
    document_json: unknown;
    values: FormValues;
}) {
    const doc = useMemo<StructuredFormDocument | null>(() => {
        const parsed = parseStructuredDocument(document_json);
        return parsed ? fieldsToBlocks(parsed) : null;
    }, [document_json]);

    if (!doc) {
        return <p className="text-sm text-slate-500">This form uses an unsupported layout and cannot be previewed.</p>;
    }

    const page = normalizePageSettings(doc.page);
    const margins = page.margins!;
    const { width, height } = getPaperDimensions(page);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-end">
                <Button size="sm" onClick={() => window.print()} className="gap-1.5">
                    <Printer className="h-4 w-4" />
                    Print / Save as PDF
                </Button>
            </div>
            <div className="overflow-auto rounded-xl bg-slate-200/60 p-4">
                <div
                    className="mx-auto bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.10),0_18px_50px_-20px_rgba(15,23,42,0.35)]"
                    style={{
                        width: `${width}mm`,
                        minHeight: `${height}mm`,
                        padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
                    }}
                >
                    <FormStaticBody doc={doc} values={values} />
                </div>
            </div>
            <FormPrintRoot doc={doc} values={values} />
        </div>
    );
}
