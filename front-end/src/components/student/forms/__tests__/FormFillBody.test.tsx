import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import FormFillBody from "@/components/student/forms/FormFillBody";
import type { StructuredFormDocument } from "@/types/form";

const doc: StructuredFormDocument = {
    version: 1,
    creation_mode: "structured",
    title: "Admission Form",
    signatureLabel: "Signature over Printed Name",
    sections: [
        {
            id: "s1",
            heading: "Student",
            fields: [],
            blocks: [
                {
                    type: "field",
                    id: "f1",
                    field_key: "full_name",
                    label: "Full Name",
                    ui_component: "text_input",
                    required: true,
                    options: null,
                },
                {
                    type: "field",
                    id: "f2",
                    field_key: "sex",
                    label: "Sex",
                    ui_component: "radio_group",
                    required: false,
                    options: [
                        { value: "m", label: "Male" },
                        { value: "f", label: "Female" },
                    ],
                },
                {
                    type: "field",
                    id: "f3",
                    field_key: "interests",
                    label: "Interests",
                    ui_component: "checkbox_group",
                    required: false,
                    options: [
                        { value: "sports", label: "Sports" },
                        { value: "arts", label: "Arts" },
                    ],
                },
            ],
        },
    ],
};

describe("FormFillBody", () => {
    it("renders a text input and group options", () => {
        render(<FormFillBody doc={doc} values={{}} onChange={() => {}} />);

        expect(screen.getByLabelText(/Full Name/)).toBeInTheDocument();
        expect(screen.getByLabelText("Male")).toBeInTheDocument();
        expect(screen.getByLabelText("Sports")).toBeInTheDocument();
    });

    it("calls onChange with the field key and typed value", () => {
        const onChange = vi.fn();
        render(<FormFillBody doc={doc} values={{}} onChange={onChange} />);

        fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: "Jane Doe" } });

        expect(onChange).toHaveBeenCalledWith("full_name", "Jane Doe");
    });

    it("toggles a checkbox value on and off", () => {
        const onChange = vi.fn();
        render(<FormFillBody doc={doc} values={{ interests: [] }} onChange={onChange} />);

        fireEvent.click(screen.getByLabelText("Sports"));
        expect(onChange).toHaveBeenLastCalledWith("interests", ["sports"]);
    });

    it("disables inputs in read-only mode", () => {
        render(<FormFillBody doc={doc} values={{}} onChange={() => {}} readOnly />);

        expect(screen.getByLabelText(/Full Name/)).toBeDisabled();
        expect(screen.getByLabelText("Male")).toBeDisabled();
    });
});
