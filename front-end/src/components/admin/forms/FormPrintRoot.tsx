"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import FormPrintDocument from "./FormPrintDocument";
import type { PrintMetrics } from "./FormPrintDocument";
import type { StructuredFormDocument } from "@/types/formLayout";
import type { FormValues } from "@/types/form";

/**
 * Mounts the print-only document as a direct child of ``<body>``.
 *
 * Printing can therefore hide every other body child with ``display: none``,
 * avoiding the blank pages that ``visibility: hidden`` produces when the admin
 * shell is taller than one page.
 */
export default function FormPrintRoot({
    doc,
    onMeasured,
    values,
}: {
    doc: StructuredFormDocument;
    onMeasured?: (metrics: PrintMetrics) => void;
    values?: FormValues;
}) {
    const [container, setContainer] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const el = document.createElement("div");
        el.className = "form-print-root";
        el.setAttribute("aria-hidden", "true");
        document.body.appendChild(el);
        setContainer(el);
        return () => {
            el.remove();
        };
    }, []);

    if (!container) return null;
    return createPortal(<FormPrintDocument doc={doc} onMeasured={onMeasured} values={values} />, container);
}
