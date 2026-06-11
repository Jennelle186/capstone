"use client";

import * as React from "react";
import {
  FileText,
  Image,
  User,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronDown,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ExtractionField from "@/components/student/UploadDocuments/extract/ExtractionField";
import type { ExtractionItem, ExtractedField } from "@/types/extraction";

interface ExtractionCardProps {
  item: ExtractionItem;
  onFieldChange: (itemId: string, fieldId: string, value: string) => void;
}

function ConfidenceBadge({
  label,
  needsReview,
}: {
  label: string;
  needsReview: boolean;
}) {
  if (needsReview) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-[10px] font-bold uppercase text-red-700">
        <AlertTriangle className="h-3 w-3" />
        Needs Review
      </span>
    );
  }

  switch (label) {
    case "high":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold uppercase text-emerald-700">
          <CheckCircle className="h-3 w-3" />
          High Confidence
        </span>
      );
    case "medium":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-[10px] font-bold uppercase text-sky-700">
          <Info className="h-3 w-3" />
          Medium Confidence
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase text-slate-600">
          Pending
        </span>
      );
  }
}

function DocumentIcon({ fileName, needsReview }: { fileName: string; needsReview: boolean }) {
  if (needsReview) {
    return <AlertTriangle className="h-5 w-5 text-red-500" />;
  }

  const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fileName);
  if (isImage) return <Image className="h-5 w-5 text-primary" />;

  const isLetter = /letter/i.test(fileName);
  if (isLetter) return <User className="h-5 w-5 text-primary" />;

  return <FileText className="h-5 w-5 text-primary" />;
}

function FieldsGrid({
  fields,
  cardNeedsReview,
  onFieldChange,
  compact,
}: {
  fields: ExtractedField[];
  cardNeedsReview: boolean;
  onFieldChange: (fieldId: string, value: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {fields.map((field) => (
        <ExtractionField
          key={field.id}
          field={field}
          cardNeedsReview={cardNeedsReview}
          onFieldChange={onFieldChange}
        />
      ))}
    </div>
  );
}

export default function ExtractionCard({ item, onFieldChange }: ExtractionCardProps) {
  const [isOpen, setIsOpen] = React.useState(true);
  const [isMaximized, setIsMaximized] = React.useState(false);

  const handleFieldChange = (fieldId: string, value: string) => {
    onFieldChange(item.id, fieldId, value);
  };

  const needsReview = item.needsReview;

  return (
    <>
      <div
        className={cn(
          "relative rounded-2xl border bg-white p-6 shadow-sm transition-all hover:shadow-md",
          needsReview ? "border-red-300" : "border-slate-200",
        )}
      >
        {/* Left accent bar */}
        {needsReview && (
          <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-red-500" />
        )}

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          {/* Card header — clickable trigger */}
          <CollapsibleTrigger asChild>
            <div className="mb-5 flex cursor-pointer items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    needsReview ? "bg-red-50" : "bg-slate-100",
                  )}
                >
                  <DocumentIcon fileName={item.fileName} needsReview={needsReview} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {item.fileName}
                  </h3>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {item.documentTypeName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ConfidenceBadge label={item.confidenceLabel} needsReview={needsReview} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMaximized(true);
                  }}
                  title="Maximize view"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-slate-400 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </div>
            </div>
          </CollapsibleTrigger>

          {/* Fields grid (collapsible) */}
          <CollapsibleContent>
            <FieldsGrid
              fields={item.fields}
              cardNeedsReview={needsReview}
              onFieldChange={handleFieldChange}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Maximized dialog */}
      <Dialog open={isMaximized} onOpenChange={setIsMaximized}>
        <DialogContent className="flex max-h-[90vh] w-[90vw] flex-col gap-0 !max-w-[90vw] p-0">
          <DialogHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
            <DialogTitle className="text-base font-semibold text-slate-900">
              {item.fileName}
              <span className="ml-2 text-sm font-normal text-slate-500">
                — {item.documentTypeName}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <ConfidenceBadge label={item.confidenceLabel} needsReview={needsReview} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsMaximized(false)}
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6">
            <FieldsGrid
              fields={item.fields}
              cardNeedsReview={needsReview}
              onFieldChange={handleFieldChange}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
