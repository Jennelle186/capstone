import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import CanvasToolbar from "./CanvasToolbar";

interface Props {
  previewUrl: string | null;
  studentName: string;
  studentNumber: string | null;
  scale: number;
  rotated: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotate: () => void;
  onReset: () => void;
  documentType: string;
}

export default function DocumentCanvas({
  previewUrl,
  studentName,
  studentNumber,
  scale,
  rotated,
  onZoomIn,
  onZoomOut,
  onRotate,
  onReset,
  documentType,
}: Props) {
  return (
    <section className="xl:col-span-7 h-full flex flex-col bg-slate-50 overflow-hidden relative border-r border-slate-200">
      <CanvasToolbar
        scale={scale}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onRotate={onRotate}
        onReset={onReset}
      />

      <div className="absolute top-4 right-4 z-10 hidden sm:flex items-center gap-2 bg-white/95 border border-slate-200 rounded-xl px-4 py-2 shadow-lg backdrop-blur-sm text-left max-w-[280px]">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-700 tracking-tight leading-none truncate max-w-[190px]">
            {studentName}
          </p>
          <p className="text-[9px] text-slate-500 font-semibold mt-0.5 tracking-tight">
            No. {studentNumber || "—"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 flex items-start justify-center relative">
        {previewUrl ? (
          <motion.div
            style={{
              scale,
              rotate: `${rotated}deg`,
              transformOrigin: "center top",
            }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="my-10 w-full max-w-4xl h-[85vh]"
          >
            <iframe
              src={previewUrl}
              className="w-full h-full rounded-lg border border-slate-200 bg-white shadow-xl"
              title="Document Preview"
            />
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Skeleton className="w-full max-w-3xl h-[80vh] rounded-xl bg-slate-100" />
            <p className="mt-4 text-xs text-slate-500 font-semibold">
              Loading {documentType} preview...
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
