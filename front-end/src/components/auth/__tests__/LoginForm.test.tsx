import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const hoisted = vi.hoisted(() => ({
  signIn: null as null | { create: ReturnType<typeof vi.fn> },
  setActive: null as null | ReturnType<typeof vi.fn>,
  navigate: null as null | ReturnType<typeof vi.fn>,
}));

vi.mock("@clerk/clerk-react", () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: hoisted.signIn,
    setActive: hoisted.setActive,
  }),
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
  useNavigate: () => hoisted.navigate,
}));

import LoginForm from "../LoginForm";

function renderForm() {
  return render(
    <MemoryRouter>
      <LoginForm />
    </MemoryRouter>,
  );
}

function fillAndSubmit(password = "Password123!") {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.setActive = vi.fn().mockResolvedValue(undefined);
    hoisted.navigate = vi.fn();
  });

  it("signs in directly when Clerk completes the password step", async () => {
    hoisted.signIn = {
      create: vi.fn().mockResolvedValue({
        status: "needs_first_factor",
        attemptFirstFactor: vi.fn().mockResolvedValue({ status: "complete", createdSessionId: "sess_1" }),
      }),
    };
    renderForm();

    fillAndSubmit();

    await waitFor(() => expect(hoisted.setActive).toHaveBeenCalledWith({ session: "sess_1" }));
    expect(hoisted.navigate).toHaveBeenCalledWith("/post-auth");
    expect(toast.success).toHaveBeenCalledWith("Login successful!", expect.anything());
  });

  it("asks for the emailed code when Clerk requires a new-device check", async () => {
    const prepareSecondFactor = vi.fn().mockResolvedValue(undefined);
    hoisted.signIn = {
      create: vi.fn().mockResolvedValue({
        status: "needs_first_factor",
        attemptFirstFactor: vi.fn().mockResolvedValue({
          status: "needs_second_factor",
          supportedSecondFactors: [{ strategy: "email_code", emailAddressId: "idn_1" }],
          prepareSecondFactor,
          attemptSecondFactor: vi.fn(),
        }),
      }),
    };
    renderForm();

    fillAndSubmit();

    await waitFor(() =>
      expect(prepareSecondFactor).toHaveBeenCalledWith({ strategy: "email_code", emailAddressId: "idn_1" }),
    );
    expect(await screen.findByLabelText("Verification code")).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("6-digit code"), expect.anything());
    expect(hoisted.setActive).not.toHaveBeenCalled();
  });

  it("completes sign-in after the correct emailed code", async () => {
    const attemptSecondFactor = vi.fn().mockResolvedValue({ status: "complete", createdSessionId: "sess_2" });
    hoisted.signIn = {
      create: vi.fn().mockResolvedValue({
        status: "needs_first_factor",
        attemptFirstFactor: vi.fn().mockResolvedValue({
          status: "needs_second_factor",
          supportedSecondFactors: [{ strategy: "email_code", emailAddressId: "idn_1" }],
          prepareSecondFactor: vi.fn().mockResolvedValue(undefined),
          attemptSecondFactor,
        }),
      }),
    };
    renderForm();
    fillAndSubmit();

    const codeInput = await screen.findByLabelText("Verification code");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));

    await waitFor(() => expect(attemptSecondFactor).toHaveBeenCalledWith({ strategy: "email_code", code: "123456" }));
    await waitFor(() => expect(hoisted.setActive).toHaveBeenCalledWith({ session: "sess_2" }));
  });

  it("shows Clerk's message in the toast when the code is wrong", async () => {
    hoisted.signIn = {
      create: vi.fn().mockResolvedValue({
        status: "needs_first_factor",
        attemptFirstFactor: vi.fn().mockResolvedValue({
          status: "needs_second_factor",
          supportedSecondFactors: [{ strategy: "email_code", emailAddressId: "idn_1" }],
          prepareSecondFactor: vi.fn().mockResolvedValue(undefined),
          attemptSecondFactor: vi.fn().mockRejectedValue({ errors: [{ longMessage: "Incorrect code. Try again." }] }),
        }),
      }),
    };
    renderForm();
    fillAndSubmit();

    fireEvent.change(await screen.findByLabelText("Verification code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Incorrect code. Try again.", expect.anything()));
  });

  it("shows Clerk's message in the toast when the password is wrong", async () => {
    hoisted.signIn = {
      create: vi.fn().mockResolvedValue({
        status: "needs_first_factor",
        attemptFirstFactor: vi.fn().mockRejectedValue({ errors: [{ longMessage: "Password is incorrect." }] }),
      }),
    };
    renderForm();

    fillAndSubmit("wrong-password");

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Password is incorrect.", expect.anything()));
  });

  it("shows and hides the password when the eye button is clicked", () => {
    renderForm();
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password.type).toBe("password");
  });

  it("clears the password when the admin switches to a different account", async () => {
    hoisted.signIn = {
      create: vi.fn().mockResolvedValue({
        status: "needs_first_factor",
        attemptFirstFactor: vi.fn().mockResolvedValue({
          status: "needs_second_factor",
          supportedSecondFactors: [{ strategy: "email_code", emailAddressId: "idn_1" }],
          prepareSecondFactor: vi.fn().mockResolvedValue(undefined),
          attemptSecondFactor: vi.fn(),
        }),
      }),
    };
    renderForm();
    fillAndSubmit();

    fireEvent.click(await screen.findByRole("button", { name: "Use a different account" }));

    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Email") as HTMLInputElement).disabled).toBe(false);
  });

  it("explains that a verification step the form can't complete needs the administrator", async () => {
    hoisted.signIn = {
      create: vi.fn().mockResolvedValue({
        status: "needs_first_factor",
        attemptFirstFactor: vi.fn().mockResolvedValue({
          status: "needs_second_factor",
          supportedSecondFactors: [{ strategy: "totp" }],
        }),
      }),
    };
    renderForm();

    fillAndSubmit();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This account needs a verification step this form can't complete. Please contact the administrator.",
        expect.anything(),
      ),
    );
  });
});
