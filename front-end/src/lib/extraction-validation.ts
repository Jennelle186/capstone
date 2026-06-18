import { z } from "zod";
import type { ExtractedField } from "@/types/extraction";

export function buildZodSchema(fields: ExtractedField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let zodType: z.ZodTypeAny;

    switch (field.type) {
      case "number":
        zodType = z.coerce.number();
        if (field.required) {
          zodType = (zodType as z.ZodNumber).refine((v) => v !== undefined && v !== null && !isNaN(v), {
            message: "This field is required",
          });
        }
        break;
      case "integer":
        zodType = z.coerce.number().int();
        if (field.required) {
          zodType = (zodType as z.ZodNumber).refine((v) => v !== undefined && v !== null && !isNaN(v), {
            message: "This field is required",
          });
        }
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      default: {
        zodType = z.string();
        if (field.ui_component === "date_picker") {
          zodType = (zodType as z.ZodString).regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");
        }
        if (field.key.toLowerCase().includes("email")) {
          zodType = (zodType as z.ZodString).email("Invalid email");
        }
        if (field.required) {
          zodType = (zodType as z.ZodString).min(1, "This field is required");
        }
        break;
      }
    }

    shape[field.key] = zodType;
  }

  return z.object(shape);
}

export function buildDefaultValues(fields: ExtractedField[]): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const field of fields) {
    defaults[field.key] = field.value ?? "";
  }
  return defaults;
}
