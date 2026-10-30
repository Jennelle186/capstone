import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import FormList from "@/components/admin/forms/FormList";
import { createEmptyStructuredDocument } from "@/lib/formLayout";
import type { FormRecord } from "@/types/form";

vi.mock("@/lib/api", () => ({
    fetchWithClerkAuth: vi.fn(),
}));

const baseForm: FormRecord = {
    id: "f-1",
    name: "Admission Form",
    description: "For freshmen",
    creation_mode: "structured",
    document_type_id: null,
    document_json: createEmptyStructuredDocument(),
    pdf_file_key: null,
    extraction_schema_id: null,
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
};

describe("createEmptyStructuredDocument", () => {
    it("returns a v1 structured document with no sections", () => {
        const doc = createEmptyStructuredDocument();
        expect(doc.version).toBe(1);
        expect(doc.creation_mode).toBe("structured");
        expect(doc.sections).toEqual([]);
    });
});

describe("FormList", () => {
    it("renders the empty state", () => {
        render(<FormList forms={[]} selectedId={null} onSelect={() => {}} onDelete={() => {}} onCreate={() => {}} />);
        expect(screen.getByText(/No forms yet/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /New/i })).toBeInTheDocument();
    });

    it("renders form names and selects on click", () => {
        const onSelect = vi.fn();
        render(
            <FormList
                forms={[baseForm]}
                selectedId={null}
                onSelect={onSelect}
                onDelete={() => {}}
                onCreate={() => {}}
            />,
        );

        expect(screen.getByText("Admission Form")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Admission Form"));
        expect(onSelect).toHaveBeenCalledWith(baseForm);
    });

    it("shows a schema badge when the form is linked to a schema", () => {
        render(
            <FormList
                forms={[{ ...baseForm, extraction_schema_id: "schema-1" }]}
                selectedId={null}
                onSelect={() => {}}
                onDelete={() => {}}
                onCreate={() => {}}
            />,
        );
        expect(screen.getByText("schema")).toBeInTheDocument();
    });
});
