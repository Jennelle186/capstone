import { Megaphone, CalendarDays, FileText, ShieldCheck } from "lucide-react";

interface Announcement {
  id: string;
  icon: typeof Megaphone;
  title: string;
  message: string;
  date: string;
  color: string;
  bg: string;
}

const announcements: Announcement[] = [
  {
    id: "1",
    icon: FileText,
    title: "New Document Requirement",
    message: "Your adviser has added a Certificate of Enrolment to your required documents. Please upload a scanned copy before the deadline.",
    date: "2 days ago",
    color: "text-blue-600",
    bg: "bg-blue-100",
  },
  {
    id: "2",
    icon: ShieldCheck,
    title: "Transcript Verified",
    message: "Your Official University Transcript has been successfully verified by the adviser. No further action needed.",
    date: "5 days ago",
    color: "text-emerald-600",
    bg: "bg-emerald-100",
  },
  {
    id: "3",
    icon: CalendarDays,
    title: "Upcoming Deadline",
    message: "All enrolment documents must be submitted by August 15, 2025. You currently have 3 pending requirements.",
    date: "1 week ago",
    color: "text-amber-600",
    bg: "bg-amber-100",
  },
];

export default function AnnouncementBar() {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-slate-500" />
        <h3 className="text-base font-semibold text-slate-900">Announcements from your Adviser</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {announcements.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
              <span className={`${item.bg} ${item.color} p-2 rounded-full shrink-0 mt-0.5`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <span className="text-xs text-slate-400 shrink-0">{item.date}</span>
                </div>
                <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">{item.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
