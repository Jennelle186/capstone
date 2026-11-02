import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { toast } from "sonner";

import type { TourStartRequest } from "@/types/tutorial";
import { createField } from "@/lib/schema-utils";

const hoisted = vi.hoisted(() => ({
    latestProps: null as null | Record<string, any>,
    fetchMock: null as null | Mock<(...args: any[]) => any>,
}));

vi.mock("@clerk/clerk-react", () => ({
    useAuth: () => ({
        getToken: async () => "test-token",
        isLoaded: true,
        isSignedIn: true,
    }),
}));

vi.mock("@/lib/api", () => ({
    fetchWithClerkAuth: (...args: unknown[]) => hoisted.fetchMock!(...args),
}));

vi.mock("react-router", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react-router")>()),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock("sonner", () => ({
    toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/admin/extraction-schemas/ExtractionLayout", () => ({
    default: (props: Record<string, any>) => {
        hoisted.latestProps = props;
        return null;
    },
}));

import ExtractionSchemasPage from "../ExtractionSchemasPage";

function jsonResponse(data: unknown) {
    return { ok: true, status: 200, json: async () => data };
}

function activeSchemaRecord() {
    const field = { ...createField(), id: "field-units", key: "units_taken", label: "Units taken" };
    return {
        id: "schema-admission",
        name: "Admission Schema",
        version_label: "1",
        effective_date: null,
        description: null,
        schema_json: { type: "object", properties: {} },
        fields_json: [field],
        document_type_id: null,
        status: "active",
        source_file_name: null,
        generation_prompt: null,
    };
}

function setupFetch(schemas: unknown[]) {
    hoisted.fetchMock = vi.fn(async (path: string, _token: string, _init?: RequestInit) => {
        if (path.startsWith("/api/admin/extraction-schemas")) return jsonResponse(schemas);
        if (path.startsWith("/api/admin/document-types")) return jsonResponse([]);
        if (path.startsWith("/api/admin/analytics/canonical-keys")) return jsonResponse({ keys: [] });
        return jsonResponse({});
    });
}

/** Calls that write (anything other than GET). fetchWithClerkAuth is called as (path, token, init). */
function writeCalls() {
    return hoisted.fetchMock!.mock.calls.filter(
        ([, , init]) => init && (init as RequestInit).method && (init as RequestInit).method !== "GET",
    );
}

function emitRequest(): TourStartRequest {
    const request: TourStartRequest = {
        moduleKey: "extraction-schemas",
        handled: false,
        proceed: vi.fn(),
    };
    act(() => {
        window.dispatchEvent(new CustomEvent("admin-tour:request-start", { detail: request }));
    });
    return request;
}

async function renderPage() {
    hoisted.latestProps = null;
    render(<ExtractionSchemasPage />);
    await waitFor(() => expect(hoisted.latestProps).not.toBeNull());
}

describe("ExtractionSchemasPage guided tour prompts", () => {
    beforeEach(() => {
        hoisted.latestProps = null;
    });

    describe("when a saved schema is open", () => {
        beforeEach(async () => {
            setupFetch([activeSchemaRecord()]);
            await renderPage();
            await waitFor(() => expect(hoisted.latestProps?.selectedSchemaId).toBe("schema-admission"));
        });

        it("asks before starting and takes over the start", () => {
            const request = emitRequest();

            expect(request.handled).toBe(true);
            expect(request.proceed).not.toHaveBeenCalled();
            const dialog = screen.getByRole("alertdialog");
            expect(within(dialog).getByText("Start the tour with a blank draft?")).toBeTruthy();
            expect(within(dialog).getByText("The schema you have open is not changed.")).toBeTruthy();
        });

        it("Cancel closes the dialog and does not start the tour", () => {
            const request = emitRequest();

            fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

            expect(request.proceed).not.toHaveBeenCalled();
            expect(screen.queryByRole("alertdialog")).toBeNull();
            expect(hoisted.latestProps?.formState.name).toBe("Admission Schema");
        });

        it("Keep my schema starts the tour without changing the open schema", () => {
            const request = emitRequest();

            fireEvent.click(screen.getByRole("button", { name: "Keep my schema" }));

            expect(request.proceed).toHaveBeenCalledTimes(1);
            expect(screen.queryByRole("alertdialog")).toBeNull();
            expect(hoisted.latestProps?.selectedSchemaId).toBe("schema-admission");
            expect(hoisted.latestProps?.formState.name).toBe("Admission Schema");
        });

        it("Start with a blank draft opens a blank draft and starts the tour", () => {
            const request = emitRequest();

            fireEvent.click(screen.getByRole("button", { name: "Start with a blank draft" }));

            expect(request.proceed).toHaveBeenCalledTimes(1);
            expect(hoisted.latestProps?.selectedSchemaId).toBeNull();
            expect(hoisted.latestProps?.formState.name).toBe("Default Schema");
            expect(hoisted.latestProps?.formState.status).toBe("draft");
        });

        it("the Admission Schema on the server is never saved or activated by the tour", () => {
            emitRequest();
            fireEvent.click(screen.getByRole("button", { name: "Start with a blank draft" }));

            expect(writeCalls()).toHaveLength(0);
        });
    });

    describe("when no saved schema is open", () => {
        beforeEach(async () => {
            setupFetch([]);
            await renderPage();
        });

        it("starts straight away with no dialog", () => {
            const request = emitRequest();

            expect(request.handled).toBe(false);
            expect(screen.queryByRole("alertdialog")).toBeNull();
        });

        it("offers to remove only the fields added during the tour", async () => {
            const request = emitRequest();
            act(() => {
                window.dispatchEvent(new CustomEvent("admin-tour:start", { detail: { moduleKey: "extraction-schemas" } }));
            });
            expect(request.handled).toBe(false);

            act(() => {
                hoisted.latestProps?.onAddField();
            });
            await waitFor(() => expect(hoisted.latestProps?.formState.fields_json).toHaveLength(2));

            act(() => {
                window.dispatchEvent(new CustomEvent("admin-tour:end", { detail: { moduleKey: "extraction-schemas" } }));
            });

            const dialog = await screen.findByRole("alertdialog");
            expect(within(dialog).getByText(/Remove the 1 field added during the tour\?/)).toBeTruthy();

            fireEvent.click(within(dialog).getByRole("button", { name: "Remove them" }));

            await waitFor(() => expect(hoisted.latestProps?.formState.fields_json).toHaveLength(1));
            expect(screen.queryByRole("alertdialog")).toBeNull();
        });

        it("Keep them leaves the added field in place", async () => {
            emitRequest();
            act(() => {
                window.dispatchEvent(new CustomEvent("admin-tour:start", { detail: { moduleKey: "extraction-schemas" } }));
            });
            act(() => {
                hoisted.latestProps?.onAddField();
            });
            await waitFor(() => expect(hoisted.latestProps?.formState.fields_json).toHaveLength(2));

            act(() => {
                window.dispatchEvent(new CustomEvent("admin-tour:end", { detail: { moduleKey: "extraction-schemas" } }));
            });
            const dialog = await screen.findByRole("alertdialog");
            fireEvent.click(within(dialog).getByRole("button", { name: "Keep them" }));

            expect(screen.queryByRole("alertdialog")).toBeNull();
            expect(hoisted.latestProps?.formState.fields_json).toHaveLength(2);
        });
    });
});

describe("ExtractionSchemasPage save, activate, new and sections", () => {
    beforeEach(() => {
        hoisted.latestProps = null;
        vi.clearAllMocks();
    });

    it("blocks saving a field with a blank label and sends no write", async () => {
        setupFetch([]);
        await renderPage();

        await act(async () => {
            await hoisted.latestProps?.onSave();
        });

        expect(hoisted.latestProps?.formError).toMatch(/needs a Label Name before saving/);
        expect(writeCalls()).toHaveLength(0);
    });

    it("blocks saving while the guide runs", async () => {
        setupFetch([]);
        await renderPage();
        act(() => {
            window.dispatchEvent(new CustomEvent("admin-tour:start", { detail: { moduleKey: "extraction-schemas" } }));
        });

        await act(async () => {
            await hoisted.latestProps?.onSave();
        });

        expect(hoisted.latestProps?.formError).toBe("Saving is turned off during the guide. Finish or skip the guide to save.");
        expect(writeCalls()).toHaveLength(0);
    });

    it("blocks activating while the guide runs and shows a toast", async () => {
        setupFetch([{ ...activeSchemaRecord(), status: "draft" }]);
        await renderPage();
        act(() => {
            window.dispatchEvent(new CustomEvent("admin-tour:start", { detail: { moduleKey: "extraction-schemas" } }));
        });

        await act(async () => {
            await hoisted.latestProps?.onActivate("schema-admission");
        });

        expect(toast.error).toHaveBeenCalledWith(
            "Activating is turned off during the guide. Finish or skip the guide first.",
        );
        expect(writeCalls()).toHaveLength(0);
    });

    it("New resets an open saved schema to a blank draft", async () => {
        setupFetch([activeSchemaRecord()]);
        await renderPage();
        await waitFor(() => expect(hoisted.latestProps?.selectedSchemaId).toBe("schema-admission"));

        act(() => {
            hoisted.latestProps?.onNewSchema();
        });

        expect(hoisted.latestProps?.selectedSchemaId).toBeNull();
        expect(hoisted.latestProps?.formState.name).toBe("Default Schema");
        expect(hoisted.latestProps?.formState.status).toBe("draft");
        expect(writeCalls()).toHaveLength(0);
    });

    it("Add Section asks for the name in a dialog and adds the section field", async () => {
        setupFetch([]);
        await renderPage();
        const before = hoisted.latestProps?.formState.fields_json.length;
        const promptSpy = vi.spyOn(window, "prompt");

        act(() => {
            hoisted.latestProps?.onAddSection();
        });
        const dialog = await screen.findByRole("dialog", { name: "Add a section" });
        fireEvent.change(within(dialog).getByLabelText("Section name"), { target: { value: "Enrolment load" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Add section" }));

        expect(promptSpy).not.toHaveBeenCalled();
        const fields = hoisted.latestProps?.formState.fields_json as Array<Record<string, any>>;
        expect(fields).toHaveLength(before + 1);
        const added = fields[fields.length - 1];
        expect(added.section_id).toBe("enrolment_load");
        expect(added.section_title).toBe("Enrolment load");
        expect(added.label ?? "").toBe("");
        expect(writeCalls()).toHaveLength(0);
    });

    it("Add Section with Cancel adds nothing", async () => {
        setupFetch([]);
        await renderPage();
        const before = hoisted.latestProps?.formState.fields_json.length;

        act(() => {
            hoisted.latestProps?.onAddSection();
        });
        const dialog = await screen.findByRole("dialog", { name: "Add a section" });
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

        expect(screen.queryByRole("dialog", { name: "Add a section" })).toBeNull();
        expect(hoisted.latestProps?.formState.fields_json).toHaveLength(before);
    });

    it("activating a schema demotes the previously active schema of the same document type", async () => {
        const current = { ...activeSchemaRecord(), id: "schema-old", name: "Old", status: "active" };
        const next = { ...activeSchemaRecord(), id: "schema-new", name: "New", status: "draft" };
        hoisted.fetchMock = vi.fn(async (path: string, _token: string, init?: RequestInit) => {
            if (path.endsWith("/schema-new/activate") && init?.method === "POST") {
                return jsonResponse({ ...next, status: "active" });
            }
            if (path.startsWith("/api/admin/extraction-schemas")) return jsonResponse([current, next]);
            if (path.startsWith("/api/admin/document-types")) return jsonResponse([]);
            if (path.startsWith("/api/admin/analytics/canonical-keys")) return jsonResponse({ keys: [] });
            return jsonResponse({});
        });
        await renderPage();

        await act(async () => {
            await hoisted.latestProps?.onActivate("schema-new");
        });

        const schemas = hoisted.latestProps?.schemas as Array<Record<string, any>>;
        expect(schemas.find((s) => s.id === "schema-new")?.status).toBe("active");
        expect(schemas.find((s) => s.id === "schema-old")?.status).toBe("draft");
        expect(writeCalls()).toHaveLength(1);
    });
});

describe("ExtractionSchemasPage guide timing and guarded writes", () => {
  beforeEach(() => {
    hoisted.latestProps = null;
    vi.clearAllMocks();
  });

  it("holds a guide request made while the schemas are loading, then asks about the open schema", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    hoisted.fetchMock = vi.fn(async (path: string, _token: string, _init?: RequestInit) => {
      await gate;
      if (path.startsWith("/api/admin/extraction-schemas")) return jsonResponse([activeSchemaRecord()]);
      if (path.startsWith("/api/admin/document-types")) return jsonResponse([]);
      if (path.startsWith("/api/admin/analytics/canonical-keys")) return jsonResponse({ keys: [] });
      return jsonResponse({});
    });
    render(<ExtractionSchemasPage />);

    const request: TourStartRequest = { moduleKey: "extraction-schemas", handled: false, proceed: vi.fn() };
    act(() => {
      window.dispatchEvent(new CustomEvent("admin-tour:request-start", { detail: request }));
    });
    expect(request.handled).toBe(true);
    expect(request.proceed).not.toHaveBeenCalled();

    await act(async () => {
      release();
    });

    expect(await screen.findByText("Start the tour with a blank draft?")).toBeTruthy();
    expect(request.proceed).not.toHaveBeenCalled();
  });

  it("blocks Archive while a guide runs, and sends no write", async () => {
    setupFetch([activeSchemaRecord()]);
    await renderPage();
    await waitFor(() => expect(hoisted.latestProps?.selectedSchemaId).toBe("schema-admission"));
    act(() => {
      window.dispatchEvent(new CustomEvent("admin-tour:start", { detail: { moduleKey: "extraction-schemas" } }));
    });

    await act(async () => {
      await hoisted.latestProps?.onArchive("schema-admission");
    });

    expect(toast.error).toHaveBeenCalledWith("Archiving is turned off during the guide. Finish or skip the guide first.");
    expect(writeCalls()).toHaveLength(0);
  });
});
