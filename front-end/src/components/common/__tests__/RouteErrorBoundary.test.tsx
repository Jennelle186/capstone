import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import RouteErrorBoundary from "@/components/common/RouteErrorBoundary";

function Broken(): never {
  throw new Error("Failed to execute 'removeChild' on 'Node'");
}

describe("RouteErrorBoundary", () => {
  it("replaces a crashed page with a plain message and a reload button", async () => {
    // React logs the caught error to the console; keep the test output quiet.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createMemoryRouter(
      [{ path: "/", Component: Broken, errorElement: <RouteErrorBoundary /> }],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText("Something went wrong on this page")).toBeDefined();
    expect(screen.getByRole("button", { name: /Reload page/ })).toBeDefined();
    // The technical reason is shown as a note, not as the main message.
    expect(screen.getByText(/removeChild/)).toBeDefined();
    expect(screen.queryByText("Unexpected Application Error!")).toBeNull();
    consoleError.mockRestore();
  });

  it("explains a missing page in plain words", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createMemoryRouter(
      [
        {
          path: "/",
          errorElement: <RouteErrorBoundary />,
          loader: () => {
            throw new Response("Not Found", { status: 404, statusText: "Not Found" });
          },
          Component: () => null,
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("This page does not exist")).toBeDefined();
    consoleError.mockRestore();
  });
});
