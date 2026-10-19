import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import FormPrintDocument from "@/components/admin/forms/FormPrintDocument";
import type { StructuredFormDocument } from "@/types/form";

vi.mock("@/hooks/usePublicBranding", () => ({
    FALLBACK_BRANDING: {
        institution_name: "College of Computer Studies",
        address_lines: [],
        contact_line: null,
        logo_url: "/ccs-logo.jpg",
    },
    invalidateBrandingCache: vi.fn(),
    usePublicBranding: () => ({
        branding: {
            institution_name: "College of Computer Studies",
            address_lines: [],
            contact_line: null,
            logo_url: "/ccs-logo.jpg",
        },
        isLoading: false,
    }),
}));

const doc: StructuredFormDocument = {
    version: 1,
    creation_mode: "structured",
    title: "Admission Form",
    subtitle: "",
    instructions: "Print legibly.",
    letterhead: null,
    page: {
        size: "A4",
        orientation: "portrait",
        margins: { top: 14, right: 16, bottom: 14, left: 16 },
        fitToPage: false,
    },
    sections: [
        {
            id: "s1",
            heading: "PERSONAL INFORMATION",
            fields: [],
            blocks: [
                { type: "paragraph", id: "p1", text: "Complete all fields." },
                {
                    type: "table",
                    id: "t1",
                    columns: 2,
                    rows: [
                        ["School", "Year"],
                        ["WMSU", "2026"],
                    ],
                    columnWidths: ["60%", "40%"],
                    headerRow: true,
                },
            ],
        },
    ],
    signatureLabel: "Signature over Printed Name",
    footer: "Office of the Registrar",
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe("print document", () => {
    it("emits per-page @page margins and print break rules", () => {
        const { container } = render(<FormPrintDocument doc={doc} />);
        const style = container.querySelector("style")!.textContent ?? "";

        expect(style).toContain("@page { size: A4 portrait; margin: 14mm 16mm 14mm 16mm; }");
        expect(style).toContain("body > *:not(.form-print-root) { display: none !important; }");
        expect(style).toContain("display: table-header-group");
        expect(style).toContain("break-inside: avoid");
        expect(style).not.toContain("zoom:");
    });

    it("sizes the sheet to the printable content width", () => {
        const { getByTestId } = render(<FormPrintDocument doc={doc} />);
        const sheet = getByTestId("form-print-sheet");
        expect(sheet.style.width).toBe("178mm");
    });

    it("swaps @page size and content width for landscape Letter", () => {
        const landscape: StructuredFormDocument = {
            ...doc,
            page: {
                size: "Letter",
                orientation: "landscape",
                margins: { top: 10, right: 12, bottom: 10, left: 12 },
                fitToPage: false,
            },
        };
        const { container, getByTestId } = render(<FormPrintDocument doc={landscape} />);
        const style = container.querySelector("style")!.textContent ?? "";
        expect(style).toContain("@page { size: Letter landscape; margin: 10mm 12mm 10mm 12mm; }");
        expect(getByTestId("form-print-sheet").style.width).toBe("255.4mm");
    });

    it("applies a fit-to-page zoom when the content is taller than the printable area", () => {
        vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1200);

        const { container } = render(
            <FormPrintDocument
                doc={{
                    ...doc,
                    page: { ...doc.page!, fitToPage: true },
                }}
            />,
        );
        const style = container.querySelector("style")!.textContent ?? "";

        expect(style).toMatch(/zoom: 0\.\d+/);
    });

    it("reports the estimated page count and scale", () => {
        vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1200);
        const onMeasured = vi.fn();

        render(
            <FormPrintDocument
                doc={{
                    ...doc,
                    page: { ...doc.page!, fitToPage: true },
                }}
                onMeasured={onMeasured}
            />,
        );

        expect(onMeasured).toHaveBeenCalled();
        const metrics = onMeasured.mock.calls.at(-1)![0];
        expect(metrics.pageCount).toBeGreaterThanOrEqual(1);
        expect(metrics.scale).toBeLessThan(1);
        expect(metrics.scale).toBeGreaterThanOrEqual(0.5);
    });
});
