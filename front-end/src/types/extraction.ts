export interface ExtractionFieldOption {
  value: string;
  label: string;
}

export interface ExtractionFieldResponse {
  id: string;
  key: string;
  type: string;
  description: string;
  required: boolean;
  value: string;
  source_key: string | null;
  confidence: number;
  needs_review: boolean;
  ui_component: string | null;
  options: ExtractionFieldOption[] | null;
  section_id: string | null;
  section_title: string | null;
  hierarchy_level: number;
  parent_field_id: string | null;
}

export interface ExtractionItemResponse {
  submission_id: string;
  file_name: string;
  document_type_name: string | null;
  document_type_code: string | null;
  status: string;
  fields: ExtractionFieldResponse[];
  ocr_text: string;
  raw_kie: Record<string, string>;
}

export interface ExtractedField {
  id: string;
  label: string;
  value: string;
  needsReview: boolean;
  key: string;
  type: string;
  confidence: number;
  required: boolean;
  ui_component: string | null;
  options: ExtractionFieldOption[] | null;
  section_id: string | null;
  section_title: string | null;
  hierarchy_level: number;
  parent_field_id: string | null;
}

export type ExtractionConfidence = "high" | "medium" | "low" | "needs-review";

export interface ExtractionItem {
  id: string;
  fileName: string;
  documentTypeName: string;
  documentTypeCode: string | null;
  status: string;
  confidenceLabel: ExtractionConfidence;
  needsReview: boolean;
  fields: ExtractedField[];
  ocrText: string;
}

export function toExtractionItem(resp: ExtractionItemResponse): ExtractionItem {
  const fields: ExtractedField[] = resp.fields.map((f) => ({
    id: f.id,
    label: f.description || f.key,
    value: f.value,
    needsReview: f.needs_review,
    key: f.key,
    type: f.type,
    confidence: f.confidence,
    required: f.required,
    ui_component: f.ui_component,
    options: f.options,
    section_id: f.section_id,
    section_title: f.section_title,
    hierarchy_level: f.hierarchy_level,
    parent_field_id: f.parent_field_id,
  }));

  const hasReview = fields.some((f) => f.needsReview);
  const avgConfidence =
    fields.length > 0
      ? fields.reduce((s, f) => s + f.confidence, 0) / fields.length
      : 0;

  let confidenceLabel: ExtractionConfidence;
  if (hasReview) {
    confidenceLabel = "needs-review";
  } else if (avgConfidence >= 0.7) {
    confidenceLabel = "high";
  } else if (avgConfidence >= 0.4) {
    confidenceLabel = "medium";
  } else {
    confidenceLabel = "low";
  }

  return {
    id: resp.submission_id,
    fileName: resp.file_name,
    documentTypeName: resp.document_type_name ?? "",
    documentTypeCode: resp.document_type_code,
    status: resp.status,
    confidenceLabel,
    needsReview: hasReview,
    fields,
    ocrText: resp.ocr_text,
  };
}
