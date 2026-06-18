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
}

export type ExtractionConfidence = "high" | "medium" | "low" | "needs-review";

export interface ExtractionItem {
  id: string;
  fileName: string;
  documentTypeName: string;
  documentTypeCode: string | null;
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
    confidenceLabel,
    needsReview: hasReview,
    fields,
    ocrText: resp.ocr_text,
  };
}
