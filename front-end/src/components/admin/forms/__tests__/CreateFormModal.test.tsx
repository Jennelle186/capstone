import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import CreateFormModal from "@/components/admin/forms/CreateFormModal";
import { createEmptyStructuredDocument } from "@/lib/formLayout";
import type { ExtractionSchemaRecord } from "@/types/extractionSchema";
import type { FormRecord } from "@/types/form";

const { mockFetch, mockToast } = vi.hoisted(() => ({
    mockFetch: vi.fn(),
    mockToast: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
    },
}));

vi.mock("@clerk/clerk-react", () => ({
    useAuth: () => ({
        getToken: vi.fn().mockResolvedValue("mock-token"),
    }),
}));

vi.mock("@/lib/api", () => ({
    fetchWithClerkAuth: mockFetch,
}));

vi.mock("sonner", () => ({
    toast: mockToast,
}));

vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
    Select: ({
        value,
        onValueChange,
        children,
    }: {
        value?: string;
        onValueChange?: (value: string) => void;
        children: ReactNode;
    }) => (
        <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
            {children}
        </select>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

const schemaWithFields: ExtractionSchemaRecord = {
    id: "schema-1",
    name: "Admission Schema",
    version_label: "2026",
    effective_date: null,
    description: null,
    schema_json: { type: "object", properties: {} },
    fields_json: [
        {
            id: "field-full-name",
            key: "full_name",
            type: "string",
            description: "Full Name",
            required: true,
            ui_component: "text_input",
        },
        {
            id: "field-lrn",
            key: "lrn",
            type: "string",
            description: "LRN",
            required: true,
            ui_component: "text_input",
        },
    ],
    document_type_id: null,
    status: "active",
    source_file_name: null,
    generation_prompt: null,
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
};

const createdForm: FormRecord = {
    id: "form-1",
    name: "Grounded Form",
    description: null,
    creation_mode: "structured",
    document_type_id: null,
    document_json: createEmptyStructuredDocument(),
    pdf_file_key: null,
    extraction_schema_id: null,
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
};

let schemas: ExtractionSchemaRecord[] = [schemaWithFields];

function jsonResponse(data: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data,
    } as Response;
}

function renderModal() {
    return render(<CreateFormModal open onOpenChange={() => {}} onCreated={() => {}} />);
}

async function openAiModeWithName(name = "Grounded Form") {
    fireEvent.click(screen.getByRole("button", { name: "Generate with AI" }));
    await screen.findByRole("option", { name: /Admission Schema/ });
    fireEvent.change(screen.getByLabelText("Form name"), { target: { value: name } });
}

function selectSchema(schemaId: string) {
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: schemaId } });
}

function generationBody(): Record<string, unknown> | null {
    const call = mockFetch.mock.calls.find(([path]) => path === "/api/admin/forms/generate");
    if (!call) return null;
    return JSON.parse((call[2] as RequestInit).body as string) as Record<string, unknown>;
}

describe("CreateFormModal generation description", () => {
    beforeEach(() => {
        schemas = [schemaWithFields];
        mockFetch.mockReset();
        mockToast.error.mockReset();
        mockToast.success.mockReset();
        mockToast.warning.mockReset();
        mockFetch.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
            if (path === "/api/admin/document-types?status=active") return jsonResponse([]);
            if (path === "/api/admin/extraction-schemas?status=active") return jsonResponse(schemas);
            if (path === "/api/admin/forms/generate") return jsonResponse({
                document_json: createEmptyStructuredDocument(),
                fields_json: schemaWithFields.fields_json,
                form_name: "Grounded Form",
                form_control_id: "TEST-001",
                warnings: [],
            });
            if (path === "/api/admin/forms" && init?.method === "POST") return jsonResponse(createdForm, 201);
            throw new Error(`Unexpected request: ${path}`);
        });
    });

    it("allows an empty description when a schema supplies fields", async () => {
        renderModal();
        await openAiModeWithName();
        selectSchema("schema-1");

        expect(screen.getByText(/Grounded on Admission Schema · 2 field/)).toBeInTheDocument();
        expect(screen.getByLabelText("Layout instructions (optional)")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Create form" }));

        await waitFor(() => expect(generationBody()).not.toBeNull());
        expect(generationBody()).toMatchObject({ description: "" });
        expect((generationBody()?.fields as Array<{ key: string }>).map((field) => field.key)).toEqual([
            "full_name",
            "lrn",
        ]);
        expect(mockToast.error).not.toHaveBeenCalledWith("Please describe the form before generating.");
    });

    it("requires a description when no schema is selected", async () => {
        renderModal();
        await openAiModeWithName();

        fireEvent.click(screen.getByRole("button", { name: "Create form" }));

        await waitFor(() =>
            expect(mockToast.error).toHaveBeenCalledWith("Please describe the form before generating."),
        );
        expect(generationBody()).toBeNull();
    });

    it("still supports description-only generation without a schema", async () => {
        renderModal();
        await openAiModeWithName();
        fireEvent.change(screen.getByLabelText("Describe the form and its fields"), {
            target: { value: "Create a student contact form." },
        });

        fireEvent.click(screen.getByRole("button", { name: "Create form" }));

        await waitFor(() => expect(generationBody()).not.toBeNull());
        expect(generationBody()).toMatchObject({
            description: "Create a student contact form.",
            fields: null,
        });
    });

    it("rejects a selected schema that has no fields", async () => {
        schemas = [
            {
                ...schemaWithFields,
                id: "schema-empty",
                fields_json: [],
                schema_json: { type: "object", properties: {} },
            },
        ];
        renderModal();
        fireEvent.click(screen.getByRole("button", { name: "Generate with AI" }));
        await screen.findByRole("option", { name: /Admission Schema/ });
        fireEvent.change(screen.getByLabelText("Form name"), { target: { value: "Grounded Form" } });
        selectSchema("schema-empty");

        expect(screen.getByText(/This schema has no fields/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Create form" }));

        await waitFor(() =>
            expect(mockToast.error).toHaveBeenCalledWith(
                "The selected schema has no fields. Choose another schema or set it to No schema.",
            ),
        );
        expect(generationBody()).toBeNull();
    });

    it("uses schema_json fields when fields_json is empty", async () => {
        schemas = [
            {
                ...schemaWithFields,
                id: "schema-json",
                fields_json: [],
                schema_json: {
                    type: "object",
                    properties: {
                        full_name: { type: "string", description: "Full Name" },
                    },
                    required: ["full_name"],
                },
            },
        ];
        renderModal();
        fireEvent.click(screen.getByRole("button", { name: "Generate with AI" }));
        await screen.findByRole("option", { name: /Admission Schema/ });
        fireEvent.change(screen.getByLabelText("Form name"), { target: { value: "Grounded Form" } });
        selectSchema("schema-json");

        fireEvent.click(screen.getByRole("button", { name: "Create form" }));

        await waitFor(() => expect(generationBody()).not.toBeNull());
        expect((generationBody()?.fields as Array<{ key: string }>).map((field) => field.key)).toEqual([
            "full_name",
        ]);
    });
});
