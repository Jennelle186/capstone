import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import FormStaticBody from "@/components/admin/forms/FormStaticBody";
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
    signatureLabel: "Signature over Printed Name",
    sections: [
        {
            id: "s1",
            heading: "General Information",
            fields: [],
            blocks: [
                {
                    type: "field",
                    id: "b1",
                    field_key: "application_no",
                    label: "Application No.",
                    ui_component: "text_input",
                    required: true,
                    options: null,
                },
                {
                    type: "field",
                    id: "b2",
                    field_key: "student_name",
                    label: "Name",
                    ui_component: "text_input",
                    required: true,
                    options: null,
                },
            ],
        },
    ],
};

describe("FormStaticBody with values", () => {
    it("renders filled values for field blocks", () => {
        render(
            <FormStaticBody
                doc={doc}
                values={{ application_no: "456866", student_name: "Aelin Galathynius" }}
            />,
        );

        expect(screen.getByText("456866")).toBeInTheDocument();
        expect(screen.getByText("Aelin Galathynius")).toBeInTheDocument();
    });

    it("renders blank controls when values are absent", () => {
        render(<FormStaticBody doc={doc} />);

        expect(screen.queryByText("456866")).not.toBeInTheDocument();
        expect(screen.getByText("Application No.")).toBeInTheDocument();
    });
});
