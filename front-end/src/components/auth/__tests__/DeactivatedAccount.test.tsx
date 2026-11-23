import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { fetchWithClerkAuth } from "@/lib/api";
import {
  ACCOUNT_DEACTIVATED_EVENT,
  ACCOUNT_DEACTIVATED_MESSAGE,
} from "@/lib/accountStatus";

const hoisted = vi.hoisted(() => ({
  signIn: null as null | { create: ReturnType<typeof vi.fn> },
  signOut: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useSignIn: () => ({ isLoaded: true, signIn: hoisted.signIn, setActive: vi.fn() }),
  useClerk: () => ({ signOut: hoisted.signOut }),
}));

vi.mock("@clerk/shared", () => ({
  isClerkAPIResponseError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "errors" in (error as object)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => vi.fn(),
}));

import LoginForm from "../LoginForm";
import DeactivatedAccountWatcher from "../DeactivatedAccountWatcher";

describe("fetchWithClerkAuth and deactivated accounts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("announces a deactivated account when the API answers 423", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 423 })));
    const listener = vi.fn();
    window.addEventListener(ACCOUNT_DEACTIVATED_EVENT, listener);

    const response = await fetchWithClerkAuth("/api/me", "token");

    expect(response.status).toBe(423);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(ACCOUNT_DEACTIVATED_EVENT, listener);
  });

  it("does not announce anything for ordinary responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    const listener = vi.fn();
    window.addEventListener(ACCOUNT_DEACTIVATED_EVENT, listener);

    await fetchWithClerkAuth("/api/me", "token");

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(ACCOUNT_DEACTIVATED_EVENT, listener);
  });
});

describe("DeactivatedAccountWatcher", () => {
  beforeEach(() => {
    hoisted.signOut = vi.fn().mockResolvedValue(undefined);
  });

  it("signs the user out and sends them to the login page with the notice", async () => {
    render(<DeactivatedAccountWatcher />);

    window.dispatchEvent(new Event(ACCOUNT_DEACTIVATED_EVENT));

    await waitFor(() => {
      expect(hoisted.signOut).toHaveBeenCalledWith({
        redirectUrl: "/auth/login?reason=deactivated",
      });
    });
  });

  it("signs out only once when several requests report the same deactivation", async () => {
    render(<DeactivatedAccountWatcher />);

    window.dispatchEvent(new Event(ACCOUNT_DEACTIVATED_EVENT));
    window.dispatchEvent(new Event(ACCOUNT_DEACTIVATED_EVENT));

    await waitFor(() => expect(hoisted.signOut).toHaveBeenCalled());
    expect(hoisted.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("LoginForm deactivation notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.signIn = null;
  });

  it("shows the notice when the user arrives with reason=deactivated", () => {
    render(
      <MemoryRouter initialEntries={["/auth/login?reason=deactivated"]}>
        <LoginForm />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(ACCOUNT_DEACTIVATED_MESSAGE);
  });

  it("shows no notice on a normal visit", () => {
    render(
      <MemoryRouter initialEntries={["/auth/login"]}>
        <LoginForm />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("replaces Clerk's wording with the notice when a locked account tries to sign in", async () => {
    hoisted.signIn = {
      create: vi.fn().mockRejectedValue({
        errors: [{ code: "user_locked", message: "locked", longMessage: "Clerk locked text" }],
      }),
    };
    render(
      <MemoryRouter initialEntries={["/auth/login"]}>
        <LoginForm />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "adviser@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(ACCOUNT_DEACTIVATED_MESSAGE, expect.anything());
    });
  });
});
