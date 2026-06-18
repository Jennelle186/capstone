"use client";

import { useFormContext } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { FormFieldControl } from "@/components/student/UploadDocuments/extract/FormFieldControl";
import type { ExtractedField } from "@/types/extraction";

interface ExtractionFieldProps {
  field: ExtractedField;
  onAutoSave: (fieldKey: string, value: string) => void;
}

export default function ExtractionField({ field, onAutoSave }: ExtractionFieldProps) {
  const form = useFormContext();

  return (
    <FormField
      control={form.control}
      name={field.key}
      render={({ field: formField }) => (
        <FormItem>
          <FormLabel>
            {field.label || field.key}
            {field.required && (
              <span className="ml-1 text-destructive" aria-label="required">*</span>
            )}
          </FormLabel>
          <FormControl>
            <FormFieldControl
              field={field}
              value={formField.value ?? ""}
              onChange={formField.onChange}
              onBlur={() => {
                formField.onBlur();
                onAutoSave(field.key, formField.value ?? "");
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
