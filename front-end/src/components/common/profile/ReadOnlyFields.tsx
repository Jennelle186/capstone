"use client";

import { createElement } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReadOnlyField } from "./types";

interface ReadOnlyFieldsProps {
  fields: readonly ReadOnlyField[];
}

export default function ReadOnlyFields({ fields }: ReadOnlyFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map((field) => (
        <div key={field.id} className="space-y-2">
          <Label htmlFor={field.id}>{field.label}</Label>
          <div className="relative">
            {field.icon &&
              createElement(field.icon, {
                className:
                  "text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
              })}
            <Input
              id={field.id}
              className={field.icon ? "pl-10" : undefined}
              value={field.value ?? "—"}
              disabled
            />
          </div>
        </div>
      ))}
    </div>
  );
}
