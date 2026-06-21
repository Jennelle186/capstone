import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router";

interface Props {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
}

export default function PageHeader({ title, subtitle, backTo, backLabel }: Props) {
  const navigate = useNavigate();
  return (
    <div className="space-y-1">
      {backTo && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-slate-600 hover:text-slate-900 -ml-2"
          onClick={() => navigate(backTo)}
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel ?? "Back"}
        </Button>
      )}
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}
