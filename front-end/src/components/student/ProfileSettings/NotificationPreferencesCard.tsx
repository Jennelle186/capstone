"use client";

import * as React from "react";
import { Bell, FileText, Mail, BellRing, MessageSquare, Megaphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  label: string;
  description: string;
  icon: typeof FileText;
};

const ITEMS: NotificationItem[] = [
  {
    id: "document-status",
    label: "Document Status Updates",
    description: "Get notified when your documents are verified or rejected.",
    icon: FileText,
  },
  {
    id: "adviser-feedback",
    label: "Adviser Feedback",
    description: "Receive alerts for new comments on your submitted documents.",
    icon: MessageSquare,
  },
  {
    id: "announcements",
    label: "Institutional Announcements",
    description: "Stay updated with university-wide news and policy changes.",
    icon: Megaphone,
  },
];

type NotificationPrefs = Record<string, boolean>;

export default function NotificationPreferencesCard() {
  const [channel, setChannel] = React.useState<"email" | "push">("email");
  const [prefs, setPrefs] = React.useState<NotificationPrefs>({
    "document-status": true,
    "adviser-feedback": true,
    announcements: false,
  });

  const toggle = (id: string) => {
    setPrefs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Notification Preferences</h3>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-5">
          {/* Channel selection */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setChannel("email")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all",
                channel === "email"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
              )}
            >
              <Mail className="h-4 w-4" />
              Email Notifications
            </button>
            <button
              type="button"
              onClick={() => setChannel("push")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all",
                channel === "push"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
              )}
            >
              <BellRing className="h-4 w-4" />
              Push Notifications
            </button>
          </div>

          {/* Toggle list */}
          <div className="space-y-2">
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const checked = prefs[item.id] ?? false;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between rounded-xl border p-4 transition-colors",
                    checked
                      ? "border-slate-200 hover:border-slate-300"
                      : "border-slate-100 hover:border-slate-200",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={checked}
                    onCheckedChange={() => toggle(item.id)}
                    className="ml-3 shrink-0"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
