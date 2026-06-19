import * as React from "react";
import { X, Bot, CheckCircle, AlertTriangle, ZoomIn, ZoomOut, Download, Printer, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export interface ExtractionField {
  label: string;
  value: string;
  verified: boolean;
  confidence?: string;
  warning?: boolean;
}

export interface ExtractionSection {
  title: string;
  fields: ExtractionField[];
}

export interface DocumentDetailItem {
  id: string;
  title: string;
  subtitle: string;
  metaLines: string[];
  initials: string;
  avatarColor: string;
  statusLabel: string;
  statusBadge: string;
  statusDot: string;
  extractionSections: ExtractionSection[];
  studentId?: string;
}

interface Props {
  item: DocumentDetailItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  footer: React.ReactNode;
  previewUrl?: string;
  navigation?: React.ReactNode;
}

const defaultSections: ExtractionSection[] = [
  {
    title: "Extracted Fields",
    fields: [
      { label: "Document Number", value: "TRN-2023-X992", verified: true },
      { label: "Institution", value: "Stanford Global Institute", verified: true },
      { label: "Issue Date", value: "October 12, 2023", verified: true },
      { label: "Cumulative GPA", value: "3.92/4.00", verified: false, confidence: "68%", warning: true },
    ],
  },
];

function PreviewSkeleton() {
  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden w-full mx-auto">
      <div className="p-5 sm:p-8 min-h-[300px] sm:min-h-[500px] relative">
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 sm:pb-6 mb-4 sm:mb-6">
          <div className="space-y-2">
            <div className="h-5 w-40 sm:w-64 bg-slate-900 rounded" />
            <div className="h-3.5 w-32 sm:w-48 bg-slate-400 rounded" />
          </div>
          <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-slate-900 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shrink-0">
            LOGO
          </div>
        </div>
        <div className="space-y-4 sm:space-y-6">
          <div className="h-6 sm:h-7 w-1/2 bg-slate-200 rounded mx-auto mb-4 sm:mb-8" />
          <div className="grid grid-cols-3 gap-3 sm:gap-6 mb-4 sm:mb-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3.5 bg-slate-100 rounded" />
                <div className="h-3 w-1/2 bg-slate-50 rounded" />
              </div>
            ))}
          </div>
          <div className="border border-slate-200 rounded-lg p-3 sm:p-5 space-y-2 sm:space-y-3">
            <div className="h-3.5 bg-slate-100 rounded w-full" />
            <div className="h-3.5 bg-slate-100 rounded w-full" />
            <div className="h-3.5 bg-slate-100 rounded w-3/4" />
            <div className="h-3.5 bg-slate-100 rounded w-5/6" />
            <div className="h-3.5 bg-slate-100 rounded w-2/3" />
          </div>
          <div className="flex justify-between items-end pt-4 sm:pt-6 mt-4 sm:mt-6 border-t border-slate-200">
            <div className="w-20 sm:w-28 h-12 sm:h-14 border-b border-slate-900" />
            <div className="w-20 sm:w-28 h-12 sm:h-14 bg-slate-100 flex items-center justify-center text-[10px] sm:text-xs text-slate-400 italic">
              Official Seal
            </div>
          </div>
        </div>
        <div className="absolute top-[200px] sm:top-[260px] left-4 sm:left-10 w-32 sm:w-44 h-7 sm:h-8 border-2 border-primary/40 bg-primary/5 rounded flex items-center justify-end pr-1 animate-pulse">
          <span className="text-[10px] font-bold text-primary bg-white px-1 border border-primary">98% Match</span>
        </div>
      </div>
    </div>
  );
}

export default function DocumentDetailModal({ item, open, onOpenChange, footer, previewUrl, navigation }: Props) {
  const [previewOpen, setPreviewOpen] = React.useState(true);
  const [aiOpen, setAiOpen] = React.useState(true);
  const sections = item?.extractionSections ?? defaultSections;
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  function renderFields(fields: ExtractionField[]) {
    return fields.map((field, i) => (
      <div key={i} className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {field.label}
        </label>
        <div className="relative">
          <input
            className={`w-full bg-slate-50 border rounded-lg text-sm font-medium py-2 pr-9 focus:outline-none focus:ring-2 px-3 transition-colors ${
              field.warning
                ? "border-amber-200 focus:ring-amber-400 focus:border-amber-400"
                : "border-slate-200 focus:ring-primary focus:border-primary"
            }`}
            value={field.value}
            readOnly
          />
          {field.verified ? (
            <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
          ) : (
            <AlertTriangle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500 animate-pulse" />
          )}
        </div>
        {field.warning && (
          <p className="text-[10px] font-semibold text-amber-600">
            Needs Review ({field.confidence} Confidence)
          </p>
        )}
      </div>
    ));
  }

  function renderSection(section: ExtractionSection) {
    const isCollapsed = collapsedSections[section.title] ?? false;
    return (
      <div key={section.title}>
        <button
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-colors mb-2"
          onClick={() => toggleSection(section.title)}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
          {section.title}
        </button>
        {!isCollapsed && (
          <div className="space-y-3">
            {renderFields(section.fields)}
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-0.5rem)] sm:max-w-none sm:w-[calc(100%-2rem)] sm:max-w-5xl xl:max-w-6xl h-[95vh] sm:h-[90vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 flex flex-row items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {item && (
              <div
                className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full text-xs font-bold shrink-0 ${item.avatarColor}`}
              >
                {item.initials}
              </div>
            )}
            <div className="min-w-0">
              <DialogTitle className="text-base sm:text-lg font-semibold text-slate-900 truncate text-left">
                {item?.title ?? "Document Details"}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                {item ? (
                  <>
                    <span>{item.subtitle}</span>
                    {item.metaLines.map((line, i) => (
                      <span key={i}>&bull; {line}</span>
                    ))}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${item.statusBadge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${item.statusDot}`} />
                      {item.statusLabel}
                    </span>
                  </>
                ) : (
                  <span>No document selected</span>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full hover:bg-slate-100 transition-transform hover:rotate-90"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Mobile collapsible: Preview */}
          <div className="flex flex-col md:hidden border-b border-slate-200">
            <button
              className="flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              onClick={() => setPreviewOpen(!previewOpen)}
            >
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Document Preview</span>
              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${previewOpen ? "" : "-rotate-90"}`} />
            </button>
            {previewOpen && <div className="bg-slate-100 p-4">{previewUrl ? <iframe src={previewUrl} className="w-full h-full min-h-[300px] rounded-lg border-0" title="Document Preview" /> : <PreviewSkeleton />}</div>}
          </div>

          {/* Desktop: Preview */}
          <div className="hidden md:block flex-1 bg-slate-100 p-6 overflow-y-auto">
            {previewUrl ? (
              <iframe src={previewUrl} className="w-full h-full min-h-[500px] rounded-lg border-0" title="Document Preview" />
            ) : (
              <PreviewSkeleton />
            )}
          </div>

          {/* Mobile collapsible: AI Extractions */}
          <div className="flex flex-col md:hidden border-b border-slate-200">
            <button
              className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
              onClick={() => setAiOpen(!aiOpen)}
            >
              <span className="text-xs font-bold uppercase tracking-wider text-primary">AI Extractions</span>
              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${aiOpen ? "" : "-rotate-90"}`} />
            </button>
            {aiOpen && (
              <div className="p-4 space-y-4 border-t border-slate-100">
                {sections.map(renderSection)}
              </div>
            )}
          </div>

          {/* Desktop: AI Extractions */}
          <div className="hidden md:flex w-72 lg:w-80 border-l border-slate-200 bg-white flex-col shrink-0">
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-1">
                <Bot className="h-4 w-4 text-primary" />
                <h5 className="text-xs font-bold uppercase tracking-wider text-primary">AI Extractions</h5>
              </div>
              <p className="text-xs text-slate-500">
                Automatic data points extracted and verified against institutional records.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {sections.map(renderSection)}
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 space-y-2">
              {footer}
            </div>
          </div>
        </div>

        {/* Bottom toolbar - desktop only */}
        <DialogFooter className="hidden sm:flex shrink-0 items-center justify-between px-6 py-2.5 border-t border-slate-200 bg-white flex-row">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-500 hover:text-primary">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium text-slate-600 min-w-[40px] text-center">100%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-500 hover:text-primary">
              <ZoomIn className="h-4 w-4" />
            </Button>
            {navigation && (
              <>
                <div className="h-4 w-px bg-slate-200 mx-1" />
                {navigation}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-slate-500 hover:text-primary gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
            <Button variant="ghost" size="sm" className="text-slate-500 hover:text-primary gap-1.5 text-xs">
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
