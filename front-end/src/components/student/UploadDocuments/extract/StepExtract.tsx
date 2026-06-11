"use client";

import * as React from "react";
import { Database } from "lucide-react";
import ExtractionCard from "@/components/student/UploadDocuments/extract/ExtractionCard";
import type { ExtractionItem } from "@/types/extraction";
const MOCK_ITEMS: ExtractionItem[] = [
  {
    id: "ext-1",
    fileName: "Undergraduate_Transcript.pdf",
    documentTypeName: "Academic Transcript",
    confidenceLabel: "high",
    needsReview: false,
    fields: [
      { id: "f-1-1", label: "Full Name", value: "Johnathon Quincy Doe", needsReview: false },
      { id: "f-1-2", label: "Institution", value: "State University of Tech", needsReview: false },
      { id: "f-1-3", label: "GPA / Score", value: "3.92", needsReview: false },
    ],
  },
  {
    id: "ext-2",
    fileName: "Identity_Proof_Scan.jpg",
    documentTypeName: "Government ID",
    confidenceLabel: "low",
    needsReview: true,
    fields: [
      { id: "f-2-1", label: "Document Number", value: "A-99XX-1123", needsReview: true },
      { id: "f-2-2", label: "Date of Birth", value: "May 14, 2001", needsReview: false },
      { id: "f-2-3", label: "Expiry Date", value: "Jan 20, 2029", needsReview: false },
    ],
  },
  {
    id: "ext-3",
    fileName: "Letter_of_Recommendation.pdf",
    documentTypeName: "Recommendation Letter",
    confidenceLabel: "medium",
    needsReview: false,
    fields: [
      { id: "f-3-1", label: "Referee Name", value: "Dr. Sarah Miller", needsReview: false },
      { id: "f-3-2", label: "Relationship", value: "Senior Professor", needsReview: false },
    ],
  },
];

interface StepExtractProps {
  onExtractionChange?: (complete: boolean) => void;
}

export default function StepExtract({ onExtractionChange }: StepExtractProps) {
  const [items, setItems] = React.useState<ExtractionItem[]>(MOCK_ITEMS);

  React.useEffect(() => {
    const complete = items.length > 0 && items.every((i) => !i.needsReview);
    onExtractionChange?.(complete);
  }, [items, onExtractionChange]);

  const handleFieldChange = React.useCallback(
    (itemId: string, fieldId: string, value: string) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            fields: item.fields.map((f) =>
              f.id === fieldId ? { ...f, value } : f,
            ),
          };
        }),
      );
    },
    [],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Review Extracted Data
        </h2>
        <p className="mt-1 max-w-2xl text-base text-slate-500">
          Our AI has extracted information from your uploaded documents. Please verify the accuracy of the fields below before continuing.
        </p>
      </div>

      {/* Extraction Cards */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <Database className="h-12 w-12" />
          <p className="text-sm font-medium">No extracted data available.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {items.map((item) => (
            <ExtractionCard
              key={item.id}
              item={item}
              onFieldChange={handleFieldChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
