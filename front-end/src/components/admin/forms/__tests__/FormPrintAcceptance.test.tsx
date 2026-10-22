import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import FormPrintDocument, { type PrintMetrics } from "@/components/admin/forms/FormPrintDocument";
import FormPrintRoot from "@/components/admin/forms/FormPrintRoot";
import type { PublicBranding } from "@/types/branding";
import type { FieldBlock, StructuredFormDocument } from "@/types/form";

/**
 * Automated contract tests for the six 2D print-matrix cases.
 *
 * These lock the DOM/CSS behavior that the print engine consumes. The actual
 * pagination/print-preview pass still has to run in a real browser; the case
 * names below match the manual matrix so failures point at the same scenario.
 */

const brandingState = vi.hoisted(() => ({
    value: {
        institution_name: "College of Computer Studies",
        address_lines: ["Campus Address", "City, Province"],
        contact_line: "registrar@example.edu",
        logo_url: "/ccs-logo.jpg",
    } as PublicBranding,
}));

vi.mock("@/hooks/usePublicBranding", () => ({
    FALLBACK_BRANDING: {
        institution_name: "College of Computer Studies",
        address_lines: [],
        contact_line: null,
        logo_url: "/ccs-logo.jpg",
    },
    invalidateBrandingCache: vi.fn(),
    usePublicBranding: () => ({ branding: brandingState.value, isLoading: false }),
}));

const defaultBranding: PublicBranding = {
    institution_name: "College of Computer Studies",
    address_lines: ["Campus Address", "City, Province"],
    contact_line: "registrar@example.edu",
    logo_url: "/ccs-logo.jpg",
};

const requiredField: FieldBlock = {
    type: "field",
    id: "f1",
    field_key: "full_name",
    label: "Full Name",
    ui_component: "text_input",
    required: true,
    options: null,
};

const baseDoc: StructuredFormDocument = {
    version: 1,
    creation_mode: "structured",
    title: "Admission Form",
    subtitle: "First Semester",
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
                requiredField,
                {
                    type: "table",
                    id: "t1",
                    columns: 2,
                    rows: [
                        ["School", "Year"],
                        ["WMSU", "2026"],
                        ["Course", "BSCS"],
                    ],
                    columnWidths: ["60%", "40%"],
                    headerRow: true,
                },
                { type: "signature", id: "sig1", label: "Registrar" },
            ],
        },
    ],
    signatureLabel: "Signature over Printed Name",
    footer: "Office of the Registrar",
};

function lastMetrics(onMeasured: ReturnType<typeof vi.fn>): PrintMetrics {
    expect(onMeasured).toHaveBeenCalled();
    return onMeasured.mock.calls.at(-1)![0] as PrintMetrics;
}

function bodyPrintRoot(): HTMLElement | null {
    return (
        Array.from(document.body.children).find(
            (element): element is HTMLElement => element.classList.contains("form-print-root"),
        ) ?? null
    );
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    brandingState.value = {
        ...defaultBranding,
        address_lines: [...defaultBranding.address_lines],
    };
});

describe("2D print acceptance matrix", () => {
    it("case 1: A4 portrait, fit off, short form is one page and removes the shell from page flow", () => {
        vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(500);
        const onMeasured = vi.fn();
        const { container, getByTestId } = render(
            <FormPrintDocument doc={baseDoc} onMeasured={onMeasured} />,
        );
        const style = container.querySelector("style")!.textContent ?? "";

        expect(style).toContain("@page { size: A4 portrait; margin: 14mm 16mm 14mm 16mm; }");
        expect(style).toContain("body > *:not(.form-print-root) { display: none !important; }");
        expect(style).not.toContain("zoom:");
        expect(getByTestId("form-print-sheet").style.width).toBe("178mm");
        expect(lastMetrics(onMeasured)).toMatchObject({ pageCount: 1, scale: 1 });
    });

    it("case 1b: the print portal is a direct body child and is removed on unmount", async () => {
        const { unmount } = render(<FormPrintRoot doc={baseDoc} />);
        await waitFor(() => {
            expect(bodyPrintRoot()).not.toBeNull();
        });

        const root = bodyPrintRoot()!;
        expect(root.querySelector("style")!.textContent).toContain(
            "body > *:not(.form-print-root) { display: none !important; }",
        );

        unmount();
        expect(bodyPrintRoot()).toBeNull();
    });

    it("case 2: A4 portrait, fit off, a forced break is emitted and the section header stays attached", () => {
        const doc: StructuredFormDocument = {
            ...baseDoc,
            sections: [
                {
                    ...baseDoc.sections[0],
                    blocks: [
                        { type: "paragraph", id: "p1", text: "Start of new page.", pageBreakBefore: true },
                        requiredField,
                        { type: "signature", id: "sig1", label: "Registrar" },
                    ],
                },
            ],
        };
        const { container } = render(<FormPrintDocument doc={doc} />);
        const style = container.querySelector("style")!.textContent ?? "";
        const breakBlock = screen.getByText("Start of new page.").closest(".form-block") as HTMLElement;

        expect(breakBlock).not.toBeNull();
        expect(breakBlock.style.breakBefore).toBe("page");
        expect(style).toContain(".form-section-header { break-after: avoid; }");
        expect(style).toContain(".form-block { break-inside: avoid; }");
        expect(screen.getByText("PERSONAL INFORMATION")).toBeInTheDocument();
    });

    it("case 3: A4 portrait, fit on, ~1.5 pages scales to one page and suppresses explicit breaks", () => {
        const availableHeightMm = 297 - 14 - 14;
        const contentHeightMm = availableHeightMm * 1.5;
        vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
            Math.round((contentHeightMm * 96) / 25.4),
        );
        const doc: StructuredFormDocument = {
            ...baseDoc,
            page: { ...baseDoc.page!, fitToPage: true },
            sections: [
                {
                    ...baseDoc.sections[0],
                    blocks: [
                        { type: "paragraph", id: "p1", text: "Start of new page.", pageBreakBefore: true },
                        requiredField,
                    ],
                },
            ],
        };
        const onMeasured = vi.fn();
        const { container } = render(<FormPrintDocument doc={doc} onMeasured={onMeasured} />);
        const style = container.querySelector("style")!.textContent ?? "";
        const zoom = Number(style.match(/zoom: ([\d.]+);/)?.[1]);
        const metrics = lastMetrics(onMeasured);
        const breakBlock = screen.getByText("Start of new page.").closest(".form-block") as HTMLElement;

        expect(zoom).toBeGreaterThan(0.5);
        expect(zoom).toBeLessThan(1);
        expect(metrics.pageCount).toBe(1);
        expect(metrics.scale).toBeLessThan(1);
        expect(metrics.requestedScale).toBeGreaterThan(0.5);
        expect(metrics.contentHeightMm * metrics.scale).toBeLessThanOrEqual(metrics.availableHeightMm);
        expect(breakBlock.style.breakBefore).toBe("");
    });

    it("case 4: Letter landscape keeps a multipage table splittable and repeats its header", () => {
        const doc: StructuredFormDocument = {
            ...baseDoc,
            page: {
                size: "Letter",
                orientation: "landscape",
                margins: { top: 10, right: 12, bottom: 10, left: 12 },
                fitToPage: false,
            },
        };
        const { container, getByTestId } = render(<FormPrintDocument doc={doc} />);
        const style = container.querySelector("style")!.textContent ?? "";
        const table = container.querySelector("table")!;

        expect(style).toContain("@page { size: Letter landscape; margin: 10mm 12mm 10mm 12mm; }");
        expect(getByTestId("form-print-sheet").style.width).toBe("255.4mm");
        expect(style).toContain(".form-table thead { display: table-header-group; }");
        expect(style).toContain(".form-table tr { break-inside: avoid; }");
        expect(table.querySelector("thead")!.textContent).toContain("School");
        expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
        expect(table.closest(".form-block")).toBeNull();
    });

    it("case 5: signature and date rows share a no-break container", () => {
        const { container } = render(<FormPrintDocument doc={baseDoc} />);
        const style = container.querySelector("style")!.textContent ?? "";
        const signature = screen.getByText("Signature over Printed Name").closest(".form-keep");
        const date = screen.getByText("Date").closest(".form-keep");
        const blockSignature = screen.getByText("Registrar").closest(".form-keep");

        expect(signature).not.toBeNull();
        expect(signature).toBe(date);
        expect(blockSignature).not.toBeNull();
        expect(style).toContain(".form-keep { break-inside: avoid; }");
    });

    it("case 6: missing logo falls back, print colors/fonts are set, and no AI call is made", () => {
        brandingState.value = { ...defaultBranding, logo_url: null };
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const { container } = render(<FormPrintDocument doc={baseDoc} />);
        const style = container.querySelector("style")!.textContent ?? "";
        const logo = screen.getByAltText("Institution logo");

        expect(logo.getAttribute("src")).toBe("/ccs-logo.jpg");
        expect(screen.getByRole("heading", { name: "Admission Form" })).toHaveClass("font-serif");
        expect(style).toContain("print-color-adjust: exact;");
        expect(style).toContain("-webkit-print-color-adjust: exact;");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
