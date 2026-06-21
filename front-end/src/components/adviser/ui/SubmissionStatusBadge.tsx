import { adviserStatusConfig, type AdviserSubmissionStatus } from "@/types/adviser-dashboard";

interface Props {
  status: AdviserSubmissionStatus;
}

export default function SubmissionStatusBadge({ status }: Props) {
  const config = adviserStatusConfig[status];
  if (!config) return <span className="text-xs text-slate-500">{status}</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${config.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
