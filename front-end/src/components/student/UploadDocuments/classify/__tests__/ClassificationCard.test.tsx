import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ClassificationCard from "@/components/student/UploadDocuments/classify/ClassificationCard";
import type { ClassificationItem } from "@/types/classification";

vi.mock("@/lib/api", () => ({
  fetchWithClerkAuth: vi.fn(),
}));

const baseItem: ClassificationItem = {
  id: "sub-1",
  fileName: "admission-form-prev.pdf",
  fileSize: 1024,
  documentTypeName: "Admission Form",
  documentTypeId: "dt-1",
  confidence: 90,
  needsReview: false,
  isCompiledPdf: false,
  status: "classified",
  classificationResult: { type: "ADMISSION_FORM", confidence: 0.9 },
};

function renderCard(overrides: Partial<ClassificationItem> = {}, props: Record<string, unknown> = {}) {
  const item = { ...baseItem, ...overrides };
  return render(
    <ClassificationCard
      item={item}
      documentTypes={[]}
      onOverride={() => {}}
      onSplit={() => {}}
      onClassify={() => {}}
      onConfirm={() => {}}
      onDelete={() => {}}
      isClassifying={false}
      getToken={() => Promise.resolve("token")}
      {...props}
    />,
  );
}

describe("ClassificationCard verified-conflict state", () => {
  it("renders a read-only verified-conflict card and hides the Accept button", () => {
    renderCard({}, { hasVerifiedConflict: true });

    expect(
      screen.getByText(/has already been verified by your adviser/i),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Remove Document/i }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Accept$/i })).toBeNull();
    expect(screen.queryByText(/Select document type/i)).toBeNull();
  });

  it("renders the interactive card with Accept when there is no verified conflict", () => {
    renderCard({ needsReview: true, status: "needs-review" }, { hasVerifiedConflict: false });

    expect(screen.getByRole("button", { name: /^Accept$/i })).toBeDefined();
    expect(screen.queryByText(/has already been verified by your adviser/i)).toBeNull();
  });
});
