import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { StrictMode } from "react";

import FormsPage from "@/pages/admin/forms/FormsPage";
import { createEmptyStructuredDocument } from "@/lib/formLayout";
import type { FormRecord } from "@/types/form";

const { mockFetch, mockToast } = vi.hoisted(() => ({
    mockFetch: vi.fn(),
    mockToast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@clerk/clerk-react", () => ({
    useAuth: () => ({
        getToken: vi.fn().mockResolvedValue("mock-token"),
        isLoaded: true,
        isSignedIn: true,
    }),
}));

// Real signature: fetchWithClerkAuth(path, token, init).
vi.mock("@/lib/api", () => ({
    fetchWithClerkAuth: mockFetch,
}));

vi.mock("sonner", () => ({
    toast: mockToast,
}));

function jsonResponse(data: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

function makeForm(id: string, name: string): FormRecord {
    return {
        id,
        name,
        description: null,
        creation_mode: "structured",
        document_type_id: null,
        document_json: createEmptyStructuredDocument(),
        pdf_file_key: null,
        extraction_schema_id: null,
        created_at: "2026-10-15T00:00:00Z",
        updated_at: "2026-10-15T00:00:00Z",
    } as FormRecord;
}

// Serves the admin forms endpoints. Each POST adds a form, so the list reload sees it.
function installApi() {
    const forms: FormRecord[] = [];
    mockFetch.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (path === "/api/admin/forms" && method === "GET") return jsonResponse(forms);
        if (path === "/api/admin/forms" && method === "POST") {
            const body = JSON.parse(init?.body as string) as { name: string };
            const created = makeForm(`form-${forms.length + 1}`, body.name);
            forms.push(created);
            return jsonResponse(created, 201);
        }
        if (path.startsWith("/api/admin/document-types")) return jsonResponse([]);
        if (path.startsWith("/api/admin/extraction-schemas")) return jsonResponse([]);
        return jsonResponse({ detail: "not mocked" }, 404);
    });
}

async function createFormNamed(name: string, toastCount: number) {
    // The first "Create form" button is the empty-state one; afterwards the list's "New" button opens the dialog.
    const openers = screen.queryAllByRole("button", { name: /^(create form|new)$/i });
    fireEvent.click(openers[0]);
    const nameInput = await screen.findByLabelText("Form name");
    fireEvent.change(nameInput, { target: { value: name } });
    const submit = document.querySelector<HTMLButtonElement>('[data-tour="forms-create-submit"]');
    if (!submit) throw new Error("Submit button not found");
    fireEvent.click(submit);
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledTimes(toastCount));
    await waitFor(() => expect(screen.queryByLabelText("Form name")).toBeNull());
}

describe("FormsPage create form", () => {
    let errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
        errors.push(event.error ?? event.message);
        event.preventDefault();
    };

    beforeEach(() => {
        errors = [];
        mockFetch.mockReset();
        mockToast.success.mockReset();
        mockToast.error.mockReset();
        installApi();
        window.addEventListener("error", onError);
    });

    afterEach(() => {
        window.removeEventListener("error", onError);
        cleanup();
    });

    it("creates a form and the editor shows it, then a second form can be created", async () => {
        render(
            <StrictMode>
                <MemoryRouter>
                    <FormsPage />
                </MemoryRouter>
            </StrictMode>,
        );

        await createFormNamed("First Form", 1);
        expect(screen.queryByText(/older layout format/)).toBeNull();
        expect(screen.getByDisplayValue("First Form")).toBeDefined();

        await createFormNamed("Second Form", 2);
        expect(screen.queryByText(/older layout format/)).toBeNull();
        expect(screen.getByDisplayValue("Second Form")).toBeDefined();

        expect(mockToast.error).not.toHaveBeenCalled();
        expect(errors).toEqual([]);
    });
});
