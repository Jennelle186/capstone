"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [items, setItems] = useState<ExtractionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const fetchExtractions = useCallback(async () => {
    const token = await getTokenRef.current();
    if (!token) { setLoading(false); return; }
    const res = await fetchWithClerkAuth("/api/me/documents/extractions", token);
    if (res.ok) {
      const data = (await res.json()) as ExtractionItemResponse[];
      setItems(data.map(toExtractionItem));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let canceled = false;
    const timeout = setTimeout(() => {
      if (!canceled) {
        fetchExtractions();
      }
    }, 0);

    return () => {
      canceled = true;
      clearTimeout(timeout);
    };
  }, [fetchExtractions]);

  const prevExtracting = useRef(isExtractingAll);
  useEffect(() => {
    const wasExtracting = prevExtracting.current;
    prevExtracting.current = isExtractingAll;

    if (wasExtracting && !isExtractingAll) {
      const timeout = setTimeout(() => {
        fetchExtractions();
      }, 0);

      return () => clearTimeout(timeout);
    }
  }, [isExtractingAll, fetchExtractions]);

  useEffect(() => {
    if (isExtractingAll || loading) return;
    if (items.length === 0) {
      onExtractionChange?.(true);
      return;
    }
    const allReviewed = items.every((i) => !i.needsReview);
    onExtractionChange?.(allReviewed);
  }, [items, loading, isExtractingAll, onExtractionChange]);

  useEffect(() => {
    if (!isExtractingAll) return;
    const interval = setInterval(() => {
      fetchExtractions();
    }, 2000);
    return () => clearInterval(interval);
  }, [isExtractingAll, fetchExtractions]);

  useEffect(() => {
    if (isExtractingAll && items.length > 0 && items.every((i) => i.status !== "processing")) {
      onExtractionReady?.();
    }
  }, [isExtractingAll, items, onExtractionReady]);

  useEffect(() => {
    if (!isExtractingAll) return;
    const timeout = setTimeout(() => {
      onExtractionReady?.();
    }, 120_000);
    return () => clearTimeout(timeout);
  }, [isExtractingAll, onExtractionReady]);

  const handleAutoSave = useCallback(async (itemId: string, fieldKey: string, value: string) => {
    try {
      const token = await getTokenRef.current();
      if (!token) return;

      const res = await fetchWithClerkAuth(
        `/api/me/documents/${itemId}/extraction`,
        token,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field_id: fieldKey, value }),
        },
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error("Auto-save failed:", errBody);
        return;
      }

      // Update local items state to trigger completion re-evaluation.
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item;
          const updatedFields = item.fields.map((field) => {
            if (field.key !== fieldKey) return field;
            return { ...field, value, needsReview: false, confidence: 1.0 };
          });
          const anyNeedsReview = updatedFields.some((f) => f.needsReview);
          return { ...item, fields: updatedFields, needsReview: anyNeedsReview };
        }),
      );
    } catch (error) {
      console.error("Auto-save error:", error);
    }
  }, []);

  const processingItems = items.filter((i) => i.status === "processing");
  const doneItems = items.filter((i) => i.status !== "processing");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[28px] font-semibold tracking-tight text-slate-900">
          Review Extracted Data
        </h2>
        <p className="mt-1 max-w-2xl text-base text-slate-500">
          Our AI has extracted information from your uploaded documents. Please verify the accuracy of the fields below before continuing.
        </p>
      </div>

      {extractAllError && !isExtractingAll && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <FileSearch className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold">Some documents could not be extracted</p>
            <p className="text-xs text-red-700 mt-0.5">{extractAllError}</p>
          </div>
        </div>
      )}

      {loading && doneItems.length === 0 && processingItems.length === 0 && !isExtractingAll && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <Loader2 className="h-12 w-12 animate-spin" />
          <p className="text-sm font-medium">Loading extraction data...</p>
        </div>
      )}

      {!loading && items.length === 0 && !isExtractingAll && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <Database className="h-12 w-12" />
          <p className="text-sm font-medium">No extracted data available.</p>
          <p className="text-xs text-slate-500">
            Classify your documents first, then extraction can begin.
          </p>
        </div>
      )}

      {processingItems.length > 0 && (
        <div className="space-y-5">
          {processingItems.map((item) => (
            <div
              key={item.id}
              className="relative rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">
                    {item.fileName}
                  </p>
                  <p className="text-xs text-blue-700">
                    {item.documentTypeName} &mdash; Extracting data...
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {doneItems.length > 0 && (
        <div className="space-y-5">
          {doneItems.map((item) => (
            <ExtractionCard
              key={item.id}
              item={item}
              onAutoSave={handleAutoSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
