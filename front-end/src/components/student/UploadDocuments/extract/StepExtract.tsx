"use client";

import * as React from "react";
import { Database, FileSearch, Loader2 } from "lucide-react";
import { fetchWithClerkAuth } from "@/lib/api";
import ExtractionCard from "@/components/student/UploadDocuments/extract/ExtractionCard";
import { toExtractionItem } from "@/types/extraction";
import type { ExtractionItem, ExtractionItemResponse } from "@/types/extraction";

interface StepExtractProps {
  onExtractionChange?: (complete: boolean) => void;
  getToken: () => Promise<string | null>;
  isExtractingAll?: boolean;
  extractAllError?: string | null;
  onExtractionReady?: () => void;
}

export default function StepExtract({
  onExtractionChange,
  getToken,
  isExtractingAll = false,
  extractAllError = null,
  onExtractionReady,
}: StepExtractProps) {
  const [items, setItems] = React.useState<ExtractionItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchExtractions = React.useCallback(async () => {
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    const res = await fetchWithClerkAuth("/api/me/documents/extractions", token);
    if (res.ok) {
      const data = (await res.json()) as ExtractionItemResponse[];
      console.log("Extractions response:", JSON.stringify(data, null, 2));
      data.forEach((d) => {
        console.log(`Raw OCR text for ${d.file_name}:`, d.ocr_text);
        console.log(`Raw KIE pairs for ${d.file_name}:`, d.raw_kie);
      });
      setItems(data.map(toExtractionItem));
    }
    setLoading(false);
  }, [getToken]);

  React.useEffect(() => {
    void fetchExtractions();
  }, [fetchExtractions]);

  React.useEffect(() => {
    if (isExtractingAll) return;
    if (!loading) {
      const complete = items.length > 0 && items.every((i) => !i.needsReview);
      onExtractionChange?.(complete);
    }
  }, [items, loading, isExtractingAll, onExtractionChange]);

  React.useEffect(() => {
    if (!isExtractingAll) return;
    const interval = setInterval(() => {
      void fetchExtractions();
    }, 2000);
    return () => clearInterval(interval);
  }, [isExtractingAll, fetchExtractions]);

  React.useEffect(() => {
    if (isExtractingAll && items.length > 0) {
      onExtractionReady?.();
    }
  }, [isExtractingAll, items, onExtractionReady]);

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

      {/* Extracting Banner */}
      {isExtractingAll && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
          <Loader2 className="h-5 w-5 animate-spin flex-shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold">Extracting data from your documents…</p>
            <p className="text-xs text-blue-700 mt-0.5">
              This may take a moment for each file.
            </p>
          </div>
        </div>
      )}

      {/* Extraction Error Banner */}
      {extractAllError && !isExtractingAll && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <FileSearch className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold">Some documents could not be extracted</p>
            <p className="text-xs text-red-700 mt-0.5">{extractAllError}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !isExtractingAll && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <Loader2 className="h-12 w-12 animate-spin" />
          <p className="text-sm font-medium">Loading extraction data…</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && items.length === 0 && !isExtractingAll && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <Database className="h-12 w-12" />
          <p className="text-sm font-medium">No extracted data available.</p>
          <p className="text-xs text-slate-500">
            Classify your documents first, then extraction can begin.
          </p>
        </div>
      )}

      {/* Extraction Cards */}
      {items.length > 0 && (
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
