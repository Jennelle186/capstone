import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ReadOnlyFields from "../ReadOnlyFields";

describe("ReadOnlyFields", () => {
  it("renders a badge per list item when list is provided", () => {
    render(
      <ReadOnlyFields
        fields={[{ id: "programs", label: "Academic Programs", value: null, list: ["BSIT", "BSCS"] }]}
      />,
    );

    expect(screen.getByText("BSIT")).toBeInTheDocument();
    expect(screen.getByText("BSCS")).toBeInTheDocument();
  });

  it("renders a disabled input when no list is provided", () => {
    render(
      <ReadOnlyFields
        fields={[{ id: "email", label: "Email Address", value: "x@y.com" }]}
      />,
    );

    const input = screen.getByDisplayValue("x@y.com");
    expect(input).toBeDisabled();
  });

  it("falls back to the input when list is empty", () => {
    render(
      <ReadOnlyFields
        fields={[{ id: "programs", label: "Academic Programs", value: "Fallback", list: [] }]}
      />,
    );

    expect(screen.getByDisplayValue("Fallback")).toBeInTheDocument();
    expect(screen.queryByText("Fallback", { selector: "span" })).toBeNull();
  });

  it("renders a placeholder dash when value is null and no list", () => {
    render(
      <ReadOnlyFields
        fields={[{ id: "programs", label: "Academic Programs", value: null }]}
      />,
    );

    expect(screen.getByDisplayValue("—")).toBeInTheDocument();
  });
});
