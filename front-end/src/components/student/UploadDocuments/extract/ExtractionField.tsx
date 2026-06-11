"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtractedField } from "@/types/extraction";

interface ExtractionFieldProps {
  field: ExtractedField;
  cardNeedsReview: boolean;
  onFieldChange: (fieldId: string, value: string) => void;
}

export default function ExtractionField({
  field,
  cardNeedsReview,
  onFieldChange,
}: ExtractionFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
  };

  const isHighlighted = cardNeedsReview && field.needsReview;

  return (
    <div className="space-y-1.5 group">
      <label
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wider",
          isHighlighted ? "text-tertiary" : "text-slate-500",
        )}
      >
        {field.label}
      </label>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border p-2.5 transition-all focus-within:ring-1",
          isHighlighted
            ? "bg-red-50 border-red-200 group-hover:border-red-400 focus-within:border-red-400 focus-within:ring-red-300"
            : "bg-slate-50 border-transparent group-hover:border-primary/30 focus-within:border-primary/50 focus-within:ring-primary/20",
        )}
      >
        <input
          ref={inputRef}
          type="text"
          value={field.value}
          onChange={(e) => onFieldChange(field.id, e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full border-none bg-transparent p-0 text-sm outline-none",
            isHighlighted && "font-bold text-red-700",
          )}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className={cn(
            "flex-shrink-0 transition-colors",
            isHighlighted
              ? "text-red-500 hover:text-red-700"
              : "text-primary hover:text-primary/70 opacity-0 group-hover:opacity-100",
          )}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
