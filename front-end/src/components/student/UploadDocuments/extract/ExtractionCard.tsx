"use client";

import { useMemo, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FileText,
  Image,
  User,
  AlertTriangle,
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
import { buildZodSchema, buildDefaultValues } from "@/lib/extraction-validation";
import type { ExtractionItem, ExtractedField } from "@/types/extraction";

interface ExtractionCardProps {
  item: ExtractionItem;
  onAutoSave: (itemId: string, fieldKey: string, value: string) => void;
}

interface SectionGroup {
  sectionId: string | null;
  sectionTitle: string | null;
  fields: ExtractedField[];
}

function groupBySection(fields: ExtractedField[]): SectionGroup[] {
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

function CardConfidenceBadge({ label, needsReview }: { label: string; needsReview: boolean }) {
  if (!needsReview && label === "high") return null;
  if (needsReview) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-semibold text-red-600">
        <AlertTriangle className="h-3 w-3" />
        Needs Review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600">
      <AlertTriangle className="h-3 w-3" />
      Low Confidence
    </span>
  );
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

export default function ExtractionCard({ item, onAutoSave }: ExtractionCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);

  const sections = useMemo(() => groupBySection(item.fields), [item.fields]);

  const zodSchema = useMemo(() => buildZodSchema(item.fields), [item.fields]);
  const defaultValues = useMemo(() => buildDefaultValues(item.fields), [item.fields]);

  const form = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues,
    mode: "onBlur",
  });

  const needsReview = item.needsReview;

  const handleAutoSave = (fieldKey: string, value: string) => {
    onAutoSave(item.id, fieldKey, value);
  };

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (sid: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const formContent = (
    <div className="space-y-6">
      {sections.map((section) => {
        const sid = section.sectionId ?? "__nosection__";
        const isCollapsed = collapsedSections.has(sid);
        return (
          <div key={sid}>
            {section.sectionId && (
              <button
                type="button"
                onClick={() => toggleSection(sid)}
                className="mb-3 flex w-full cursor-pointer items-center gap-2 border-b pb-2 text-left"
              >
                {isCollapsed
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90 transition-transform" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                }
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {section.sectionTitle ?? section.sectionId}
                </h4>
              </button>
            )}
            {!isCollapsed && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.fields.map((field) => (
                  <ExtractionField
                    key={field.id}
                    field={field}
                    onAutoSave={handleAutoSave}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div
        className={cn(
          "relative rounded-2xl border bg-white p-6 shadow-sm transition-all hover:shadow-md",
          needsReview ? "border-red-300" : "border-slate-200",
        )}
      >
        {needsReview && (
          <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-red-500" />
        )}

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
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
                  <p className="text-xs font-medium tracking-wide text-slate-500">
                    {item.documentTypeName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CardConfidenceBadge label={item.confidenceLabel} needsReview={needsReview} />
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

          <CollapsibleContent>
            <FormProvider {...form}>
              <form>{formContent}</form>
            </FormProvider>
          </CollapsibleContent>
        </Collapsible>
      </div>

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
              <CardConfidenceBadge label={item.confidenceLabel} needsReview={needsReview} />
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
            <FormProvider {...form}>
              <form>{formContent}</form>
            </FormProvider>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
