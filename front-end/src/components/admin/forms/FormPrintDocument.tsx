"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import FormStaticBody from "./FormStaticBody";
import { getPaperDimensions, normalizePageSettings } from "@/lib/formLayout";
import type { StructuredFormDocument } from "@/types/formLayout";
import type { FormValues } from "@/types/form";

/** Do not shrink beyond this — below it the printed text stops being legible. */
const MIN_FIT_SCALE = 0.5;
/** Leave a hair of room so rounding never produces a blank trailing page. */
const FIT_SAFETY = 0.995;

function roundMm(value: number): number {
    return Math.round(value * 100) / 100;
}

export interface PrintMetrics {
    /** Estimated printed page count (explicit page breaks add whitespace). */
    pageCount: number;
    /** Applied print zoom (1 = no scaling). */
    scale: number;
    /** Scale the content would need; may be below MIN_FIT_SCALE. */
    requestedScale: number;
    contentHeightMm: number;
    availableHeightMm: number;
}

interface FormPrintDocumentProps {
    doc: StructuredFormDocument;
    onMeasured?: (metrics: PrintMetrics) => void;
    values?: FormValues;
}

/**
 * Print-only renderer.
 *
 * It is mounted in a portal on ``<body>`` (see ``FormPrintRoot``) so printing
 * can hide the whole admin shell with ``display: none`` instead of
 * ``visibility: hidden`` — the latter still creates blank pages.
 *
 * Print margins are handled by ``@page`` rather than by padding on the sheet,
 * which gives pages 2+ the same top/bottom margins as page 1.
 */
export default function FormPrintDocument({ doc, onMeasured, values }: FormPrintDocumentProps) {
    const page = normalizePageSettings(doc.page);
    const margins = page.margins!;
    const { width, height } = getPaperDimensions(page);
    const contentWidth = Math.max(roundMm(width - margins.left - margins.right), 1);
    const availableHeight = Math.max(roundMm(height - margins.top - margins.bottom), 1);

    const sheetRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const onMeasuredRef = useRef(onMeasured);
    onMeasuredRef.current = onMeasured;

    const measure = useCallback(() => {
        const el = sheetRef.current;
        if (!el) return;

        // The sheet is laid out at the print content width at CSS 96 dpi.
        const contentHeightMm = (el.scrollHeight * 25.4) / 96;
        const requestedScale = page.fitToPage
            ? Math.min(1, (availableHeight * FIT_SAFETY) / Math.max(contentHeightMm, 0.1))
            : 1;
        const appliedScale = Math.max(MIN_FIT_SCALE, requestedScale);
        const renderedHeight = contentHeightMm * appliedScale;
        const pageCount = Math.max(1, Math.ceil(renderedHeight / availableHeight - 1e-6));

        setScale((prev) => (Math.abs(prev - appliedScale) < 0.0005 ? prev : appliedScale));
        onMeasuredRef.current?.({
            pageCount,
            scale: appliedScale,
            requestedScale,
            contentHeightMm,
            availableHeightMm: availableHeight,
        });
    }, [availableHeight, page.fitToPage]);

    useLayoutEffect(() => {
        measure();
    }, [measure, doc]);

    useEffect(() => {
        const el = sheetRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => measure());
        observer.observe(el);
        return () => observer.disconnect();
    }, [measure]);

    useEffect(() => {
        const fonts = typeof document !== "undefined" ? document.fonts : undefined;
        if (!fonts) return;
        let cancelled = false;
        void fonts.ready.then(() => {
            if (!cancelled) measure();
        });
        return () => {
            cancelled = true;
        };
    }, [measure]);

    const printCss = `
@media print {
    @page { size: ${page.size} ${page.orientation}; margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    body > *:not(.form-print-root) { display: none !important; }
    .form-print-root {
        position: static !important;
        inset: auto !important;
        width: auto !important;
        overflow: visible !important;
        visibility: visible !important;
        pointer-events: auto !important;
        z-index: auto !important;
    }
    .form-print-sheet {
        /* @page margins define the content box, so fill it exactly (no mm rounding drift). */
        width: 100% !important;
        margin: 0 auto !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
        ${page.fitToPage ? `zoom: ${scale};` : ""}
    }
    .form-keep { break-inside: avoid; }
    .form-block { break-inside: avoid; }
    .form-section-header { break-after: avoid; }
    .form-table thead { display: table-header-group; }
    .form-table tr { break-inside: avoid; }
}
`;

    return (
        <>
            <style>{printCss}</style>
            <div
                ref={sheetRef}
                data-testid="form-print-sheet"
                className="form-print-sheet bg-white text-slate-900"
                style={{ width: `${contentWidth}mm` }}
            >
                <FormStaticBody doc={doc} suppressPageBreaks={page.fitToPage} values={values} />
            </div>
        </>
    );
}
