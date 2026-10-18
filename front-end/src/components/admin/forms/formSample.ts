import { createField, createSection } from "@/lib/formLayout";
import type { StructuredFormDocument } from "@/types/formLayout";

export function createSampleForm(): StructuredFormDocument {
    return {
        version: 1,
        creation_mode: "structured",
        title: "Student Admission Form",
        subtitle: "School Year 2026 – 2027",
        instructions:
            "Please print legibly in black ink and accomplish all applicable fields. Submit this form to the Office of the Registrar together with the required supporting documents.",
        sections: [
            {
                ...createSection("Personal Information"),
                fields: [
                    createField({ label: "Last Name", required: true }),
                    createField({ label: "First Name", required: true }),
                    createField({ label: "Middle Name" }),
                    createField({
                        label: "Sex",
                        ui_component: "radio_group",
                        required: true,
                        options: [
                            { value: "male", label: "Male" },
                            { value: "female", label: "Female" },
                        ],
                    }),
                    createField({ label: "Date of Birth", ui_component: "date_picker", required: true }),
                    createField({ label: "Place of Birth" }),
                    createField({
                        label: "Civil Status",
                        ui_component: "dropdown",
                        options: [
                            { value: "single", label: "Single" },
                            { value: "married", label: "Married" },
                            { value: "widowed", label: "Widowed" },
                            { value: "separated", label: "Separated" },
                        ],
                    }),
                    createField({ label: "Nationality" }),
                    createField({ label: "Religion" }),
                    createField({ label: "Contact Number", required: true }),
                    createField({ label: "Email Address" }),
                    createField({ label: "Complete Home Address" }),
                ],
            },
            {
                ...createSection("Family Background"),
                fields: [
                    createField({ label: "Father's Full Name" }),
                    createField({ label: "Father's Occupation" }),
                    createField({ label: "Mother's Maiden Name" }),
                    createField({ label: "Mother's Occupation" }),
                    createField({ label: "Guardian's Full Name" }),
                    createField({ label: "Guardian's Contact Number" }),
                ],
            },
            {
                ...createSection("Educational Background"),
                fields: [
                    createField({ label: "Last School Attended" }),
                    createField({ label: "School Address" }),
                    createField({ label: "Year Graduated" }),
                    createField({ label: "General Average" }),
                    createField({
                        label: "Senior High Strand / Track",
                        ui_component: "dropdown",
                        options: [
                            { value: "stem", label: "STEM" },
                            { value: "abm", label: "ABM" },
                            { value: "humss", label: "HUMSS" },
                            { value: "gas", label: "GAS" },
                            { value: "tvl", label: "TVL" },
                            { value: "other", label: "Other" },
                        ],
                    }),
                ],
            },
            {
                ...createSection("Other Information"),
                fields: [
                    createField({
                        label: "Person with Disability",
                        ui_component: "radio_group",
                        options: [
                            { value: "yes", label: "Yes" },
                            { value: "no", label: "No" },
                        ],
                    }),
                    createField({
                        label: "4Ps Beneficiary",
                        ui_component: "radio_group",
                        options: [
                            { value: "yes", label: "Yes" },
                            { value: "no", label: "No" },
                        ],
                    }),
                    createField({ label: "Emergency Contact Person" }),
                    createField({ label: "Emergency Contact Number" }),
                ],
            },
        ],
        signatureLabel: "Applicant's Signature over Printed Name",
        footer: "CCS Form No. ADS-01 · Revised January 2026",
    };
}
