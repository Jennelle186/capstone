import { ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotate: () => void;
  onReset: () => void;
}

export default function CanvasToolbar({
  scale,
  onZoomIn,
  onZoomOut,
  onRotate,
  onReset,
}: Props) {
  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-white/90 border border-slate-200 rounded-xl px-3 py-1.5 shadow-lg backdrop-blur-sm">
      <Button
        variant="outline"
        size="sm"
        onClick={onZoomOut}
        className="h-7 w-7 p-0 border-slate-200 hover:bg-slate-100"
        title="Zoom Out"
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <span className="text-[10px] font-mono font-bold text-slate-500 w-12 text-center select-none">
        {Math.round(scale * 100)}%
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onZoomIn}
        className="h-7 w-7 p-0 border-slate-200 hover:bg-slate-100"
        title="Zoom In"
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onRotate}
        className="h-7 w-7 p-0 border-slate-200 hover:bg-slate-100"
        title="Rotate 90°"
      >
        <RotateCw className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onReset}
        className="text-[9px] px-2 h-7 border-slate-200 hover:bg-slate-100 font-bold"
      >
        Reset
      </Button>
    </div>
  );
}
