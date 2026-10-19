import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import FormFieldPreview from "@/components/admin/forms/FormFieldPreview";
import FormPaper from "@/components/admin/forms/FormPaper";
import type { FieldBlock, StructuredFormDocument } from "@/types/form";

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

const requiredField: FieldBlock = {
    type: "field",
    id: "b1",
    field_key: "full_name",
    label: "Full Name",
    ui_component: "text_input",
    required: true,
    options: null,
};

describe("2D: required-field flagging", () => {
    it("marks required fields with an asterisk", () => {
        render(<FormFieldPreview field={requiredField} />);
        expect(screen.getByText("Full Name")).toBeInTheDocument();
        expect(screen.getByText("*")).toBeInTheDocument();
    });

    it("does not mark optional fields", () => {
        render(<FormFieldPreview field={{ ...requiredField, required: false }} />);
        expect(screen.queryByText("*")).not.toBeInTheDocument();
    });

    it("renders radio options and the date placeholder", () => {
        const { unmount } = render(
            <FormFieldPreview
                field={{
                    ...requiredField,
                    ui_component: "radio_group",
                    options: [
                        { value: "male", label: "Male" },
                        { value: "female", label: "Female" },
                    ],
                }}
            />,
        );
        expect(screen.getByText("Male")).toBeInTheDocument();
        expect(screen.getByText("Female")).toBeInTheDocument();
        unmount();

        render(<FormFieldPreview field={{ ...requiredField, ui_component: "date_picker" }} />);
        expect(screen.getByText("MM / DD / YYYY")).toBeInTheDocument();
    });
});

const previewDoc: StructuredFormDocument = {
    version: 1,
    creation_mode: "structured",
    title: "Admission Form",
    subtitle: "First Semester",
    instructions: "Print legibly.",
    letterhead: {
        institutionName: "College of Computer Studies",
        addressLines: ["Campus Address", "City, Province"],
        contactLine: "registrar@example.edu",
        formNumber: "ADS-01",
    },
    page: { size: "A4", orientation: "portrait", margins: { top: 14, right: 16, bottom: 14, left: 16 } },
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

describe("2D: print renderer", () => {
    it("renders every block type without editor chrome", () => {
        const { container } = render(<FormPaper doc={previewDoc} mode="preview" onChange={() => {}} />);

        expect(screen.getByText("Admission Form")).toBeInTheDocument();
        expect(screen.getByText("PERSONAL INFORMATION")).toBeInTheDocument();
        expect(screen.getByText("Complete all fields.")).toBeInTheDocument();
        expect(screen.getByText("Full Name")).toBeInTheDocument();
        expect(screen.getByText("School")).toBeInTheDocument();
        expect(screen.getByText("Registrar")).toBeInTheDocument();
        expect(screen.getByText("Office of the Registrar")).toBeInTheDocument();

        // Preview must not expose editor-only controls.
        expect(screen.queryByPlaceholderText("Form title")).not.toBeInTheDocument();
        expect(container.querySelectorAll("input[placeholder]")).toHaveLength(0);
    });

    it("renders the table header row in a thead so print can repeat it", () => {
        const { container } = render(<FormPaper doc={previewDoc} mode="preview" onChange={() => {}} />);
        const table = container.querySelector("table");
        expect(table).not.toBeNull();
        expect(table!.querySelector("thead")).not.toBeNull();
        expect(table!.querySelector("thead")!.textContent).toContain("School");
        expect(table!.querySelectorAll("tbody tr")).toHaveLength(1);
    });

    it("applies column widths via colgroup", () => {
        const { container } = render(<FormPaper doc={previewDoc} mode="preview" onChange={() => {}} />);
        const cols = container.querySelectorAll("colgroup col");
        expect(cols).toHaveLength(2);
        expect(cols[0].getAttribute("style")).toContain("60%");
        expect(cols[1].getAttribute("style")).toContain("40%");
    });

    it("sizes the paper from page settings", () => {
        const { container } = render(<FormPaper doc={previewDoc} mode="preview" onChange={() => {}} />);
        const paper = container.querySelector(".form-paper") as HTMLElement;
        expect(paper.style.width).toBe("210mm");
        expect(paper.style.minHeight).toBe("297mm");
        expect(paper.style.paddingTop).toBe("14mm");
        expect(paper.style.paddingLeft).toBe("16mm");
    });

    it("swaps dimensions for landscape", () => {
        const landscape: StructuredFormDocument = {
            ...previewDoc,
            page: { size: "Letter", orientation: "landscape", margins: { top: 10, right: 12, bottom: 10, left: 12 } },
        };
        const { container } = render(<FormPaper doc={landscape} mode="preview" onChange={() => {}} />);
        const paper = container.querySelector(".form-paper") as HTMLElement;
        expect(paper.style.width).toBe("279.4mm");
        expect(paper.style.minHeight).toBe("215.9mm");
        expect(paper.style.paddingTop).toBe("10mm");
        expect(paper.style.paddingRight).toBe("12mm");
    });

    it("uses the shared static body for preview, with no print-only style tag", () => {
        const { container } = render(<FormPaper doc={previewDoc} mode="preview" onChange={() => {}} />);
        expect(container.querySelector("style")).toBeNull();
        expect(screen.getByRole("heading", { name: "Admission Form" })).toBeInTheDocument();
    });

    it("applies a page break before blocks flagged with pageBreakBefore", () => {
        const withBreak: StructuredFormDocument = {
            ...previewDoc,
            sections: [
                {
                    ...previewDoc.sections[0],
                    blocks: [
                        { type: "paragraph", id: "p1", text: "Start of new page.", pageBreakBefore: true },
                        requiredField,
                    ],
                },
            ],
        };
        const { container } = render(<FormPaper doc={withBreak} mode="preview" onChange={() => {}} />);
        expect(container).toBeTruthy();
        const breakBlock = screen.getByText("Start of new page.").closest("[style]") as HTMLElement;
        expect(breakBlock.style.breakBefore).toBe("page");
    });

    it("does not render unresolved blocks as valid fields", () => {
        const unresolved: StructuredFormDocument = {
            ...previewDoc,
            sections: [
                {
                    ...previewDoc.sections[0],
                    blocks: [{ type: "unresolved_field", id: "u1", field_key: "invented", label: "Invented" }],
                },
            ],
        };
        render(<FormPaper doc={unresolved} mode="preview" onChange={() => {}} />);
        expect(screen.getByText(/Unresolved field/)).toBeInTheDocument();
    });
});
