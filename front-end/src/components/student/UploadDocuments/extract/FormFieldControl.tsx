"use client";

// Lightweight local Checkbox fallback to avoid unresolved import during build
const Checkbox = ({
  id,
  checked,
  onCheckedChange,
}: {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
}) => (
  <input
    id={id}
    type="checkbox"
    checked={!!checked}
    onChange={(e) => onCheckedChange?.(e.target.checked)}
    className="w-4 h-4"
  />
);
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React, { createContext, useContext } from "react";

// Lightweight local RadioGroup fallback to avoid unresolved import during build
type RadioGroupContextType = {
  value?: string;
  onValueChange?: (v: string) => void;
};
const RadioGroupContext = createContext<RadioGroupContextType>({});

const RadioGroup = ({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
}) => (
  <RadioGroupContext.Provider value={{ value, onValueChange }}>
    <div>{children}</div>
  </RadioGroupContext.Provider>
);

const RadioGroupItem = ({
  value,
  id,
}: {
  value: string;
  id?: string;
}) => {
  const ctx = useContext(RadioGroupContext);
  const checked = ctx.value === value;
  return (
    <input
      id={id}
      type="radio"
      checked={checked}
      onChange={() => ctx.onValueChange?.(value)}
      className="w-4 h-4"
    />
  );
};
import { Label } from "@/components/ui/label";
import type { ExtractedField } from "@/types/extraction";

interface FormFieldControlProps {
  field: ExtractedField;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

export function FormFieldControl({ field, value, onChange, onBlur }: FormFieldControlProps) {
  switch (field.ui_component) {
    case "radio_group":
      return (
        <RadioGroup
          value={value}
          onValueChange={(v) => {
            onChange(v);
            onBlur();
          }}
        >
          {(field.options ?? []).map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <RadioGroupItem value={opt.value} id={`${field.key}_${opt.value}`} />
              <Label htmlFor={`${field.key}_${opt.value}`} className="text-sm font-normal">
                {opt.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );

    case "checkbox_group": {
      const selected = value ? value.split(",").filter(Boolean) : [];
      return (
        <div className="flex flex-col gap-2">
          {(field.options ?? []).map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <div key={opt.value} className="flex items-center gap-2">
                <Checkbox
                  id={`${field.key}_${opt.value}`}
                  checked={checked}
                  onCheckedChange={() => {
                    const next = checked
                      ? selected.filter((v) => v !== opt.value)
                      : [...selected, opt.value];
                    onChange(next.join(","));
                    onBlur();
                  }}
                />
                <Label htmlFor={`${field.key}_${opt.value}`} className="text-sm font-normal">
                  {opt.label}
                </Label>
              </div>
            );
          })}
        </div>
      );
    }

    case "dropdown":
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger onBlur={onBlur}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "date_picker":
      return (
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );

    default:
      return (
        <Input
          type={field.type === "number" || field.type === "integer" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
  }
}
