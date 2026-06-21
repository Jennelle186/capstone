import { useState, useCallback } from "react";
import { Sparkles, Info, Pencil, Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import SubmissionStatusBadge from "@/components/adviser/ui/SubmissionStatusBadge";
import type { ExtractionSection, ExtractionField } from "@/components/common/document-detail/DocumentDetailModal";
import type { AdviserStudentSubmission } from "@/types/adviser-students";
import type { AdviserSubmissionStatus } from "@/types/adviser-dashboard";

interface Props {
  currentSubmission: AdviserStudentSubmission | null;
  currentExtractions: ExtractionSection[];
  activeSectionId: string;
  onSectionChange: (id: string) => void;
  onFieldChange: (key: string, value: string) => void;
  onSaveField: (fieldId: string, value: string) => void;
}

export default function ExtractionFieldEditor({
  currentSubmission,
  currentExtractions,
  activeSectionId,
  onSectionChange,
  onFieldChange,
  onSaveField,
}: Props) {
  if (!currentSubmission) return null;

  const docType = currentSubmission.document_type ?? "Unclassified";
  const isFlat = currentExtractions.length <= 1;

  return (
    <section className="xl:col-span-5 h-full flex flex-col bg-white overflow-hidden">
      <div className="p-5 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center justify-between">
          <SubmissionStatusBadge
            status={currentSubmission.status as AdviserSubmissionStatus}
          />
          <span className="text-[10px] font-mono font-bold text-slate-500">
            REF NO: {currentSubmission.id.slice(0, 8)}
          </span>
        </div>
        <h2 className="text-base font-black text-slate-900 tracking-tight mt-1.5 flex items-center gap-1.5">
          {docType}
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
        </h2>
      </div>

      {currentExtractions.length > 1 && !isFlat && (
        <div className="flex border-b border-slate-200 shrink-0 bg-slate-50 overflow-x-auto">
          {currentExtractions.map((sec) => (
            <button
              key={sec.title}
              onClick={() => onSectionChange(sec.title)}
              className={`px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap border-b-2 transition shrink-0 cursor-pointer ${
                activeSectionId === sec.title
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              {sec.title}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {currentExtractions.length > 0 ? (
          <>
            {isFlat ? (
              <div>
                <div className="bg-sky-50 p-3 rounded-xl border border-sky-100 flex items-start gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold text-slate-800 uppercase">
                      AI OCR FIELDS
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Edit fields if the scanner made an incorrect parsing error.
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  {currentExtractions[0]?.fields.map((field) => (
                    <FieldCard
                      key={field.label}
                      field={field}
                      value={field.value}
                      onChange={(v) => onFieldChange(field.label, v)}
                      onSave={(v) => onSaveField(field._raw?.id ?? field.label, v)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {(() => {
                  const activeSection = currentExtractions.find(
                    (s) => s.title === activeSectionId,
                  );
                  return (
                    <div>
                      <div className="bg-sky-50 p-3 rounded-xl border border-sky-100 flex items-start gap-2.5 mb-4">
                        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wide">
                            {activeSection?.title ?? "Fields"}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-normal font-medium">
                            Fields extracted by AI. Verify against physical form.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        {activeSection?.fields.map((field) => (
                          <FieldCard
                            key={field.label}
                            field={field}
                            value={field.value}
                            onChange={(v) => onFieldChange(field.label, v)}
                            onSave={(v) => onSaveField(field._raw?.id ?? field.label, v)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center p-8">
            <Sparkles className="h-8 w-8 text-slate-300 mb-3" />
            <p className="text-xs font-semibold text-slate-500">
              No extraction fields available for this document.
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Extractions may not have been processed yet.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function DisplayValue({ value, raw }: { value: string; raw?: ExtractionField["_raw"] }) {
  const isEmpty = value === "";
  const isMissing = isEmpty && raw?.required;

  if (isEmpty) {
    return (
      <span className={cn("text-sm font-semibold", isMissing ? "text-red-600" : "text-slate-400")}>
        {isMissing ? "[Missing]" : "—"}
      </span>
    );
  }

  if ((raw?.ui_component === "radio_group" || raw?.ui_component === "dropdown") && raw?.options) {
    const opt = raw.options.find((o) => o.value === value);
    return <span className="text-sm font-semibold text-slate-900">{opt?.label ?? value}</span>;
  }

  if (raw?.ui_component === "checkbox_group" && raw?.options) {
    const labels = value
      .split(",")
      .filter(Boolean)
      .map((v) => raw.options?.find((o) => o.value === v)?.label ?? v)
      .join(", ");
    return <span className="text-sm font-semibold text-slate-900">{labels}</span>;
  }

  return <span className="text-sm font-semibold text-slate-900">{value}</span>;
}

function FormFieldControl({
  raw,
  value,
  onChange,
}: {
  raw: NonNullable<ExtractionField["_raw"]>;
  value: string;
  onChange: (v: string) => void;
}) {
  switch (raw.ui_component) {
    case "dropdown":
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm font-medium px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
        >
          <option value="">Select...</option>
          {(raw.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case "radio_group":
      return (
        <div className="flex flex-col gap-2">
          {(raw.options ?? []).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`field_${raw.id}`}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-slate-700">{opt.label}</span>
            </label>
          ))}
        </div>
      );

    case "checkbox_group": {
      const selected = value ? value.split(",").filter(Boolean) : [];
      return (
        <div className="flex flex-col gap-2">
          {(raw.options ?? []).map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((v) => v !== opt.value)
                      : [...selected, opt.value];
                    onChange(next.join(","));
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-slate-700">{opt.label}</span>
              </label>
            );
          })}
        </div>
      );
    }

    case "date_picker":
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm font-medium px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
        />
      );

    default:
      return (
        <input
          type={raw.type === "number" || raw.type === "integer" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm font-medium px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
        />
      );
  }
}

function ConfidenceBadge({ confidence, needsReview }: { confidence: number; needsReview: boolean }) {
  if (!needsReview && confidence > 0.9) return null;

  if (needsReview) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
        <AlertTriangle className="h-2.5 w-2.5" />
        {Math.round(confidence * 100)}%
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
      <AlertTriangle className="h-2.5 w-2.5" />
      {Math.round(confidence * 100)}%
    </span>
  );
}

function FieldCard({
  field,
  value,
  onChange,
  onSave,
}: {
  field: ExtractionField;
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const raw = field._raw;

  const handleStartEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const handleSave = useCallback(() => {
    onChange(draft);
    onSave(draft);
    setEditing(false);
  }, [draft, onChange, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const confidence = raw?.confidence ?? 0;
  const needsReview = field.warning ?? false;

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
          {field.label}
        </label>
        <div className="flex items-center gap-1.5">
          <ConfidenceBadge confidence={confidence} needsReview={needsReview} />
        </div>
      </div>

      {editing ? (
        <div className="px-3 pb-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <FormFieldControl
              raw={raw ?? { id: field.label, key: field.label, type: "string", required: false, ui_component: null, options: null, confidence: 0 }}
              value={draft}
              onChange={setDraft}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition"
              >
                <Check className="h-3 w-3" />
                Save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-3 pb-3">
          <div
            className={cn(
              "group relative flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors cursor-pointer",
              needsReview && "border-amber-300 bg-amber-50",
              !needsReview && "border-slate-200 bg-white hover:border-slate-300",
            )}
            onClick={handleStartEdit}
          >
            <div className="flex-1 min-w-0">
              <DisplayValue value={value} raw={raw} />
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStartEdit();
              }}
              className="flex-shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
