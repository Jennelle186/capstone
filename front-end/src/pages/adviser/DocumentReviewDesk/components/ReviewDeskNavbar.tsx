import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, Sliders, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewDeskStats } from "../types";

interface Props {
  currentIndex: number;
  totalSubmissions: number;
  stats: ReviewDeskStats;
  autoAdvance: boolean;
  sidebarOpen: boolean;
  studentId: string;
  studentName: string;
  studentNumber: string | null;
  onPrev: () => void;
  onNext: () => void;
  onAutoAdvanceToggle: (v: boolean) => void;
  onSidebarToggle: () => void;
}

export default function ReviewDeskNavbar({
  currentIndex,
  totalSubmissions,
  stats,
  autoAdvance,
  sidebarOpen,
  studentId,
  studentName,
  studentNumber,
  onPrev,
  onNext,
  onAutoAdvanceToggle,
  onSidebarToggle,
}: Props) {
  const navigate = useNavigate();

  return (
    <nav className="h-16 shrink-0 border-b border-slate-200 px-4 md:px-6 flex items-center justify-between bg-white z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/adviser/students/${studentId}`)}
          className="p-1 px-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 font-semibold transition text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Exit Review Desk
        </button>

        <div className="hidden md:block h-6 w-px bg-slate-200" />

        <div className="hidden lg:flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sliders className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight block">
              {studentName}
            </p>
            <p className="text-[9px] text-slate-500 font-mono">{studentNumber ?? "—"}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 bg-slate-50 p-1 border border-slate-200 rounded-xl">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrev}
            disabled={currentIndex === 0}
            className="h-8 px-2 bg-white hover:bg-slate-50 border-slate-200 text-slate-600 rounded-lg cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="px-3 text-center">
            <span className="text-[10px] font-mono font-extrabold text-slate-700">
              {totalSubmissions > 0 ? currentIndex + 1 : 0}{" "}
              <span className="text-slate-400 font-normal">of</span>{" "}
              {totalSubmissions}
            </span>
            <p className="text-[9px] text-slate-400 font-semibold tracking-wider uppercase leading-none mt-0.5">
              Documents
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onNext}
            disabled={currentIndex === totalSubmissions - 1}
            className="h-8 px-2 bg-white hover:bg-slate-50 border-slate-200 text-slate-600 rounded-lg cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-xl text-slate-600">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-mono font-bold">
            {stats.verified}/{stats.total} Verified
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 cursor-pointer hover:text-slate-700 transition select-none">
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(e) => onAutoAdvanceToggle(e.target.checked)}
            className="rounded border-slate-300 bg-white text-primary focus:ring-primary h-3.5 w-3.5 accent-primary"
          />
          Auto-Jump Next Doc
        </label>

        <Button
          onClick={onSidebarToggle}
          variant="outline"
          size="sm"
          className="h-8 text-[10px] bg-white border-slate-200 font-bold text-slate-600 hover:text-slate-900"
        >
          {sidebarOpen ? "Hide Side Queue" : "Show Side Queue"}
        </Button>
      </div>
    </nav>
  );
}
