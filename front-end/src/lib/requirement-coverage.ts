import type { DocumentTypeItem, StudentClassification } from "@/types/documentType";
import type { SlotAssignment } from "@/types/requirement";

export const STUDENT_CLASSIFICATION_LABELS: Record<StudentClassification, string> = {
  freshman: "Freshman",
  transferee: "Transferee",
  shifter: "Shifter",
  returning: "Returning",
  cross_enrollee: "Cross-enrollee",
  second_courser: "Second courser",
};

/**
 * Classifications for which no requirement applies, so a student in that group would have nothing to upload.
 * Mirrors the backend rule: a slot applies when any of its document types applies to the classification,
 * and a document type with no classifications set applies to everyone. Nothing is reported when no slots exist.
 */
export function classificationsWithoutRequirement(
  slots: SlotAssignment[],
  documentTypes: DocumentTypeItem[],
): StudentClassification[] {
  if (slots.length === 0) return [];

  const allClassifications = Object.keys(STUDENT_CLASSIFICATION_LABELS) as StudentClassification[];
  return allClassifications.filter((classification) => {
    const covered = slots.some((slot) =>
      slot.items.some((item) => {
        const documentType = documentTypes.find((d) => d.id === item.document_type_id);
        // A type not in the list is treated as applying, so an unknown type never raises a false warning.
        if (!documentType) return true;
        const applicable = documentType.applicableClassifications;
        return applicable.length === 0 || applicable.includes(classification);
      }),
    );
    return !covered;
  });
}
