import type {
    ExtractionSchemaField,
    ExtractionSchemaFieldType,
    ExtractionSchemaPayload,
    ExtractionSchemaRecord,
    ExtractionSchemaStatus,
} from "@/types/extractionSchema";

export const FIELD_TYPES: ExtractionSchemaFieldType[] = ["string", "number", "integer", "boolean", "select", "multi-select"];

export function createField(): ExtractionSchemaField {
    const id = crypto.randomUUID();
    return {
        id,
        key: "",
        type: "string",
        description: "",
        required: false,
    };
}

export function createEmptyPayload(): ExtractionSchemaPayload {
    return {
        name: "Default Schema",
        version_label: "",
        effective_date: "",
        description: "",
        schema_json: {
            type: "object",
            properties: {},
        },
        fields_json: [createField()],
        document_type_id: null,
        status: "draft",
        source_file_name: null,
        generation_prompt: "",
    };
}

export function normalizeFieldKey(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.]/g, "");
}

export interface SectionGroup {
    sectionId: string | null;
    sectionTitle: string | null;
    fields: ExtractionSchemaField[];
}

export function groupBySection(fields: ExtractionSchemaField[]): SectionGroup[] {
    const grouped: Record<string, SectionGroup> = {};
    for (const field of fields) {
        const sid = field.section_id ?? "__nosection__";
        if (!grouped[sid]) {
            grouped[sid] = {
                sectionId: field.section_id ?? null,
                sectionTitle: field.section_title ?? null,
                fields: [],
            };
        }
        grouped[sid].fields.push(field);
    }
    const order = ["__nosection__", ...Object.keys(grouped).filter((k) => k !== "__nosection__")];
    return order.filter((k) => grouped[k]).map((k) => grouped[k]);
}

export function hasSchemaProperties(schema: Record<string, unknown>): boolean {
    const properties = getSchemaProperties(schema);
    return properties !== null && Object.keys(properties).length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function cloneSchema(schema: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
}

export function getSchemaProperties(schema: Record<string, unknown>): Record<string, unknown> | null {
    return isRecord(schema.properties) ? schema.properties : null;
}

export function getRequiredSet(schema: Record<string, unknown>): Set<string> {
    return new Set(Array.isArray(schema.required) ? schema.required.filter((item) => typeof item === "string") : []);
}

export function setSchemaRequired(schema: Record<string, unknown>, key: string, required: boolean) {
    const requiredSet = getRequiredSet(schema);
    if (required) {
        requiredSet.add(key);
    } else {
        requiredSet.delete(key);
    }

    const requiredValues = Array.from(requiredSet);
    if (requiredValues.length > 0) {
        schema.required = requiredValues;
    } else {
        delete schema.required;
    }
}

export function resolveFieldType(schema: Record<string, unknown>): ExtractionSchemaFieldType {
    return FIELD_TYPES.includes(schema.type as ExtractionSchemaFieldType)
        ? (schema.type as ExtractionSchemaFieldType)
        : "string";
}

export function flattenSchemaToFields(schema: Record<string, unknown>, parentPath = ""): ExtractionSchemaField[] {
    const properties = getSchemaProperties(schema);
    if (!properties) return [];

    const requiredSet = getRequiredSet(schema);
    return Object.entries(properties).flatMap(([key, value]) => {
        if (!isRecord(value)) return [];

        const fieldPath = parentPath ? `${parentPath}.${key}` : key;
        const childProperties = getSchemaProperties(value);
        if (value.type === "object" && childProperties) {
            return flattenSchemaToFields(value, fieldPath);
        }

        return [
            {
                id: fieldPath,
                key: fieldPath,
                type: resolveFieldType(value),
                description: typeof value.description === "string" ? value.description : "",
                required: requiredSet.has(key),
            },
        ];
    });
}

export function getSchemaFields(
    schema: Record<string, unknown>,
    fallback: ExtractionSchemaField[],
): ExtractionSchemaField[] {
    if (fallback.some((f) => f.ui_component || f.options || f.section_id)) {
        return fallback;
    }
    const fields = flattenSchemaToFields(schema);
    return fields.length > 0 ? fields : fallback.length > 0 ? fallback : [createField()];
}

export function getParentSchema(
    schema: Record<string, unknown>,
    parentPathParts: string[],
): Record<string, unknown> | null {
    let current: Record<string, unknown> = schema;

    for (const pathPart of parentPathParts) {
        const properties = getSchemaProperties(current);
        if (!properties || !isRecord(properties[pathPart])) return null;
        current = properties[pathPart];
    }

    return current;
}

export function ensureParentSchema(
    schema: Record<string, unknown>,
    parentPathParts: string[],
): Record<string, unknown> {
    let current: Record<string, unknown> = schema;
    current.type = "object";
    if (!isRecord(current.properties)) current.properties = {};

    for (const pathPart of parentPathParts) {
        const properties = current.properties as Record<string, unknown>;
        if (!isRecord(properties[pathPart])) {
            properties[pathPart] = {
                type: "object",
                properties: {},
                additionalProperties: false,
            };
        }

        const next = properties[pathPart] as Record<string, unknown>;
        next.type = "object";
        if (!isRecord(next.properties)) next.properties = {};
        current = next;
    }

    return current;
}

export function removeSchemaNode(schema: Record<string, unknown>, path: string): Record<string, unknown> | null {
    const pathParts = path.split(".").filter(Boolean);
    if (pathParts.length === 0) return null;

    const leafKey = pathParts[pathParts.length - 1];
    const parent = getParentSchema(schema, pathParts.slice(0, -1));
    const parentProperties = parent ? getSchemaProperties(parent) : null;
    if (!parent || !parentProperties || !isRecord(parentProperties[leafKey])) return null;

    const removedNode = parentProperties[leafKey];
    delete parentProperties[leafKey];
    setSchemaRequired(parent, leafKey, false);
    return removedNode;
}

export function putSchemaNode(
    schema: Record<string, unknown>,
    path: string,
    node: Record<string, unknown>,
    required: boolean,
) {
    const pathParts = path.split(".").filter(Boolean);
    if (pathParts.length === 0) return;

    const leafKey = pathParts[pathParts.length - 1];
    const parent = ensureParentSchema(schema, pathParts.slice(0, -1));
    const parentProperties = getSchemaProperties(parent) ?? {};
    parent.properties = parentProperties;
    parentProperties[leafKey] = node;
    setSchemaRequired(parent, leafKey, required);
}

export function patchSchemaField(
    schema: Record<string, unknown>,
    previousField: ExtractionSchemaField,
    nextField: ExtractionSchemaField,
): Record<string, unknown> {
    const oldPath = normalizeFieldKey(previousField.key);
    const nextPath = normalizeFieldKey(nextField.key);
    if (!oldPath && !nextPath) return schema;

    const nextSchema = cloneSchema(schema);
    const existingNode = oldPath ? removeSchemaNode(nextSchema, oldPath) : null;
    const node = existingNode ?? {};

    node.type = nextField.type;
    node.description = nextField.description.trim();

    if (nextPath) {
        putSchemaNode(nextSchema, nextPath, node, nextField.required);
    }

    return nextSchema;
}

export function removeSchemaField(schema: Record<string, unknown>, field: ExtractionSchemaField): Record<string, unknown> {
    const fieldPath = normalizeFieldKey(field.key);
    if (!fieldPath) return schema;

    const nextSchema = cloneSchema(schema);
    removeSchemaNode(nextSchema, fieldPath);
    return nextSchema;
}

export function buildJsonSchema(fields: ExtractionSchemaField[]): Record<string, unknown> {
    const schema: Record<string, unknown> = {
        type: "object",
        properties: {},
        additionalProperties: false,
    };

    fields.forEach((field) => {
        const key = normalizeFieldKey(field.key);
        if (!key) return;

        putSchemaNode(
            schema,
            key,
            {
                type: field.type,
                description: field.description.trim(),
            },
            field.required,
        );
    });

    return schema;
}

export function getPreviewSchema(form: ExtractionSchemaPayload): Record<string, unknown> {
    return hasSchemaProperties(form.schema_json) ? form.schema_json : buildJsonSchema(form.fields_json);
}

export function preparePayload(form: ExtractionSchemaPayload): ExtractionSchemaPayload {
    const fields = form.fields_json
        .map((field) => ({
            ...field,
            key: normalizeFieldKey(field.key),
            description: field.description.trim(),
        }))
        .filter((field) => field.key);

    return {
        ...form,
        name: form.name.trim(),
        version_label: form.version_label?.trim() || null,
        effective_date: form.effective_date || null,
        description: form.description?.trim() || null,
        source_file_name: form.source_file_name?.trim() || null,
        generation_prompt: form.generation_prompt?.trim() || null,
        fields_json: fields,
        schema_json: typeof form.schema_json?.type === "string" && form.schema_json.type !== "object"
            ? form.schema_json
            : hasSchemaProperties(form.schema_json)
                ? form.schema_json
                : buildJsonSchema(fields),
    };
}

export function statusLabel(status: ExtractionSchemaStatus): string {
    if (status === "active") return "Active";
    if (status === "archived") return "Archived";
    return "Draft";
}

export function formatSchemaMeta(schema: Pick<ExtractionSchemaRecord, "version_label" | "effective_date">): string {
    const parts = [
        schema.version_label ? `Version: ${schema.version_label}` : null,
        schema.effective_date ? `Effective: ${schema.effective_date}` : null,
    ].filter(Boolean);
    return parts.join(" - ");
}

export function formatSchemaOption(schema: ExtractionSchemaRecord): string {
    const meta = formatSchemaMeta(schema);
    return meta ? `${schema.name} (${meta})` : schema.name;
}

export function computeFieldValue(
    field: ExtractionSchemaField,
    allExtractedData: Record<string, unknown>,
): string | null {
    if (!field.is_computed || !field.computation) return null;

    const { operation, dependencies } = field.computation;
    const values: number[] = [];

    for (const depId of dependencies) {
        const depData = allExtractedData[depId];
        if (!depData || typeof depData !== "object") continue;
        const val = (depData as Record<string, unknown>).value;
        if (val === null || val === undefined || val === "") continue;
        const num = parseFloat(String(val));
        if (!isNaN(num)) values.push(num);
    }

    if (values.length === 0) return null;

    let result: number;
    switch (operation) {
        case "average":
            result = values.reduce((a, b) => a + b, 0) / values.length;
            break;
        case "sum":
            result = values.reduce((a, b) => a + b, 0);
            break;
        case "max":
            result = Math.max(...values);
            break;
        case "min":
            result = Math.min(...values);
            break;
        default:
            return null;
    }

    return result.toFixed(2);
}
