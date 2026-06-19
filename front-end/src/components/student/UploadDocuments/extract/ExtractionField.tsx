"use client";

import { useState, useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { Pencil, Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
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

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence > 0.9) return null;

  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
      <AlertTriangle className="h-2.5 w-2.5" />
      {Math.round(confidence * 100)}%
    </span>
  );
}

function StaticValue({
  field,
  value,
  onEdit,
}: {
  field: ExtractedField;
  value: string;
  onEdit: () => void;
}) {
  const isEmpty = value === "";
  const isMissing = isEmpty && field.required;
  const lowConfidence = field.confidence <= 0.9;

  let displayValue: string;
  if (isEmpty) {
    displayValue = isMissing ? "" : "—";
  } else if (field.ui_component === "radio_group" || field.ui_component === "dropdown") {
    const opt = (field.options ?? []).find((o) => o.value === value);
    displayValue = opt?.label ?? value;
  } else if (field.ui_component === "checkbox_group") {
    displayValue = value
      .split(",")
      .filter(Boolean)
      .map((v) => (field.options ?? []).find((o) => o.value === v)?.label ?? v)
      .join(", ");
  } else {
    displayValue = value;
  }

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors",
        isMissing && "border-red-300 bg-red-50",
        !isMissing && lowConfidence && "border-amber-300 bg-amber-50",
        !isMissing && !lowConfidence && "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <div className="flex-1 min-w-0">
        {isMissing ? (
          <span className="text-sm font-semibold text-red-600">[Missing]</span>
        ) : (
          <span className="block truncate text-sm font-semibold text-slate-900">
            {displayValue}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="flex-shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
        title="Edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function ExtractionField({ field, onAutoSave }: ExtractionFieldProps) {
  const form = useFormContext();
  const [editing, setEditing] = useState(false);

  const handleStartEdit = useCallback(() => {
    setEditing(true);
  }, []);

  const handleSave = useCallback(() => {
    const val = form.getValues(field.key) ?? "";
    onAutoSave(field.id, val);
    setEditing(false);
  }, [field.id, field.key, form, onAutoSave]);

  const handleCancel = useCallback(() => {
    form.setValue(field.key, field.value, { shouldValidate: false });
    setEditing(false);
  }, [field.key, field.value, form]);

  return (
    <FormField
      control={form.control}
      name={field.key}
      render={({ field: formField }) => (
        <FormItem>
          <FormLabel>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">
                {field.label || field.key}
              </span>
              {!editing && <ConfidenceBadge confidence={field.confidence} />}
            </div>
          </FormLabel>

          {editing ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <FormControl>
                <FormFieldControl
                  field={field}
                  value={formField.value ?? ""}
                  onChange={formField.onChange}
                  onBlur={() => {}}
                />
              </FormControl>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Check className="h-3 w-3" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <StaticValue field={field} value={formField.value ?? ""} onEdit={handleStartEdit} />
          )}

          <FormMessage />
        </FormItem>
      )}
    />
  );
}
