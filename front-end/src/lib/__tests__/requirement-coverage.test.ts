import { describe, expect, it } from "vitest";
import type { DocumentTypeItem } from "@/types/documentType";
import type { SlotAssignment } from "@/types/requirement";
import { classificationsWithoutRequirement } from "@/lib/requirement-coverage";

function docType(id: string, applicableClassifications: DocumentTypeItem["applicableClassifications"]): DocumentTypeItem {
  return { id, name: id, applicableClassifications } as unknown as DocumentTypeItem;
}

function slot(...documentTypeIds: string[]): SlotAssignment {
  return {
    slot_type: "solo",
    display_order: 0,
    items: documentTypeIds.map((document_type_id) => ({ document_type_id })),
  } as SlotAssignment;
}

describe("classificationsWithoutRequirement", () => {
  it("reports nothing when no slots are configured", () => {
    expect(classificationsWithoutRequirement([], [docType("dt-1", [])])).toEqual([]);
  });

  it("reports nothing when an unrestricted document type is required", () => {
    expect(classificationsWithoutRequirement([slot("dt-1")], [docType("dt-1", [])])).toEqual([]);
  });

  it("reports the classifications that no required document applies to", () => {
    const documentTypes = [docType("dt-1", ["freshman", "transferee"])];

    const uncovered = classificationsWithoutRequirement([slot("dt-1")], documentTypes);

    expect(uncovered).toContain("shifter");
    expect(uncovered).toContain("returning");
    expect(uncovered).not.toContain("freshman");
    expect(uncovered).not.toContain("transferee");
  });

  it("counts a group as covering a classification when any of its alternatives applies", () => {
    const documentTypes = [docType("dt-1", ["freshman"]), docType("dt-2", ["transferee"])];

    const uncovered = classificationsWithoutRequirement([slot("dt-1", "dt-2")], documentTypes);

    expect(uncovered).not.toContain("freshman");
    expect(uncovered).not.toContain("transferee");
    expect(uncovered).toContain("shifter");
  });

  it("does not warn about a document type it cannot find", () => {
    expect(classificationsWithoutRequirement([slot("unknown")], [])).toEqual([]);
  });
});
